"""Напоминания о привычках: в заданное время бот пишет в чат «🔔 Пора выполнить «…»».

Время напоминания пользователь задаёт в Mini App, хранит его API (`tasks.reminder_time`,
в поясе пользователя). Раз в минуту бот спрашивает у базы, чьё время наступило
(`tma.backend.services.due_reminders`): напоминание приходит только в запланированные
дни и только пока привычка за этот день не отмечена.

Опрос базы, а не расписание в памяти: привычки меняет другой процесс (API), и так
изменения подхватываются сразу, без синхронизации. Каждая минута обрабатывается один
раз; если цикл отстал (долгая отправка, пауза процесса), пропущенные минуты досылаются,
но не дальше `CATCH_UP_LIMIT` назад. При старте обрабатывается и текущая минута, поэтому
перезапуск бота ровно в минуту напоминания может прислать его повторно — зато не теряет.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramRetryAfter
from loguru import logger

from bot.constants import REMINDER_TEXT
from tma.backend.database import Database
from tma.backend.repository import Repository
from tma.backend.services import DueReminder, due_reminders

_MINUTE = timedelta(minutes=1)

# Насколько назад досылать пропущенные минуты: напоминание, опоздавшее сильнее, уже
# неуместно.
CATCH_UP_LIMIT = timedelta(minutes=5)


def _current_minute() -> datetime:
    """Начало текущей минуты (UTC)."""
    return datetime.now(timezone.utc).replace(second=0, microsecond=0)


async def run_reminders(bot: Bot, database: Database) -> None:
    """Бесконечный цикл: в начале каждой минуты прислать наступившие напоминания.

    Ошибки одной минуты (база недоступна и т.п.) логируются и не останавливают цикл;
    остановить его можно только отменой задачи.
    """
    logger.info("Reminders started")
    last_processed = _current_minute() - _MINUTE
    while True:
        now = _current_minute()
        minute = max(last_processed + _MINUTE, now - CATCH_UP_LIMIT)
        while minute <= now:
            try:
                await _send_due(bot, database, minute)
            except Exception:  # noqa: BLE001 — цикл напоминаний не должен падать
                logger.exception("Reminders for {} failed", minute)
            last_processed = minute
            minute += _MINUTE
        next_minute = _current_minute() + _MINUTE
        await asyncio.sleep((next_minute - datetime.now(timezone.utc)).total_seconds())


async def _send_due(bot: Bot, database: Database, minute: datetime) -> None:
    """Прислать напоминания, время которых — `minute`."""
    # Сессия только на чтение и закрывается до отправки: сеть не держит соединение с БД.
    async with database.session_factory() as session:
        reminders = await due_reminders(Repository(session), minute)
    for reminder in reminders:
        await _send(bot, reminder)


async def _send(bot: Bot, reminder: DueReminder) -> None:
    """Отправить одно напоминание; сбой доставки логируется и не мешает остальным."""
    text = REMINDER_TEXT.format(name=reminder.habit_name)
    try:
        try:
            await bot.send_message(chat_id=reminder.user_id, text=text)
        except TelegramRetryAfter as exc:
            # Упёрлись в лимит Telegram — подождать, сколько просят, и повторить один раз.
            await asyncio.sleep(exc.retry_after)
            await bot.send_message(chat_id=reminder.user_id, text=text)
    except TelegramForbiddenError:
        # Пользователь заблокировал бота или ни разу его не запускал.
        logger.info(
            "Reminder for task {} not delivered: user {} blocked the bot",
            reminder.task_id,
            reminder.user_id,
        )
    except TelegramAPIError as exc:
        logger.warning(
            "Reminder for task {} not delivered to user {}: {}",
            reminder.task_id,
            reminder.user_id,
            exc,
        )
    else:
        logger.info("Reminder for task {} sent to user {}", reminder.task_id, reminder.user_id)
