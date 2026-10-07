"""Общий темп отправки бота (bot/pacing.py): ответ Telegram «слишком часто» (429)
останавливает всю отправку на время, которое просит Telegram."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from aiogram.exceptions import TelegramRetryAfter
from aiogram.methods import SendMessage

from bot import broadcasts as bot_broadcasts
from bot.pacing import Pacer
from backend.audience import parse_audience


def test_pause_holds_every_sender() -> None:
    async def run() -> list[float]:
        pacer = Pacer(1000)
        loop = asyncio.get_running_loop()
        start = loop.time()
        pacer.pause(0.2)
        moments: list[float] = []

        async def send() -> None:
            await pacer.wait()
            moments.append(loop.time() - start)

        await asyncio.gather(*(send() for _ in range(3)))
        return moments

    moments = asyncio.run(run())
    assert all(moment >= 0.19 for moment in moments)


class _LimitedBot:
    """Бот, которому Telegram первый раз отвечает 429 («подождите 1 с»)."""

    def __init__(self) -> None:
        self.calls = 0

    async def send_message(self, chat_id: int, text: str, reply_markup=None) -> None:
        self.calls += 1
        if self.calls == 1:
            raise TelegramRetryAfter(
                SendMessage(chat_id=chat_id, text=text), "Too Many Requests", retry_after=1
            )


def test_broadcast_waits_for_telegram_and_retries() -> None:
    job = bot_broadcasts._Job(
        id=1, created_by=1, audience=parse_audience(""),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc), text="Привет",
        media_type=None, media_file_id=None, button=None, cursor=0,
    )

    async def run() -> tuple[str, float, float]:
        bot = _LimitedBot()
        pacer = Pacer(1000)
        loop = asyncio.get_running_loop()
        start = loop.time()
        outcome = await bot_broadcasts._send(bot, pacer, job, 2, None)  # type: ignore[arg-type]
        elapsed = loop.time() - start
        # Пока Telegram просил ждать, следующему отправителю места тоже не было.
        await pacer.wait()
        return outcome, elapsed, bot.calls

    outcome, elapsed, calls = asyncio.run(run())
    assert (outcome, calls) == ("sent", 2)
    assert elapsed >= 0.99
