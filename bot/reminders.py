"""Напоминания о привычках: в заданное время бот пишет в чат «🔔 Пора выполнить «…»».

Так же приходит и напоминание «🔔 Пора отметить привычки» из настроек приложения
(`backend.services.due_checkin_reminders`) — в выбранные дни и время, если на день
отметки есть неотмеченные привычки.

Время напоминания пользователь задаёт в Mini App, хранит его API (`tasks.reminder_time`,
в поясе пользователя). Раз в минуту бот спрашивает у базы, чьё время наступило
(`backend.services.due_reminders`): напоминание приходит только в запланированные
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

Web app users (spec §9) get the reminder once, on one channel: an account with a Web
Push subscription gets a push notification on its devices; otherwise, if it has Telegram
(a positive id) and has not turned «Уведомления» off in the Mini App
(`users.telegram_notifications`), the bot message as before. Otherwise nothing comes:
web-only accounts without push, Telegram with notifications off and no push.
Subscriptions the push service reports as gone (404/410) are deleted; if all of an
account's subscriptions are gone, that reminder falls back to Telegram (same rule).

Every reminder goes into the user's action log (reminder_sent / reminder_failed, with the
channel), and a subscription that disappeared — as push_gone: the admin panel's
analytics counts reminders, what they lead to and likely uninstalls from it. The button
and the push open the app marked «from a reminder» (`from=reminder`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
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

from bot.constants import (
    CHECKIN_REMINDER_TEXTS,
    OPEN_APP_EMOJI,
    REMINDER_BUTTONS,
    REMINDER_EMOJI,
    REMINDER_TEXTS,
)
from bot.emoji import without_custom_emoji, without_icons
from bot.pacing import Pacer
from backend.constants import DEFAULT_LANGUAGE
from backend.database import Database
from backend.messaging import app_url
from backend.repository import Repository
from backend.models import PushSubscription
from backend.repository import utc_now
from backend.services import DueReminder, due_checkin_reminders, due_reminders
from backend.webpush import (
    PushOutcome,
    PushTarget,
    VapidKeys,
    notification,
    send_push,
)

_MINUTE = timedelta(minutes=1)

# Насколько назад досылать пропущенные минуты: напоминание, опоздавшее сильнее, уже
# неуместно.
CATCH_UP_LIMIT = timedelta(minutes=5)

# Пауза между сообщениями одному чату, в секундах (лимит Bot API — около одного в секунду).
PER_CHAT_INTERVAL = 1.0


PushSender = Callable[[PushTarget, dict[str, object], VapidKeys], Awaitable[PushOutcome]]


@dataclass(frozen=True)
class PushConfig:
    """Web Push settings: VAPID keys and the web app's public URL (notification taps open
    `<base_url>/app?pwa=1&habit=<id>`)."""

    keys: VapidKeys
    base_url: str


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
                        web_app=WebAppInfo(url=app_url(tma_url, None, "reminder")),
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


async def run_reminders(
    bot: Bot, database: Database, pacer: Pacer, tma_url: str, push: PushConfig | None = None
) -> None:
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
                await _send_due(bot, database, pacer, minute, keyboards, push)
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
    push: PushConfig | None = None,
    send: PushSender = send_push,
) -> None:
    """Прислать напоминания, время которых — `minute`: push на устройства веб-приложения
    или сообщение бота (см. docstring модуля), — и отметить заблокировавших бота и
    исчезнувшие подписки."""
    # Сессия только на чтение и закрывается до отправки: сеть не держит соединение с БД.
    async with database.session_factory() as session:
        repo = Repository(session)
        reminders = await due_reminders(repo, minute) + await due_checkin_reminders(
            repo, minute
        )
        subscriptions = (
            await repo.push_subscriptions_for({item.user_id for item in reminders})
            if reminders and push is not None
            else {}
        )
    if not reminders:
        return
    by_push = [item for item in reminders if item.user_id in subscriptions]
    gone: list[str] = []
    delivered: list[str] = []
    fallback: list[DueReminder] = []
    outcomes: list[tuple[DueReminder, str, bool]] = []
    if push is not None and by_push:
        gone, delivered, fallback = await _push_all(by_push, subscriptions, push, send)
        dropped = {id(item) for item in fallback}
        outcomes += [
            (item, "push", any(sub.endpoint in delivered for sub in subscriptions[item.user_id]))
            for item in by_push
            if id(item) not in dropped
        ]
    # Telegram only if the user has not turned notifications off in the Mini App.
    by_chat = [
        item
        for item in [item for item in reminders if item.user_id not in subscriptions] + fallback
        if item.user_id > 0 and item.telegram
    ]
    results = await _send_all(bot, pacer, by_chat, keyboards) if by_chat else {}
    blocked = {user_id for user_id, (is_blocked, _) in results.items() if is_blocked}
    sent_ok = {key for _, (_, keys) in results.items() for key in keys}
    outcomes += [(item, "telegram", _reminder_key(item) in sent_ok) for item in by_chat]
    gone_users = {
        user_id
        for user_id, items in subscriptions.items()
        if items and all(sub.endpoint in gone for sub in items)
    }
    async with database.session_factory() as session:
        repo = Repository(session)
        if blocked:
            await repo.set_bot_blocked(blocked, blocked=True)
        await repo.delete_push_subscriptions(gone)
        await repo.mark_push_delivered(delivered, utc_now())
        for user_id in gone_users:
            await repo.log_action(user_id, "push_gone")
        for item, channel, ok in outcomes:
            await repo.log_action(
                item.user_id,
                "reminder_sent" if ok else "reminder_failed",
                ref_id=item.task_id,
                detail=channel,
            )
        await session.commit()


def _reminder_key(reminder: DueReminder) -> tuple[int, int | None]:
    return reminder.user_id, reminder.task_id


def reminder_text(reminder: DueReminder) -> str:
    """Текст напоминания на языке пользователя: о привычке или «Пора отметить привычки»."""
    if reminder.habit_name is None:
        return CHECKIN_REMINDER_TEXTS.get(
            reminder.language, CHECKIN_REMINDER_TEXTS[DEFAULT_LANGUAGE]
        )
    template = REMINDER_TEXTS.get(reminder.language, REMINDER_TEXTS[DEFAULT_LANGUAGE])
    return template.format(name=reminder.habit_name)


def push_payload(reminder: DueReminder, base_url: str) -> dict[str, object]:
    """Push notification of a reminder: same text as the bot message; a tap opens the
    habit in the app (the check-in reminder — the habit list).

    The text is the title and there is no body: iOS puts «from Knot» under the
    title itself (it can't be turned off), so an app-name title would only repeat it.
    Plain text, without the bot message's 🔔."""
    if reminder.task_id is None:
        return notification(
            reminder_text(reminder), "", f"{base_url}/app?pwa=1&from=push", tag="checkin"
        )
    return notification(
        reminder_text(reminder),
        "",
        f"{base_url}/app?pwa=1&from=push&habit={reminder.task_id}",
        tag=f"habit-{reminder.task_id}",
    )


async def _push_all(
    reminders: list[DueReminder],
    subscriptions: Mapping[int, list[PushSubscription]],
    push: PushConfig,
    send: PushSender,
) -> tuple[list[str], list[str], list[DueReminder]]:
    """Push every reminder to all devices of its account, in parallel. Returns gone and
    delivered endpoints, and the reminders of Telegram accounts all of whose devices are
    gone (they fall back to the bot message)."""

    async def deliver(reminder: DueReminder) -> list[tuple[str, PushOutcome]]:
        data = push_payload(reminder, push.base_url)
        targets = [
            PushTarget(item.endpoint, item.p256dh, item.auth)
            for item in subscriptions[reminder.user_id]
        ]
        outcomes = await asyncio.gather(*(send(target, data, push.keys) for target in targets))
        return [(target.endpoint, outcome) for target, outcome in zip(targets, outcomes)]

    results = await asyncio.gather(*(deliver(item) for item in reminders))
    gone: list[str] = []
    delivered: list[str] = []
    fallback: list[DueReminder] = []
    for reminder, outcomes in zip(reminders, results):
        gone += [endpoint for endpoint, outcome in outcomes if outcome is PushOutcome.gone]
        delivered += [endpoint for endpoint, outcome in outcomes if outcome is PushOutcome.sent]
        if reminder.user_id > 0 and all(outcome is PushOutcome.gone for _, outcome in outcomes):
            fallback.append(reminder)
    logger.info(
        "Push reminders: {} reminders, {} delivered, {} gone", len(reminders), len(delivered), len(gone)
    )
    return list(dict.fromkeys(gone)), list(dict.fromkeys(delivered)), fallback


async def _send_all(
    bot: Bot,
    pacer: Pacer,
    reminders: list[DueReminder],
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> dict[int, tuple[bool, set[tuple[int, int | None]]]]:
    """Разослать напоминания: параллельно по пользователям, в пределах лимитов Bot API.
    Возвращает по пользователю: заблокировал ли он бота и какие напоминания дошли."""
    by_user: dict[int, list[DueReminder]] = {}
    for reminder in reminders:
        by_user.setdefault(reminder.user_id, []).append(reminder)
    results = await asyncio.gather(
        *(_send_to_user(bot, pacer, own, keyboards) for own in by_user.values()),
        return_exceptions=True,
    )
    outcome: dict[int, tuple[bool, set[tuple[int, int | None]]]] = {}
    for user_id, result in zip(by_user, results):
        if isinstance(result, BaseException):
            logger.opt(exception=result).error("Reminder delivery failed: {}", result)
            outcome[user_id] = (False, set())
        else:
            outcome[user_id] = result
    logger.info("Reminder batch done: {} reminders for {} users", len(reminders), len(by_user))
    return outcome


async def _send_to_user(
    bot: Bot,
    pacer: Pacer,
    reminders: list[DueReminder],
    keyboards: Mapping[str, InlineKeyboardMarkup],
) -> tuple[bool, set[tuple[int, int | None]]]:
    """Напоминания одному пользователю — по очереди, с паузой между сообщениями.
    Возвращает: заблокировал ли он бота (тогда остальные его напоминания не отправляются)
    и какие напоминания дошли."""
    sent: set[tuple[int, int | None]] = set()
    for index, reminder in enumerate(reminders):
        if index:
            await asyncio.sleep(PER_CHAT_INTERVAL)
        result = await _send(bot, pacer, reminder, keyboards)
        if result == "blocked":
            return True, sent
        if result == "sent":
            sent.add(_reminder_key(reminder))
    return False, sent


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
) -> str:
    """Отправить одно напоминание; сбой доставки логируется и не мешает остальным.
    Возвращает sent, blocked (пользователь заблокировал бота) или failed."""
    # Анимированный эмодзи — сущностью (entities): название привычки остаётся простым
    # текстом, экранировать его не нужно.
    content = Text(
        CustomEmoji(REMINDER_EMOJI.fallback, custom_emoji_id=REMINDER_EMOJI.id),
        " ",
        reminder_text(reminder),
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
        return "blocked"
    except TelegramAPIError as exc:
        logger.warning(
            "Reminder for task {} not delivered to user {}: {}",
            reminder.task_id,
            reminder.user_id,
            exc,
        )
        return "failed"
    logger.info("Reminder for task {} sent to user {}", reminder.task_id, reminder.user_id)
    return "sent"
