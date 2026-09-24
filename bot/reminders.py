"""Напоминания о привычках: в заданное время бот пишет в чат «🔔 Пора выполнить «…»».

Время напоминания пользователь задаёт в Mini App, хранит его API (`tasks.reminder_time`,
в поясе пользователя). Раз в минуту бот спрашивает у базы, чьё время наступило
(`tma.backend.services.due_reminders`): напоминание приходит только в запланированные
дни и только пока привычка за этот день не отмечена. Текст — на языке, выбранном в
приложении.

Под напоминанием стоит кнопка «Открыть приложение» — она открывает Mini App, где
привычку и отмечают; сама по себе кнопка ничего не делает.

Опрос базы, а не расписание в памяти: привычки меняет другой процесс (API), и так
изменения подхватываются сразу, без синхронизации. Каждая минута обрабатывается один
раз; если цикл отстал (долгая отправка, пауза процесса), пропущенные минуты досылаются,
но не дальше `CATCH_UP_LIMIT` назад. При старте обрабатывается и текущая минута, поэтому
перезапуск бота ровно в минуту напоминания может прислать его повторно — зато не теряет.

Рассылка идёт параллельно по пользователям, но в пределах лимитов Bot API: всем вместе
не больше `pacing.SEND_RATE` сообщений в секунду (темп общий с рассылками из
админ-панели), одному чату — не чаще раза в `PER_CHAT_INTERVAL`. Очередь общая и
честная: у кого много напоминаний на одну минуту, тот не задерживает остальных —
сначала уходит по первому напоминанию каждому, потом по второму и т.д.

Кто заблокировал бота (Telegram ответил 403), тому остальные напоминания минуты не
отправляются, а в базе это отмечается — для аналитики и рассылок админ-панели.
"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import datetime, timedelta, timezone

from aiogram import Bot
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from aiogram.utils.formatting import CustomEmoji, Text
from loguru import logger

from bot.constants import OPEN_APP_EMOJI, REMINDER_BUTTONS, REMINDER_EMOJI, REMINDER_TEXTS
from bot.emoji import without_custom_emoji, without_icons
from bot.pacing import Pacer
from tma.backend.constants import DEFAULT_LANGUAGE
from tma.backend.database import Database
from tma.backend.repository import Repository
from tma.backend.services import DueReminder, due_reminders

_MINUTE = timedelta(minutes=1)

# Насколько назад досылать пропущенные минуты: напоминание, опоздавшее сильнее, уже
# неуместно.
CATCH_UP_LIMIT = timedelta(minutes=5)

# Пауза между сообщениями одному чату, в секундах (лимит Bot API — около одного в секунду).
PER_CHAT_INTERVAL = 1.0


def _current_minute() -> datetime:
    """Начало текущей минуты (UTC)."""
    return datetime.now(timezone.utc).replace(second=0, microsecond=0)


def open_app_keyboards(tma_url: str) -> dict[str, InlineKeyboardMarkup]:
    """Кнопка «Открыть приложение» под напоминанием — по одной на язык интерфейса.

    Адрес у всех один, поэтому клавиатуры собираются один раз при старте, а не на каждое
    напоминание.
    """
    return {
        language: InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=text,
                        icon_custom_emoji_id=OPEN_APP_EMOJI.id,
                        web_app=WebAppInfo(url=tma_url),
                    )
                ]
            ]
        )
        for language, text in REMINDER_BUTTONS.items()
    }


def _keyboard(
    keyboards: Mapping[str, InlineKeyboardMarkup], language: str
) -> InlineKeyboardMarkup:
    """Клавиатура на языке пользователя (незнакомый язык — язык по умолчанию)."""
    return keyboards.get(language, keyboards[DEFAULT_LANGUAGE])


async def run_reminders(bot: Bot, database: Database, pacer: Pacer, tma_url: str) -> None:
    """Бесконечный цикл: в начале каждой минуты прислать наступившие напоминания.

    Ошибки одной минуты (база недоступна и т.п.) логируются и не останавливают цикл;
    остановить его можно только отменой задачи.
    """
    logger.info("Reminders started")
    keyboards = open_app_keyboards(tma_url)
    last_processed = _current_minute() - _MINUTE
    while True:
        now = _current_minute()
        minute = max(last_processed + _MINUTE, now - CATCH_UP_LIMIT)
        while minute <= now:
            try:
                await _send_due(bot, database, pacer, minute, keyboards)
            except Exception:  # noqa: BLE001 — цикл напоминаний не должен падать
                logger.exception("Reminders for {} failed", minute)
            last_processed = minute
            minute += _MINUTE
        next_minute = _current_minute() + _MINUTE
        await asyncio.sleep((next_minute - datetime.now(timezone.utc)).total_seconds())


async def _send_due(
    bot: Bot,
    database: Database,
    pacer: Pacer,
    minute: datetime,
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> None:
    """Прислать напоминания, время которых — `minute`, и отметить заблокировавших бота."""
    # Сессия только на чтение и закрывается до отправки: сеть не держит соединение с БД.
    async with database.session_factory() as session:
        reminders = await due_reminders(Repository(session), minute)
    if not reminders:
        return
    blocked = await _send_all(bot, pacer, reminders, keyboards)
    if blocked:
        async with database.session_factory() as session:
            await Repository(session).set_bot_blocked(blocked, blocked=True)
            await session.commit()


async def _send_all(
    bot: Bot,
    pacer: Pacer,
    reminders: list[DueReminder],
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> set[int]:
    """Разослать напоминания: параллельно по пользователям, в пределах лимитов Bot API.
    Возвращает id заблокировавших бота."""
    by_user: dict[int, list[DueReminder]] = {}
    for reminder in reminders:
        by_user.setdefault(reminder.user_id, []).append(reminder)
    results = await asyncio.gather(
        *(_send_to_user(bot, pacer, own, keyboards) for own in by_user.values()),
        return_exceptions=True,
    )
    blocked: set[int] = set()
    for user_id, result in zip(by_user, results):
        if isinstance(result, Exception):
            logger.opt(exception=result).error("Reminder delivery failed: {}", result)
        elif result:
            blocked.add(user_id)
    logger.info("Reminder batch done: {} reminders for {} users", len(reminders), len(by_user))
    return blocked


async def _send_to_user(
    bot: Bot,
    pacer: Pacer,
    reminders: list[DueReminder],
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> bool:
    """Напоминания одному пользователю — по очереди, с паузой между сообщениями. True —
    пользователь заблокировал бота (остальные его напоминания не отправляются)."""
    for index, reminder in enumerate(reminders):
        if index:
            await asyncio.sleep(PER_CHAT_INTERVAL)
        if await _send(bot, pacer, reminder, keyboards):
            return True
    return False


async def _deliver(
    bot: Bot,
    pacer: Pacer,
    chat_id: int,
    content: dict[str, object],
    markup: InlineKeyboardMarkup,
) -> None:
    """Отправить сообщение в общем темпе; упёрлись в лимит Telegram — подождать, сколько
    просят, и повторить один раз."""
    await pacer.wait()
    try:
        await bot.send_message(chat_id=chat_id, **content, reply_markup=markup)  # type: ignore[arg-type]
    except TelegramRetryAfter as exc:
        await asyncio.sleep(exc.retry_after)
        await pacer.wait()
        await bot.send_message(chat_id=chat_id, **content, reply_markup=markup)  # type: ignore[arg-type]


async def _send(
    bot: Bot,
    pacer: Pacer,
    reminder: DueReminder,
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> bool:
    """Отправить одно напоминание; сбой доставки логируется и не мешает остальным. True —
    пользователь заблокировал бота."""
    template = REMINDER_TEXTS.get(reminder.language, REMINDER_TEXTS[DEFAULT_LANGUAGE])
    # Анимированный эмодзи — сущностью (entities): название привычки остаётся простым
    # текстом, экранировать его не нужно.
    content = Text(
        CustomEmoji(REMINDER_EMOJI.fallback, custom_emoji_id=REMINDER_EMOJI.id),
        " ",
        template.format(name=reminder.habit_name),
    ).as_kwargs()
    markup = _keyboard(keyboards, reminder.language)
    try:
        try:
            await _deliver(bot, pacer, reminder.user_id, content, markup)
        except TelegramBadRequest as exc:
            # Анимированные эмодзи недоступны (например, у владельца бота кончился
            # Premium) — то же напоминание с обычными эмодзи (см. bot/emoji.py).
            logger.warning("Reminder with custom emoji rejected, sending plain: {}", exc)
            await _deliver(
                bot, pacer, reminder.user_id, without_custom_emoji(content), without_icons(markup)
            )
    except TelegramForbiddenError:
        # Пользователь заблокировал бота.
        logger.info(
            "Reminder for task {} not delivered: user {} blocked the bot",
            reminder.task_id,
            reminder.user_id,
        )
        return True
    except TelegramAPIError as exc:
        logger.warning(
            "Reminder for task {} not delivered to user {}: {}",
            reminder.task_id,
            reminder.user_id,
            exc,
        )
    else:
        logger.info("Reminder for task {} sent to user {}", reminder.task_id, reminder.user_id)
    return False
