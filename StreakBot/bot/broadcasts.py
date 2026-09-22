"""Рассылки из админ-панели: API ставит их в очередь (таблица `broadcasts`), бот рассылает.

Раз в `POLL_SECONDS` бот берёт самую раннюю неразосланную рассылку и отправляет её
получателям сегмента по возрастанию id — пачками по `BATCH_SIZE`, параллельно внутри
пачки и в общем темпе с напоминаниями (bot/pacing.py). После каждой пачки в базе
запоминаются курсор (id последнего получателя пачки) и счётчики, поэтому после
перезапуска рассылка продолжается с того же места; пачка, прерванная посередине, может
прийти части своих получателей повторно.

Получатели считаются на момент создания рассылки (`created_at`): сегмент «активные за 7
дней» не расползается, пока идёт долгая рассылка. Автору рассылки её копия уже пришла
от API — ему повторно не отправляется. Заблокировавшие бота отмечаются в базе и
следующих рассылок не получают.

Медиа уже загружено в Telegram (при отправке копии автору), поэтому фото и видео
рассылаются по file_id — без повторной загрузки файла.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramRetryAfter
from loguru import logger

from bot.pacing import Pacer
from tma.backend.database import Database
from tma.backend.models import Broadcast
from tma.backend.repository import Repository

# Как часто проверять, нет ли новой рассылки, в секундах.
POLL_SECONDS = 3.0
# Получателей в пачке: после каждой прогресс сохраняется в базе.
BATCH_SIZE = 25

_Outcome = Literal["sent", "blocked", "failed"]


@dataclass(frozen=True)
class _Job:
    """Что и кому рассылать — снимок строки `broadcasts` (сессия на время отправки
    закрыта)."""

    id: int
    created_by: int
    segment: str
    created_at: datetime
    text: str | None
    media_type: str | None
    media_file_id: str | None
    cursor: int

    @classmethod
    def of(cls, broadcast: Broadcast) -> _Job:
        return cls(
            id=broadcast.id,
            created_by=broadcast.created_by,
            segment=broadcast.segment,
            created_at=broadcast.created_at,
            text=broadcast.text,
            media_type=broadcast.media_type,
            media_file_id=broadcast.media_file_id,
            cursor=broadcast.cursor,
        )


async def run_broadcasts(bot: Bot, database: Database, pacer: Pacer) -> None:
    """Бесконечный цикл: разослать поставленные в очередь рассылки.

    Ошибка (база недоступна и т.п.) логируется и не останавливает цикл — рассылка
    продолжится со следующей проверки; остановить цикл можно только отменой задачи.
    """
    logger.info("Broadcasts started")
    while True:
        try:
            while await _deliver_next_batch(bot, database, pacer):
                pass
        except Exception:  # noqa: BLE001 — цикл рассылок не должен падать
            logger.exception("Broadcast delivery failed")
        await asyncio.sleep(POLL_SECONDS)


async def _deliver_next_batch(bot: Bot, database: Database, pacer: Pacer) -> bool:
    """Отправить следующую пачку самой ранней неразосланной рассылки. False — рассылать
    нечего."""
    # Сессии — только на чтение очереди и на запись итогов: отправка по сети не держит
    # соединение с базой.
    async with database.session_factory() as session:
        repo = Repository(session)
        broadcast = await repo.next_broadcast()
        if broadcast is None:
            return False
        job = _Job.of(broadcast)
        recipients = await repo.recipients_after(
            job.segment, job.created_at, job.created_by, job.cursor, BATCH_SIZE
        )
        if not recipients:
            await repo.finish_broadcast(broadcast)
            await session.commit()
            logger.info(
                "Broadcast {} done: {} sent, {} failed", job.id, broadcast.sent, broadcast.failed
            )
            return True

    outcomes = await asyncio.gather(*(_send(bot, pacer, job, chat_id) for chat_id in recipients))
    blocked = [chat_id for chat_id, outcome in zip(recipients, outcomes) if outcome == "blocked"]

    async with database.session_factory() as session:
        repo = Repository(session)
        broadcast = await repo.get_broadcast(job.id)
        if broadcast is None:  # рассылку удалили из базы вручную
            return True
        sent = outcomes.count("sent")
        await repo.record_broadcast_progress(
            broadcast, cursor=recipients[-1], sent=sent, failed=len(outcomes) - sent
        )
        if blocked:
            await repo.set_bot_blocked(blocked, blocked=True)
        await session.commit()
    return True


async def _send(bot: Bot, pacer: Pacer, job: _Job, chat_id: int) -> _Outcome:
    """Отправить рассылку одному получателю; сбой логируется и не мешает остальным."""
    try:
        await pacer.wait()
        try:
            await _send_content(bot, job, chat_id)
        except TelegramRetryAfter as exc:
            # Упёрлись в лимит Telegram — подождать, сколько просят, и повторить один раз.
            await asyncio.sleep(exc.retry_after)
            await pacer.wait()
            await _send_content(bot, job, chat_id)
    except TelegramForbiddenError:
        return "blocked"
    except TelegramAPIError as exc:
        logger.warning("Broadcast {} not delivered to user {}: {}", job.id, chat_id, exc)
        return "failed"
    return "sent"


async def _send_content(bot: Bot, job: _Job, chat_id: int) -> None:
    """Текст, фото или видео рассылки (медиа — по file_id, с подписью или без)."""
    if job.media_type == "photo" and job.media_file_id:
        await bot.send_photo(chat_id=chat_id, photo=job.media_file_id, caption=job.text)
    elif job.media_type == "video" and job.media_file_id:
        await bot.send_video(
            chat_id=chat_id,
            video=job.media_file_id,
            caption=job.text,
            supports_streaming=True,
        )
    else:
        await bot.send_message(chat_id=chat_id, text=job.text or "")
