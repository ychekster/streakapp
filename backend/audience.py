"""Фильтры пользователей админ-панели: кого показать в списке пользователей и кому
отправить рассылку.

Фильтр — набор условий «признак: значение» (признаки и значения —
constants.AUDIENCE_FILTERS), условия складываются через «и». В запросе и в базе фильтр —
строка «признак:значение» через запятую («app:opened,habits:any»), пустая — все
пользователи. Здесь она разбирается и проверяется; условие SQL по фильтру строит
репозиторий (`Repository` — `_audience_condition`).
"""

from __future__ import annotations

from backend.constants import (
    AUDIENCE_FILTERS,
    AUDIENCE_MAX_LENGTH,
    BROADCAST_EXCLUDED_FILTERS,
)
from backend.errors import ApiError

# Разобранный фильтр: признак → значение.
Audience = dict[str, str]


def _invalid(message: str) -> ApiError:
    return ApiError(422, "invalid_filter", message)


def parse_audience(value: str | None, *, broadcast: bool = False) -> Audience:
    """Разобрать строку фильтра. Неизвестный признак или значение, повтор признака — 422
    `invalid_filter`; у рассылки (`broadcast`) — и признаки, которых у неё нет
    (constants.BROADCAST_EXCLUDED_FILTERS)."""
    text = (value or "").strip()
    if len(text) > AUDIENCE_MAX_LENGTH:
        raise _invalid("Слишком длинный фильтр")
    audience: Audience = {}
    for part in filter(None, (item.strip() for item in text.split(","))):
        key, _, option = part.partition(":")
        if key not in AUDIENCE_FILTERS or option not in AUDIENCE_FILTERS[key]:
            raise _invalid(f"Неизвестный фильтр: {part[:40]}")
        if broadcast and key in BROADCAST_EXCLUDED_FILTERS:
            raise _invalid(f"Этот фильтр недоступен для рассылки: {key}")
        if key in audience:
            raise _invalid(f"Фильтр повторяется: {key}")
        audience[key] = option
    return audience


def audience_key(audience: Audience) -> str:
    """Строка фильтра в едином виде: признаки в порядке constants.AUDIENCE_FILTERS."""
    return ",".join(f"{key}:{audience[key]}" for key in AUDIENCE_FILTERS if key in audience)
