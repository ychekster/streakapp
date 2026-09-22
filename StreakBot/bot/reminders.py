"""Напоминания о привычках: в заданное время бот пишет в чат «🔔 Пора выполнить «…»».

Время напоминания пользователь задаёт в Mini App, хранит его API (`tasks.reminder_time`,
в поясе пользователя). Раз в минуту бот спрашивает у базы, чьё время наступило
(`tma.backend.services.due_reminders`): напоминание приходит только в запланированные
дни и только пока привычка за этот день не отмечена. Текст — на языке, выбранном в
приложении.

Опрос базы, а не расписание в памяти: привычки меняет другой процесс (API), и так
изменения подхватываются сразу, без синхронизации. Каждая минута обрабатывается один
раз; если цикл отстал (долгая отправка, пауза процесса), пропущенные минуты досылаются,
но не дальше `CATCH_UP_LIMIT` назад. При старте обрабатывается и текущая минута, поэтому
перезапуск бота ровно в минуту напоминания может прислать его повторно — зато не теряет.

Рассылка идёт параллельно по пользователям, но в пределах лимитов Bot API: всем вместе
не больше `SEND_RATE` сообщений в секунду, одному чату — не чаще раза в
`PER_CHAT_INTERVAL`. Очередь общая и честная: у кого много напоминаний на одну минуту,
тот не задерживает остальных — сначала уходит по первому напоминанию каждому, потом по
второму и т.д.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError, TelegramRetryAfter
from loguru import logger

from bot.constants import REMINDER_TEXTS
from tma.backend.constants import DEFAULT_LANGUAGE
from tma.backend.database import Database
from tma.backend.repository import Repository
from tma.backend.services import DueReminder, due_reminders

_MINUTE = timedelta(minutes=1)

# Насколько назад досылать пропущенные минуты: напоминание, опоздавшее сильнее, уже
# неуместно.
CATCH_UP_LIMIT = timedelta(minutes=5)

# Сообщений в секунду всем пользователям вместе — с запасом ниже лимита Bot API (~30).
SEND_RATE = 25
# Пауза между сообщениями одному чату, в секундах (лимит Bot API — около одного в секунду).
PER_CHAT_INTERVAL = 1.0


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


class _Pacer:
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


async def _send_due(bot: Bot, database: Database, minute: datetime) -> None:
    """Прислать напоминания, время которых — `minute`."""
    # Сессия только на чтение и закрывается до отправки: сеть не держит соединение с БД.
    async with database.session_factory() as session:
        reminders = await due_reminders(Repository(session), minute)
    if reminders:
        await _send_all(bot, reminders)


async def _send_all(bot: Bot, reminders: list[DueReminder]) -> None:
    """Разослать напоминания: параллельно по пользователям, в пределах лимитов Bot API."""
    by_user: dict[int, list[DueReminder]] = {}
    for reminder in reminders:
        by_user.setdefault(reminder.user_id, []).append(reminder)
    pacer = _Pacer(SEND_RATE)
    results = await asyncio.gather(
        *(_send_to_user(bot, pacer, own) for own in by_user.values()),
        return_exceptions=True,
    )
    for result in results:
        if isinstance(result, Exception):
            logger.opt(exception=result).error("Reminder delivery failed: {}", result)
    logger.info("Reminder batch done: {} reminders for {} users", len(reminders), len(by_user))


async def _send_to_user(bot: Bot, pacer: _Pacer, reminders: list[DueReminder]) -> None:
    """Напоминания одному пользователю — по очереди, с паузой между сообщениями."""
    for index, reminder in enumerate(reminders):
        if index:
            await asyncio.sleep(PER_CHAT_INTERVAL)
        await _send(bot, pacer, reminder)


async def _send(bot: Bot, pacer: _Pacer, reminder: DueReminder) -> None:
    """Отправить одно напоминание; сбой доставки логируется и не мешает остальным."""
    template = REMINDER_TEXTS.get(reminder.language, REMINDER_TEXTS[DEFAULT_LANGUAGE])
    text = template.format(name=reminder.habit_name)
    try:
        await pacer.wait()
        try:
            await bot.send_message(chat_id=reminder.user_id, text=text)
        except TelegramRetryAfter as exc:
            # Упёрлись в лимит Telegram — подождать, сколько просят, и повторить один раз.
            await asyncio.sleep(exc.retry_after)
            await pacer.wait()
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
