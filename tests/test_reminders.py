"""Напоминания: какие наступили (services.due_reminders) и как они рассылаются
(bot/reminders.py)."""

from __future__ import annotations

import asyncio
from datetime import datetime, time, timedelta, timezone

import pytest
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.methods import SendMessage
from aiogram.types import InlineKeyboardMarkup, MessageEntity

from bot import reminders as bot_reminders
from bot.constants import OPEN_APP_EMOJI, REMINDER_BUTTONS, REMINDER_EMOJI
from bot.pacing import Pacer
from tma.backend.constants import WEEKDAYS
from tma.backend.database import Database
from tma.backend.models import FrequencyType, TaskStatus
from tma.backend.repository import Repository
from tma.backend.services import DueReminder, due_reminders

# 06:00 UTC = 09:00 в Москве (UTC+3) = 11:00 в Алматы (UTC+5).
MOMENT = datetime(2026, 9, 22, 6, 0, tzinfo=timezone.utc)

KEYBOARDS = bot_reminders.open_app_keyboards("https://example.com/app")


async def _due(db_url: str, setup) -> list[DueReminder]:
    database = Database(db_url)
    await database.create_tables()
    try:
        async with database.session_factory() as session:
            await setup(Repository(session))
            await session.commit()
        async with database.session_factory() as session:
            return await due_reminders(Repository(session), MOMENT)
    finally:
        await database.dispose()


async def _user(repo: Repository, user_id: int, tz: str | None) -> None:
    user = await repo.get_or_create_user(user_id, None, "U", language="en")
    await repo.update_settings(user, timezone=tz)


def test_reminder_is_due_at_local_time(db_url: str) -> None:
    async def setup(repo: Repository) -> None:
        await _user(repo, 1, "Europe/Moscow")
        await _user(repo, 2, "Asia/Almaty")
        await _user(repo, 3, None)  # пояс не выбран — UTC
        await repo.create_task(1, "moscow 9", FrequencyType.daily, reminder_time=time(9, 0))
        await repo.create_task(1, "moscow 10", FrequencyType.daily, reminder_time=time(10, 0))
        await repo.create_task(2, "almaty 11", FrequencyType.daily, reminder_time=time(11, 0))
        await repo.create_task(3, "utc 6", FrequencyType.daily, reminder_time=time(6, 0))
        await repo.create_task(3, "no reminder", FrequencyType.daily)

    due = asyncio.run(_due(db_url, setup))
    assert sorted(item.habit_name for item in due) == ["almaty 11", "moscow 9", "utc 6"]
    assert {item.language for item in due} == {"en"}


def test_reminder_skips_done_unscheduled_and_deleted(db_url: str) -> None:
    today = MOMENT.astimezone(timezone.utc).date()  # 09:00 в Москве — тот же день
    other_day = WEEKDAYS[(today.weekday() + 1) % 7]

    async def setup(repo: Repository) -> None:
        await _user(repo, 1, "Europe/Moscow")
        nine = time(9, 0)
        done = await repo.create_task(1, "done", FrequencyType.daily, reminder_time=nine)
        await repo.set_log_status(await repo.get_or_create_log(done.id, 1, today), TaskStatus.done)
        unmarked = await repo.create_task(1, "unmarked", FrequencyType.daily, reminder_time=nine)
        # Снятая отметка (pending) — напоминание приходит.
        await repo.get_or_create_log(unmarked.id, 1, today)
        await repo.create_task(1, "other day", FrequencyType.specific_days, days=other_day,
                               reminder_time=nine)
        deleted = await repo.create_task(1, "deleted", FrequencyType.daily, reminder_time=nine)
        await repo.soft_delete_task(deleted)

    due = asyncio.run(_due(db_url, setup))
    assert [item.habit_name for item in due] == ["unmarked"]


def test_mark_yesterday_reminder_is_about_the_app_day(db_url: str) -> None:
    """В режиме «Отмечать за вчера» напоминание — о дне, который отмечает приложение:
    вчерашняя отметка его отменяет, сегодняшняя (её пользователь поставить не мог) — нет."""
    today = MOMENT.astimezone(timezone.utc).date()  # 09:00 в Москве — тот же день
    yesterday = today - timedelta(days=1)

    async def setup(repo: Repository) -> None:
        user = await repo.get_or_create_user(1, None, "U", language="en")
        await repo.update_settings(user, timezone="Europe/Moscow", mark_yesterday=True)
        nine = time(9, 0)
        marked = await repo.create_task(1, "marked", FrequencyType.daily, reminder_time=nine)
        await repo.set_log_status(
            await repo.get_or_create_log(marked.id, 1, yesterday), TaskStatus.done
        )
        other = await repo.create_task(1, "unmarked", FrequencyType.daily, reminder_time=nine)
        await repo.set_log_status(
            await repo.get_or_create_log(other.id, 1, today), TaskStatus.done
        )

    due = asyncio.run(_due(db_url, setup))
    assert [item.habit_name for item in due] == ["unmarked"]


class _FakeBot:
    """Вместо Bot API: записывает, кому и когда отправлено сообщение."""

    def __init__(
        self, blocked: frozenset[int] = frozenset(), reject_custom_emoji: bool = False
    ) -> None:
        self.sent: list[tuple[int, float]] = []
        self.markups: list[InlineKeyboardMarkup | None] = []
        self.texts: list[str] = []
        self.entities: list[list[MessageEntity] | None] = []
        self.blocked = blocked
        # Как Telegram, если у владельца бота нет Premium (предположительно): сообщение с
        # анимированными эмодзи отклоняется.
        self.reject_custom_emoji = reject_custom_emoji

    async def send_message(
        self,
        chat_id: int,
        text: str,
        reply_markup: InlineKeyboardMarkup | None = None,
        entities: list[MessageEntity] | None = None,
        parse_mode: str | None = None,
    ) -> None:
        if chat_id in self.blocked:
            raise TelegramForbiddenError(
                method=SendMessage(chat_id=chat_id, text=text), message="bot was blocked"
            )
        uses_custom_emoji = any(e.type == "custom_emoji" for e in entities or []) or any(
            button.icon_custom_emoji_id
            for row in (reply_markup.inline_keyboard if reply_markup else [])
            for button in row
        )
        if self.reject_custom_emoji and uses_custom_emoji:
            raise TelegramBadRequest(
                method=SendMessage(chat_id=chat_id, text=text), message="custom emoji not allowed"
            )
        self.sent.append((chat_id, asyncio.get_running_loop().time()))
        self.markups.append(reply_markup)
        self.texts.append(text)
        self.entities.append(entities)


def _reminder(task_id: int, user_id: int) -> DueReminder:
    return DueReminder(task_id=task_id, user_id=user_id, habit_name=f"h{task_id}", language="ru")


def test_reminder_carries_the_open_app_button() -> None:
    """Под напоминанием — кнопка «Открыть приложение», открывающая Mini App."""
    bot = _FakeBot()

    asyncio.run(bot_reminders._send_all(bot, Pacer(1000), [_reminder(1, 1)], KEYBOARDS))  # type: ignore[arg-type]

    button = bot.markups[0].inline_keyboard[0][0]  # type: ignore[union-attr]
    assert button.text == REMINDER_BUTTONS["ru"]
    assert button.icon_custom_emoji_id == OPEN_APP_EMOJI.id
    assert button.web_app is not None and button.web_app.url == "https://example.com/app"


def test_reminder_starts_with_the_animated_emoji() -> None:
    """Напоминание начинается с анимированного эмодзи — сущностью, а не разметкой."""
    bot = _FakeBot()

    asyncio.run(bot_reminders._send_all(bot, Pacer(1000), [_reminder(1, 1)], KEYBOARDS))  # type: ignore[arg-type]

    assert bot.texts[0] == f"{REMINDER_EMOJI.fallback} Пора выполнить «h1»"
    (entity,) = bot.entities[0] or []
    assert entity.type == "custom_emoji" and entity.offset == 0
    assert entity.custom_emoji_id == REMINDER_EMOJI.id


def test_reminder_falls_back_to_plain_emoji() -> None:
    """Telegram отклонил анимированные эмодзи — напоминание уходит с обычными."""
    bot = _FakeBot(reject_custom_emoji=True)

    asyncio.run(bot_reminders._send_all(bot, Pacer(1000), [_reminder(1, 1)], KEYBOARDS))  # type: ignore[arg-type]

    assert bot.texts == [f"{REMINDER_EMOJI.fallback} Пора выполнить «h1»"]
    assert not bot.entities[0]
    button = bot.markups[0].inline_keyboard[0][0]  # type: ignore[union-attr]
    assert button.icon_custom_emoji_id is None and button.text == REMINDER_BUTTONS["ru"]


def test_sending_is_fair_and_spaced_per_chat(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bot_reminders, "PER_CHAT_INTERVAL", 0.05)
    bot = _FakeBot(blocked=frozenset({3}))
    batch = [_reminder(1, 1), _reminder(2, 1), _reminder(3, 1), _reminder(4, 2), _reminder(5, 3)]

    blocked = asyncio.run(bot_reminders._send_all(bot, Pacer(1000), batch, KEYBOARDS))  # type: ignore[arg-type]

    chats = [chat for chat, _ in bot.sent]
    # Заблокировавший бота пользователь не мешает остальным и возвращается, чтобы его
    # отметили в базе.
    assert sorted(chats) == [1, 1, 1, 2]
    assert blocked == {3}
    # Второй пользователь не ждёт, пока первому уйдут все его напоминания.
    assert chats.index(2) < 2
    first_user_times = [moment for chat, moment in bot.sent if chat == 1]
    gaps = [later - earlier for earlier, later in zip(first_user_times, first_user_times[1:])]
    assert all(gap >= 0.045 for gap in gaps)


def test_blocked_user_gets_no_reminders(db_url: str) -> None:
    """Заблокированному администратором напоминания не приходят."""

    async def setup(repo: Repository) -> None:
        await _user(repo, 1, "Europe/Moscow")
        await repo.set_blocked(await repo.get_user(1), blocked=True)
        await repo.create_task(1, "moscow 9", FrequencyType.daily, reminder_time=time(9, 0))

    assert asyncio.run(_due(db_url, setup)) == []
