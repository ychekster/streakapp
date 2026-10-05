"""Бот и данные админ-панели: рассылка (bot/broadcasts.py), запись запустивших бота и
отметка блокировки бота, учёт активности."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from bot import broadcasts as bot_broadcasts
from bot.constants import OPEN_APP_EMOJI, REMINDER_BUTTONS
from bot.handlers.membership import on_bot_status_changed
from bot.handlers.start import record_start
from bot.pacing import Pacer
from tests.fake_telegram import FakeTelegram
from backend.audience import parse_audience
from backend.database import Database
from backend.messaging import BROADCAST_BUTTONS
from backend.models import BroadcastStatus, Review, Task, UserActivity
from backend.repository import Repository, utc_now

_TMA_URL = "https://app.example.com/?v=2"


async def _with_repo(db_url: str, action):
    """Выполнить `action(repo)` в своей сессии с commit и вернуть результат."""
    database = Database(db_url)
    await database.create_tables()
    try:
        async with database.session_factory() as session:
            result = await action(Repository(session))
            await session.commit()
            return result
    finally:
        await database.dispose()


def test_broadcast_is_delivered_in_batches(db_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bot_broadcasts, "BATCH_SIZE", 2)
    telegram = FakeTelegram()
    telegram.blocked.add(3)

    async def setup(repo: Repository) -> int:
        for user_id in range(1, 7):
            await repo.get_or_create_user(user_id, None, "U", language="ru")
        await repo.set_bot_blocked([4], blocked=True)  # не получает рассылок
        await repo.set_blocked(await repo.get_user(5), blocked=True)  # заблокирован
        total = await repo.count_recipients({}, utc_now(), exclude_user_id=1)
        broadcast = await repo.create_broadcast(
            created_by=1, audience="", text="Привет", media_type="photo",
            media_file_id="photo-large", button=None, total=total,
        )
        return broadcast.id

    broadcast_id = asyncio.run(_with_repo(db_url, setup))
    asyncio.run(_deliver_all(db_url, telegram))

    # Автору (1) копия уже пришла от API; 4 и 5 не получатели; 3 заблокировал бота.
    assert [(item.kind, item.chat_id, item.media) for item in telegram.sent] == [
        ("photo", 2, "photo-large"),
        ("photo", 6, "photo-large"),
    ]

    async def check(repo: Repository) -> None:
        broadcast = await repo.get_broadcast(broadcast_id)
        assert broadcast.status == BroadcastStatus.done
        assert (broadcast.total, broadcast.sent, broadcast.failed) == (3, 2, 1)
        assert (await repo.get_user(3)).bot_blocked_at is not None

    asyncio.run(_with_repo(db_url, check))


async def _deliver_all(db_url: str, telegram: FakeTelegram) -> None:
    """Разослать все рассылки из очереди, как цикл бота."""
    database = Database(db_url)
    try:
        while await bot_broadcasts._deliver_next_batch(
            telegram, database, Pacer(1000), _TMA_URL
        ):
            pass
    finally:
        await database.dispose()


def test_broadcast_button_is_in_recipient_language(db_url: str) -> None:
    telegram = FakeTelegram()

    async def setup(repo: Repository) -> None:
        await repo.get_or_create_user(1, None, "Автор", language="ru")
        await repo.get_or_create_user(2, None, "Ru", language="ru")
        await repo.get_or_create_user(3, None, "En", language="en")
        await repo.create_broadcast(
            created_by=1, audience="", text="Оставьте отзыв", media_type=None,
            media_file_id=None, button="review", total=2,
        )

    asyncio.run(_with_repo(db_url, setup))
    asyncio.run(_deliver_all(db_url, telegram))

    buttons = {
        item.chat_id: item.extra["reply_markup"].inline_keyboard[0][0] for item in telegram.sent
    }
    assert {chat: button.text for chat, button in buttons.items()} == {
        2: "Написать отзыв",
        3: "Write a review",
    }
    # Адрес приложения с экраном отзыва; его собственные параметры сохраняются.
    assert buttons[2].web_app.url == "https://app.example.com/?v=2&open=review"


def test_new_habit_button_opens_the_habit_form(db_url: str) -> None:
    telegram = FakeTelegram()

    async def setup(repo: Repository) -> None:
        await repo.get_or_create_user(1, None, "Автор", language="ru")
        await repo.get_or_create_user(2, None, "Ru", language="ru")
        await repo.get_or_create_user(3, None, "En", language="en")
        await repo.create_broadcast(
            created_by=1, audience="", text="Заведите привычку", media_type=None,
            media_file_id=None, button="new_habit", total=2,
        )

    asyncio.run(_with_repo(db_url, setup))
    asyncio.run(_deliver_all(db_url, telegram))

    buttons = {
        item.chat_id: item.extra["reply_markup"].inline_keyboard[0][0] for item in telegram.sent
    }
    assert {chat: button.text for chat, button in buttons.items()} == {
        2: "Добавить привычку",
        3: "Add a habit",
    }
    assert buttons[2].web_app.url == "https://app.example.com/?v=2&open=new_habit"


def test_broadcast_falls_back_without_button_icon(db_url: str) -> None:
    telegram = FakeTelegram()
    telegram.reject_icons = True

    async def setup(repo: Repository) -> None:
        await repo.get_or_create_user(1, None, "Автор", language="ru")
        await repo.get_or_create_user(2, None, "U", language="ru")
        await repo.create_broadcast(
            created_by=1, audience="", text="Заходите", media_type=None,
            media_file_id=None, button="open_app", total=1,
        )

    asyncio.run(_with_repo(db_url, setup))
    asyncio.run(_deliver_all(db_url, telegram))

    [sent] = telegram.sent
    button = sent.extra["reply_markup"].inline_keyboard[0][0]
    assert (sent.chat_id, button.text, button.icon_custom_emoji_id) == (
        2, "Открыть приложение", None
    )
    assert button.web_app.url == _TMA_URL


def test_broadcast_with_broken_filter_does_not_jam_the_queue(db_url: str) -> None:
    """Фильтр, который не разбирается (правили базу вручную), — рассылка закрывается без
    отправки, а следующая за ней уходит."""
    telegram = FakeTelegram()

    async def setup(repo: Repository) -> list[int]:
        await repo.get_or_create_user(1, None, "Автор", language="ru")
        await repo.get_or_create_user(2, None, "U", language="ru")
        broken = await repo.create_broadcast(
            created_by=1, audience="vip:yes", text="Сломанная", media_type=None,
            media_file_id=None, button=None, total=1,
        )
        good = await repo.create_broadcast(
            created_by=1, audience="", text="Обычная", media_type=None,
            media_file_id=None, button=None, total=1,
        )
        return [broken.id, good.id]

    ids = asyncio.run(_with_repo(db_url, setup))
    asyncio.run(_deliver_all(db_url, telegram))
    assert [(item.chat_id, item.text) for item in telegram.sent] == [(2, "Обычная")]

    async def check(repo: Repository) -> None:
        for broadcast_id in ids:
            assert (await repo.get_broadcast(broadcast_id)).status == BroadcastStatus.done

    asyncio.run(_with_repo(db_url, check))


def test_open_app_button_matches_the_bot() -> None:
    """«Открыть приложение» под рассылкой — та же кнопка, что под приветствием и
    напоминанием."""
    button = BROADCAST_BUTTONS["open_app"]
    assert button.texts == REMINDER_BUTTONS
    assert button.icon_emoji_id == OPEN_APP_EMOJI.id


def test_audience_filters(db_url: str) -> None:
    async def check(repo: Repository) -> None:
        for user_id in range(1, 8):
            await repo.get_or_create_user(user_id, None, "U", language="ru")
        now = utc_now()  # после регистрации: получатели — зарегистрированные к моменту
        # 1 — открыл приложение сейчас, завёл привычку и оставил отзыв; 2 — открыл 10 дней
        # назад и больше не заходит; 3 — привычку завёл и удалил; 4 — только запустил
        # бота; 5 — на английском; 6 — заблокировал бота; 7 — заблокирован.
        for user_id, seen in ((1, now), (2, now - timedelta(days=10)), (3, now), (5, now)):
            await repo.touch_user(await repo.get_user(user_id), seen)
        old = now - timedelta(days=40)
        for user_id in (6, 7):
            await repo.touch_user(await repo.get_user(user_id), old)
        (await repo.get_user(5)).language = "en"
        repo.session.add_all([
            Task(user_id=1, name="Бег", frequency_type="daily", created_at=now),
            Task(user_id=3, name="Сон", frequency_type="daily", created_at=now, is_active=False),
            Review(user_id=1, text="Класс", created_at=now),
        ])
        await repo.set_bot_blocked([6], blocked=True)
        await repo.set_blocked(await repo.get_user(7), blocked=True)
        await repo.session.flush()

        async def users(audience: str) -> set[int]:
            found = await repo.search_users(None, parse_audience(audience), now, 0, 100)
            assert await repo.count_users(None, parse_audience(audience), now) == len(found)
            return {user.telegram_id for user in found}

        assert await users("") == {1, 2, 3, 4, 5, 6, 7}
        assert await users("app:never") == {4}
        assert await users("app:opened") == {1, 2, 3, 5, 6, 7}
        assert await users("habits:any") == {1, 3}  # удалённая привычка тоже считается
        assert await users("habits:none,app:opened") == {2, 5, 6, 7}
        assert await users("activity:1d") == {1, 3, 5}
        assert await users("activity:30d") == {1, 2, 3, 5}
        assert await users("activity:inactive_7d") == {2, 6, 7}
        assert await users("activity:inactive_30d") == {6, 7}
        assert await users("language:en") == {5}
        assert await users("reviews:any") == {1}
        assert await users("bot:blocked") == {6}
        assert await users("access:blocked") == {7}
        assert await users("access:ok,bot:ok,activity:inactive_7d") == {2}

        # Рассылка: без заблокировавших бота, заблокированных и автора.
        recipients = await repo.recipients_after(parse_audience("app:opened"), now, 1, 0, 100)
        assert recipients == [(2, "ru"), (3, "ru"), (5, "en")]
        assert await repo.count_recipients(parse_audience("app:opened"), now, 1) == 3
        # Сделанное после начала рассылки её фильтр не меняет.
        earlier = now - timedelta(minutes=1)
        assert await repo.count_users(None, parse_audience("habits:any"), earlier) == 0
        assert await repo.count_users(None, parse_audience("reviews:any"), earlier) == 0

    asyncio.run(_with_repo(db_url, check))


def test_habit_counts_skip_users_who_blocked_the_bot(db_url: str) -> None:
    async def check(repo: Repository) -> None:
        now = utc_now()
        for user_id in (1, 2, 3):
            await repo.get_or_create_user(user_id, None, "U", language="ru")
        for user_id in (1, 2):
            await repo.touch_user(await repo.get_user(user_id), now)
        repo.session.add_all([
            Task(user_id=1, name="Бег", frequency_type="daily"),
            Task(user_id=1, name="Сон", frequency_type="daily"),
            Task(user_id=2, name="Бег", frequency_type="daily"),
            Task(user_id=3, name="Бег", frequency_type="daily"),  # не открывал приложение
        ])
        await repo.set_bot_blocked([2], blocked=True)  # ушёл — не считается
        await repo.session.flush()
        assert await repo.active_habit_counts() == [2]

    asyncio.run(_with_repo(db_url, check))


def test_funnel(db_url: str) -> None:
    async def check(repo: Repository) -> None:
        now = utc_now()
        for user_id in (1, 2, 3):
            await repo.get_or_create_user(user_id, None, "U", language="ru")
        for user_id in (1, 2):
            await repo.touch_user(await repo.get_user(user_id), now)
        repo.session.add(Task(user_id=1, name="Бег", frequency_type="daily"))
        await repo.session.flush()
        funnel = await repo.funnel_since(now - timedelta(days=1))
        assert (funnel.started_bot, funnel.opened_app, funnel.added_habit) == (3, 2, 1)
        assert (await repo.funnel_since(now + timedelta(days=1))).started_bot == 0

    asyncio.run(_with_repo(db_url, check))


def test_start_records_user_and_clears_bot_block(db_url: str) -> None:
    telegram_user = SimpleNamespace(id=7, username="neo", first_name="Neo", language_code="en")

    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            await record_start(database, telegram_user)
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_user(7)
                # Запустил бота, но приложение ещё не открывал.
                assert (user.language, user.app_opened_at) == ("en", None)
                await repo.set_bot_blocked([7], blocked=True)
                await session.commit()
            await record_start(database, telegram_user)
            async with database.session_factory() as session:
                assert (await Repository(session).get_user(7)).bot_blocked_at is None
        finally:
            await database.dispose()

    asyncio.run(run())


@pytest.mark.parametrize(("status", "blocked"), [("kicked", True), ("member", False)])
def test_membership_updates_bot_block(db_url: str, status: str, blocked: bool) -> None:
    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                await repo.get_or_create_user(8, None, "U", language="ru")
                await repo.set_bot_blocked([8], blocked=not blocked)
                await session.commit()
            event = SimpleNamespace(
                new_chat_member=SimpleNamespace(status=status), from_user=SimpleNamespace(id=8)
            )
            await on_bot_status_changed(event, database)  # type: ignore[arg-type]
            async with database.session_factory() as session:
                user = await Repository(session).get_user(8)
                assert (user.bot_blocked_at is not None) is blocked
        finally:
            await database.dispose()

    asyncio.run(run())


def test_activity_is_recorded_once_a_minute_and_once_a_day(db_url: str) -> None:
    async def check(repo: Repository) -> None:
        user = await repo.get_or_create_user(9, None, "U", language="ru")
        morning = datetime(2026, 9, 22, 9, 0)
        await repo.touch_user(user, morning)
        await repo.touch_user(user, morning + timedelta(seconds=20))  # не записывается
        assert user.last_seen_at == morning
        await repo.touch_user(user, morning + timedelta(hours=3))
        await repo.touch_user(user, morning + timedelta(days=1))
        assert user.app_opened_at == morning  # первое открытие не меняется
        days = (await repo.session.execute(
            UserActivity.__table__.select().where(UserActivity.user_id == 9)
        )).all()
        assert sorted(row.day.isoformat() for row in days) == ["2026-09-22", "2026-09-23"]

    asyncio.run(_with_repo(db_url, check))
