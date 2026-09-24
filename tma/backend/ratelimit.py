"""Ограничение частоты запросов одного пользователя (token bucket).

У каждого пользователя — «ведро» на `burst` запросов, которое пополняется со
скоростью `per_second` в секунду. Обычному пользователю этого хватает с большим
запасом (приложение при открытии делает несколько запросов, отметки и поиск — по
одному на действие); скрипт, заваливающий API запросами от имени одного аккаунта,
упирается в лимит и получает 429, не нагружая базу и сервер для остальных.

Ключ — проверенный id Telegram (см. dependencies.get_current_user), а не IP: за
обратным прокси и туннелем все запросы приходят с одного адреса. Состояние — в памяти
процесса: при нескольких воркерах лимит действует в каждом отдельно.
"""

from __future__ import annotations

import math
import time

# Когда вёдер становится больше, из памяти убираются полные (давно неактивные).
_MAX_TRACKED_KEYS = 10_000


class RateLimiter:
    """Token bucket на ключ. `burst == 0` или `per_second == 0` — без ограничения."""

    def __init__(self, burst: int, per_second: float) -> None:
        self._capacity = float(burst)
        self._rate = per_second
        # Ключ → (токены, момент последнего обновления по time.monotonic()).
        self._buckets: dict[int, tuple[float, float]] = {}

    @property
    def enabled(self) -> bool:
        return self._capacity > 0 and self._rate > 0

    def acquire(self, key: int) -> float:
        """Потратить токен ключа. 0 — запрос разрешён; иначе — через сколько секунд
        появится следующий токен (для заголовка Retry-After)."""
        if not self.enabled:
            return 0.0
        now = time.monotonic()
        tokens, updated = self._buckets.get(key, (self._capacity, now))
        tokens = min(self._capacity, tokens + (now - updated) * self._rate)
        if tokens < 1:
            self._buckets[key] = (tokens, now)
            return (1 - tokens) / self._rate
        self._buckets[key] = (tokens - 1, now)
        if len(self._buckets) > _MAX_TRACKED_KEYS:
            self._forget_full(now)
        return 0.0

    def _forget_full(self, now: float) -> None:
        """Убрать вёдра, которые уже пополнились доверху: они не отличаются от новых."""
        refill_time = self._capacity / self._rate
        self._buckets = {
            key: state for key, state in self._buckets.items() if now - state[1] < refill_time
        }


def retry_after_header(seconds: float) -> dict[str, str]:
    """Заголовок Retry-After (целые секунды, не меньше одной)."""
    return {"Retry-After": str(max(1, math.ceil(seconds)))}
