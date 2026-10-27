"""«Цель по времени»: цель и счёт дня в секундах, идущий таймер в /sync и уведомление бота,
когда таймер набрал цель."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from bot import reminders as bot_reminders
from bot.pacing import Pacer
from tests.conftest import AuthUser
from tests.fake_telegram import FakeTelegram
from backend.constants import MAX_DAY_SECONDS, MAX_GOAL_SECONDS
from backend.database import Database
from backend.models import FrequencyType
from backend.repository import Repository
from backend.schemas import SyncTimer
from backend.services import apply_sync, due_timer_goals, timer_day_end, user_today


def _habit(name: str = "Учёба", **fields: object) -> dict[str, object]:
    return {"name": name, "frequency_type": "daily", **fields}


def _timed(name: str = "Учёба", goal: int = 45 * 60, **fields: object) -> dict[str, object]:
    return _habit(name, times_per_day=goal, goal_unit="seconds", **fields)


def _sync(client: TestClient, user: AuthUser, *ops: dict[str, object]) -> dict:
    response = client.post("/sync", json={"ops": list(ops)}, headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _codes(data: dict) -> list[str | None]:
    return [result["error"] and result["error"]["code"] for result in data["results"]]


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def test_time_goal_is_in_seconds(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _timed()},
        {"type": "create", "ref": "b", "habit": _timed("Короткая", goal=30)},
        {"type": "create", "ref": "c", "habit": _timed("Длинная", goal=MAX_GOAL_SECONDS + 1)},
        {"type": "create", "ref": "e", "habit": _timed("Общая", shared=True)},
    )
    assert _codes(data) == [
        None, "invalid_times_per_day", "invalid_times_per_day", "invalid_goal_unit"
    ]
    [habit] = data["habits"]
    assert (habit["goal_unit"], habit["times_per_day"]) == ("seconds", 2700)
    assert habit["auto_mark"] is False


def test_timer_runs_and_its_time_is_the_day_count(client: TestClient, user: AuthUser) -> None:
    created = _sync(client, user, {"type": "create", "ref": "t", "habit": _timed()})
    habit_id = created["results"][0]["id"]
    today = created["today"]
    assert created["timer"] is None

    started = datetime.now(timezone.utc).replace(microsecond=0) - timedelta(minutes=10)
    start = {"type": "timer", "task": habit_id, "date": today, "started_at": _iso(started)}
    running = _sync(client, user, start)
    assert running["timer"]["task"] == habit_id and running["timer"]["date"] == today
    assert datetime.fromisoformat(running["timer"]["started_at"]) == started

    # Stopped: the device sends the day's seconds, then takes the timer off.
    stopped = _sync(
        client,
        user,
        {"type": "mark", "task": habit_id, "date": today, "done": False, "count": 600},
        {"type": "timer", "task": None},
    )
    assert stopped["timer"] is None
    [habit] = stopped["habits"]
    assert (habit["today_count"], habit["done_today"]) == (600, False)

    # The goal reached: the day is done; past it only with «Сверх плана».
    done = _sync(
        client, user, {"type": "mark", "task": habit_id, "date": today, "done": True, "count": 9999}
    )
    assert (done["habits"][0]["today_count"], done["habits"][0]["done_today"]) == (2700, True)


def test_overtime_time_stops_at_a_day(client: TestClient, user: AuthUser) -> None:
    created = _sync(
        client, user, {"type": "create", "ref": "t", "habit": _timed(overtime=True)}
    )
    habit_id, today = created["results"][0]["id"], created["today"]
    data = _sync(
        client,
        user,
        {"type": "mark", "task": habit_id, "date": today, "done": True, "count": 999999},
    )
    assert data["habits"][0]["today_count"] == MAX_DAY_SECONDS


def test_timer_only_for_a_time_goal(client: TestClient, user: AuthUser) -> None:
    created = _sync(client, user, {"type": "create", "ref": "p", "habit": _habit()})
    habit_id, today = created["results"][0]["id"], created["today"]
    now = _iso(datetime.now(timezone.utc))
    data = _sync(
        client,
        user,
        {"type": "timer", "task": habit_id, "date": today, "started_at": now},
        {"type": "timer", "task": habit_id},
    )
    assert _codes(data) == ["invalid_timer", "invalid_timer"]
    assert data["timer"] is None


def test_timer_goes_with_its_habit(client: TestClient, user: AuthUser) -> None:
    created = _sync(client, user, {"type": "create", "ref": "t", "habit": _timed()})
    habit_id, today = created["results"][0]["id"], created["today"]
    now = _iso(datetime.now(timezone.utc))
    start = {"type": "timer", "task": habit_id, "date": today, "started_at": now}
    # A goal in times again: the timer is off.
    data = _sync(
        client, user, start, {"type": "update", "task": habit_id, "habit": _habit(times_per_day=2)}
    )
    assert data["timer"] is None
    # Deleted: off too.
    data = _sync(
        client,
        user,
        {"type": "update", "task": habit_id, "habit": _timed()},
        start,
        {"type": "delete", "task": habit_id},
    )
    assert data["timer"] is None


def test_timer_from_the_future_starts_now(client: TestClient, user: AuthUser) -> None:
    created = _sync(client, user, {"type": "create", "ref": "t", "habit": _timed()})
    habit_id, today = created["results"][0]["id"], created["today"]
    ahead = datetime.now(timezone.utc) + timedelta(hours=3)
    data = _sync(
        client,
        user,
        {"type": "timer", "task": habit_id, "date": today, "started_at": _iso(ahead)},
    )
    started = datetime.fromisoformat(data["timer"]["started_at"])
    assert started <= datetime.now(timezone.utc)


def test_goal_notice_comes_once(db_url: str) -> None:
    async def run() -> tuple[list[Any], list[Any]]:
        database = Database(db_url)
        await database.create_tables()
        telegram = FakeTelegram()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "Аня", language="ru")
                task = await repo.create_task(
                    1, "Учёба", FrequencyType.daily, times_per_day=45 * 60, goal_unit="seconds"
                )
                day: date = user_today(user)
                # 40 minutes done before, the timer started 6 minutes ago: the goal is reached.
                log = await repo.get_or_create_log(task.id, 1, day)
                await repo.set_log_count(log, 40 * 60)
                started = datetime.now(timezone.utc) - timedelta(minutes=6)
                await apply_sync(
                    repo,
                    user,
                    [SyncTimer(type="timer", task=task.id, date=day, started_at=started)],
                )
                await session.commit()
            keyboards = bot_reminders.open_app_keyboards("https://example.com")
            for _ in range(2):
                await bot_reminders._send_timer_goals(
                    telegram, database, Pacer(1000), keyboards  # type: ignore[arg-type]
                )
            async with database.session_factory() as session:
                left = await due_timer_goals(
                    Repository(session), datetime.now(timezone.utc).replace(tzinfo=None)
                )
            return telegram.sent, left
        finally:
            await database.dispose()

    sent, left = asyncio.run(run())
    assert [(item.chat_id, item.text) for item in sent] == [
        (1, "«Учёба»: 45 мин — цель выполнена")
    ]
    assert left == []


def test_freezing_takes_the_timer_off(client: TestClient, user: AuthUser) -> None:
    created = _sync(client, user, {"type": "create", "ref": "t", "habit": _timed()})
    habit_id, today = created["results"][0]["id"], created["today"]
    now = _iso(datetime.now(timezone.utc))
    _sync(client, user, {"type": "timer", "task": habit_id, "date": today, "started_at": now})
    data = _sync(
        client, user, {"type": "freeze", "task": habit_id, "date": today, "frozen": True}
    )
    assert data["timer"] is None


def test_no_notice_for_a_goal_past_midnight(db_url: str) -> None:
    """The timer stops at midnight: a goal it would reach only after that is not reached."""

    async def run() -> tuple[object, object]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "Аня", language="ru")
                task = await repo.create_task(
                    1, "Учёба", FrequencyType.daily, times_per_day=MAX_GOAL_SECONDS,
                    goal_unit="seconds",
                )
                started = datetime.now(timezone.utc) - timedelta(minutes=1)
                await apply_sync(
                    repo,
                    user,
                    [SyncTimer(type="timer", task=task.id, date=user_today(user), started_at=started)],
                )
                timer = await repo.get_timer(1)
                end = timer_day_end(user, started.replace(tzinfo=None))
                return timer.notify_at if timer else "none", end
        finally:
            await database.dispose()

    notify_at, end = asyncio.run(run())
    assert notify_at is None
    assert isinstance(end, datetime) and end > datetime.now(timezone.utc).replace(tzinfo=None)


def test_goal_text() -> None:
    assert bot_reminders.goal_text(90 * 60, "ru") == "1 ч 30 мин"
    assert bot_reminders.goal_text(2 * 3600, "en") == "2 h"
    assert bot_reminders.goal_text(60, "en") == "1 min"
