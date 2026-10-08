"""Автоотметка: какие привычки бот отмечает сам (services.auto_mark_due) и
отметка сразу при включении (POST /sync, update)."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, timezone

from fastapi.testclient import TestClient

from tests.conftest import AuthUser
from backend.constants import WEEKDAYS
from backend.database import Database
from backend.models import FrequencyType, TaskStatus
from backend.repository import Repository
from backend.services import auto_mark_due

# 06:00 UTC = 09:00 в Москве (UTC+3).
MOMENT = datetime(2026, 9, 22, 6, 0, tzinfo=timezone.utc)
TODAY = date(2026, 9, 22)


def test_auto_mark_due(db_url: str) -> None:
    other_day = WEEKDAYS[(TODAY.weekday() + 1) % 7]

    async def run() -> tuple[int, int, dict[str, TaskStatus | None]]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "U", language="en")
                await repo.update_settings(user, timezone="Europe/Moscow")
                ids: dict[str, int] = {}

                async def task(name: str, **fields) -> None:
                    created = await repo.create_task(
                        1, name, fields.pop("frequency", FrequencyType.daily),
                        auto_mark=fields.pop("auto", True), **fields,
                    )
                    ids[name] = created.id

                await task("no reminder")
                await task("reminder passed", reminder_time=time(9, 0))
                await task("reminder later", reminder_time=time(9, 1))
                # Несколько напоминаний — отмечается после последнего.
                await task(
                    "last reminder passed", reminder_time=time(7, 0),
                    extra_reminder_times=[time(9, 0)],
                )
                await task(
                    "last reminder later", reminder_time=time(8, 0),
                    extra_reminder_times=[time(20, 0)],
                )
                await task("not today", frequency=FrequencyType.specific_days, days=other_day)
                await task("several times", times_per_day=3)
                await task("off", auto=False)
                await task("unmarked by user")
                await repo.get_or_create_log(ids["unmarked by user"], 1, TODAY)
                await task("frozen")
                frozen = await repo.get_active_task(ids["frozen"], 1)
                await repo.freeze_task(frozen, TODAY - timedelta(days=1))
                await session.commit()
            async with database.session_factory() as session:
                first = await auto_mark_due(Repository(session), MOMENT)
                await session.commit()
            async with database.session_factory() as session:
                again = await auto_mark_due(Repository(session), MOMENT)
                repo = Repository(session)
                statuses = {}
                for name, task_id in ids.items():
                    log = await repo.get_log(task_id, TODAY)
                    statuses[name] = log.status if log else None
            return first, again, statuses
        finally:
            await database.dispose()

    first, again, statuses = asyncio.run(run())
    assert (first, again) == (3, 0)
    assert statuses == {
        "no reminder": TaskStatus.done,
        "reminder passed": TaskStatus.done,
        "reminder later": None,
        "last reminder passed": TaskStatus.done,
        "last reminder later": None,
        "not today": None,
        "several times": None,
        "off": None,
        "unmarked by user": TaskStatus.pending,
        "frozen": None,
    }


def test_turning_auto_mark_on_marks_today(client: TestClient, user: AuthUser) -> None:
    def sync(*ops: dict[str, object]) -> dict:
        response = client.post("/sync", json={"ops": list(ops)}, headers=user.headers)
        assert response.status_code == 200, response.text
        return response.json()

    habit = {"name": "Зарядка", "frequency_type": "daily"}
    created = sync({"type": "create", "ref": "a", "habit": habit})
    habit_id = created["results"][0]["id"]
    assert created["habits"][0]["auto_mark"] is False
    # No record for today yet: the app may show an auto check-off by itself.
    assert created["habits"][0]["auto_mark_ahead"] is True

    [result] = sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": True}})[
        "habits"
    ]
    assert (result["auto_mark"], result["done_today"]) == (True, True)

    # Unchecked by the user, auto check-off turned off and on again: today is checked again.
    today = sync()["today"]
    [unchecked] = sync({"type": "mark", "task": habit_id, "date": today, "done": False})["habits"]
    # The user removed it: the app must not show it again.
    assert (unchecked["done_today"], unchecked["auto_mark_ahead"]) == (False, False)
    sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": False}})
    [result] = sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": True}})[
        "habits"
    ]
    assert result["done_today"] is True

    # Unchecked, then turned on again with a reminder still ahead: the unchecked record is
    # forgotten, so after the reminder the bot (and the app) mark the day again.
    sync({"type": "mark", "task": habit_id, "date": today, "done": False})
    sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": False}})
    later = {**habit, "reminder_times": ["23:59"]}
    [result] = sync({"type": "update", "task": habit_id, "habit": {**later, "auto_mark": True}})[
        "habits"
    ]
    assert (result["done_today"], result["auto_mark_ahead"]) == (False, True)

    # Unchecked, frozen, turned on while frozen: the unchecked record is forgotten as well,
    # so on unfreezing the same day the bot (and the app) mark today again.
    sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": False}})
    sync({"type": "mark", "task": habit_id, "date": today, "done": False})
    sync({"type": "freeze", "task": habit_id, "date": today, "frozen": True})
    [result] = sync({"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": True}})[
        "habits"
    ]
    assert (result["done_today"], result["auto_mark_ahead"]) == (False, True)
    sync({"type": "freeze", "task": habit_id, "date": today, "frozen": False})

    # Several times a day: auto check-off is not available.
    [result] = sync(
        {"type": "update", "task": habit_id, "habit": {**habit, "auto_mark": True, "times_per_day": 2}}
    )["habits"]
    assert result["auto_mark"] is False
