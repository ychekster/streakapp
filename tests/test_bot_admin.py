"""Бот и данные админ-панели: рассылка (bot/broadcasts.py), запись запустивших бота и
отметка блокировки бота, учёт активности."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from bot import broadcasts as bot_broadcasts
from bot.handlers.membership import on_bot_status_changed
from bot.handlers.start import _record_start
from bot.pacing import Pacer
from tests.fake_telegram import FakeTelegram
from tma.backend.database import Database
from tma.backend.models import BroadcastStatus, UserActivity
from tma.backend.repository import Repository, utc_now


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
        total = await repo.count_recipients("all", utc_now(), exclude_user_id=1)
        broadcast = await repo.create_broadcast(
            created_by=1, segment="all", text="Привет", media_type="photo",
            media_file_id="photo-large", total=total,
        )
        return broadcast.id

    async def deliver() -> None:
        database = Database(db_url)
        try:
            while await bot_broadcasts._deliver_next_batch(telegram, database, Pacer(1000)):
                pass
        finally:
            await database.dispose()

    broadcast_id = asyncio.run(_with_repo(db_url, setup))
    asyncio.run(deliver())

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


def test_segments(db_url: str) -> None:
    async def check(repo: Repository) -> None:
        now = utc_now()
        for user_id in (1, 2, 3):
            await repo.get_or_create_user(user_id, None, "U", language="ru")
        await repo.touch_user(await repo.get_user(1), now)  # открыл приложение сейчас
        await repo.touch_user(await repo.get_user(2), now - timedelta(days=10))
        counts = {
            segment: await repo.count_recipients(segment, now)
            for segment in ("all", "active_7d", "active_30d", "never_opened")
        }
        assert counts == {"all": 3, "active_7d": 1, "active_30d": 2, "never_opened": 1}

    asyncio.run(_with_repo(db_url, check))


def test_start_records_user_and_clears_bot_block(db_url: str) -> None:
    telegram_user = SimpleNamespace(id=7, username="neo", first_name="Neo", language_code="en")

    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            await _record_start(database, telegram_user)
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_user(7)
                # Запустил бота, но приложение ещё не открывал.
                assert (user.language, user.app_opened_at) == ("en", None)
                await repo.set_bot_blocked([7], blocked=True)
                await session.commit()
            await _record_start(database, telegram_user)
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
