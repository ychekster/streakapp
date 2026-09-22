"""Общий темп отправки сообщений бота: всем вместе — не больше `SEND_RATE` в секунду.

Напоминания (bot/reminders.py) и рассылки (bot/broadcasts.py) отправляет один процесс с
одним лимитом Bot API (около 30 сообщений в секунду на бота), поэтому «метроном» у них
общий: у каждого свой — вдвоём они бы лимит превысили. Места выдаются в порядке
обращений, а рассылка занимает их по одному на получателя, поэтому напоминания минуты
не ждут конца рассылки — они встают в очередь вперемешку с ней.
"""

from __future__ import annotations

import asyncio

# Сообщений в секунду всем пользователям вместе — с запасом ниже лимита Bot API (~30).
SEND_RATE = 25


class Pacer:
    """Выдаёт моменты отправки не чаще `rate` в секунду — в порядке обращений."""

    def __init__(self, rate: float) -> None:
        self._interval = 1 / rate
        self._next = 0.0

    async def wait(self) -> None:
        loop = asyncio.get_running_loop()
        now = loop.time()
        # Место в очереди занимается сразу, до ожидания: следующий обратившийся встанет за ним.
        slot = max(now, self._next)
        self._next = slot + self._interval
        if slot > now:
            await asyncio.sleep(slot - now)
