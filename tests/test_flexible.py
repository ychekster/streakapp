"""«Гибкий график» (частота flexible): N дней за неделю / месяц / год в любые дни — цель
периода, серии в периодах, бонусные отметки сверх цели и напоминания. Совместная — в
test_groups.py."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.database import Database
from backend.models import FrequencyType, TaskStatus
from backend.repository import Repository
from backend.schedule import period_bounds, period_quota
from backend.services import due_reminders, flexible_streaks
from tests.conftest import AuthUser
from tests.test_sync import _sync

# Понедельник: недели 2026-08-31…2026-09-27 — четыре полные недели до него.
MONDAY = date(2026, 9, 28)


def _weekly(times: int, **fields: object) -> SimpleNamespace:
    return SimpleNamespace(
        frequency_type=FrequencyType.flexible,
        days=None,
        start_date=None,
        period="week",
        period_times=times,
        **fields,
    )


def _week(weeks_ago: int, *weekdays: int) -> set[date]:
    """Дни недели `weeks_ago` недель назад (0 — пн)."""
    start = MONDAY - timedelta(weeks=weeks_ago)
    return {start + timedelta(days=day) for day in weekdays}


def test_period_bounds_and_quota() -> None:
    assert period_bounds("week", date(2026, 10, 29)) == (date(2026, 10, 26), date(2026, 11, 1))
    assert period_bounds("month", date(2026, 2, 10)) == (date(2026, 2, 1), date(2026, 2, 28))
    assert period_bounds("year", date(2028, 5, 1)) == (date(2028, 1, 1), date(2028, 12, 31))
    # «31 раз в месяц» в феврале — 28, «366 в год» в невисокосный — 365.
    assert period_quota(31, date(2026, 2, 1), date(2026, 2, 28)) == 28
    assert period_quota(366, date(2026, 1, 1), date(2026, 12, 31)) == 365
    assert period_quota(3, date(2026, 2, 1), date(2026, 2, 28)) == 3


def test_streak_counts_weeks_with_the_goal() -> None:
    task = _weekly(3)
    # 4 недели назад — 3 дня, 3 недели — 4 дня, 2 недели — 2 дня (рвёт), прошлая — 3.
    done = _week(4, 0, 2, 4) | _week(3, 0, 1, 2, 3) | _week(2, 5, 6) | _week(1, 1, 3, 6)
    streaks = flexible_streaks(task, done, MONDAY)  # type: ignore[arg-type]
    assert (streaks.prior, streaks.prior_best, streaks.current, streaks.best) == (1, 2, 1, 2)
    assert (streaks.period_done, streaks.quota) == (0, 3)
    # В этой неделе набрано: серия +1.
    done |= _week(0, 0) | {MONDAY - timedelta(days=2), MONDAY - timedelta(days=1)}
    later = MONDAY + timedelta(days=2)
    done |= {MONDAY + timedelta(days=1), later}
    streaks = flexible_streaks(task, done, later)  # type: ignore[arg-type]
    assert (streaks.current, streaks.period_done) == (2, 3)


def test_partial_and_frozen_periods_do_not_break() -> None:
    task = _weekly(3)
    # Первая отметка в четверг: неполная неделя с одним днём серию не рвёт.
    done = _week(2, 3) | _week(1, 0, 1, 2)
    assert flexible_streaks(task, done, MONDAY).current == 1  # type: ignore[arg-type]
    # Неделя с заморозкой не рвёт; та же без заморозки — рвёт.
    done = _week(3, 0, 1, 2) | _week(2, 0) | _week(1, 0, 1, 2)
    frozen = _week(2, 3, 4)
    assert flexible_streaks(task, done, MONDAY, lambda day: day in frozen).current == 2  # type: ignore[arg-type]
    assert flexible_streaks(task, done, MONDAY).current == 1  # type: ignore[arg-type]


def test_schedule_change_inside_a_week_does_not_break() -> None:
    # До среды позапрошлой недели — каждый день, дальше — 3 раза в неделю.
    task = _weekly(3)
    until = MONDAY - timedelta(weeks=2) + timedelta(days=2)
    period = SimpleNamespace(
        until=until, frequency_type=FrequencyType.daily, days=None, start_date=None,
        period=None, period_times=None,
    )
    done = _week(2, 0) | _week(1, 0, 1, 2)
    streaks = flexible_streaks(task, done, MONDAY, periods=[period])  # type: ignore[arg-type]
    assert streaks.current == 1


def _habit(name: str, period: str, times: int, **fields: object) -> dict[str, object]:
    return {
        "name": name, "frequency_type": "flexible", "period": period, "period_times": times,
        **fields,
    }


def _today(client: TestClient, user: AuthUser) -> date:
    return date.fromisoformat(_sync(client, user)["today"])


def test_quota_closes_the_period(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    if today.timetuple().tm_yday == 1:
        pytest.skip("1 января: другого дня этого года ещё не было")
    created = _sync(client, user, {"type": "create", "ref": "y", "habit": _habit("Зал", "year", 1)})
    task_id = created["results"][0]["id"]
    habit = created["habits"][0]
    assert (habit["period"], habit["period_times"], habit["scheduled_today"]) == ("year", 1, True)

    def mark(day: date, done: bool = True) -> dict[str, object]:
        return {"type": "mark", "task": task_id, "date": day.isoformat(), "done": done}

    data = _sync(client, user, mark(today))
    [habit] = data["habits"]
    # В день, когда цель набрана, привычка остаётся «на сегодня» с отметкой.
    assert habit["scheduled_today"] is True and habit["period_done"] == 1
    assert (habit["current_streak"], habit["prior_streak"]) == (1, 0)
    # Другой день того же года — сверх цели, но отмечается: в периоде засчитан более
    # ранний день, сегодняшний стал бонусным (в сетке есть, в числах — нет).
    data = _sync(client, user, mark(today - timedelta(days=1)))
    assert data["results"][0]["ok"] is True
    habit = data["habits"][0]
    assert habit["history"][-2:] == [True, True]
    assert (habit["total_done"], habit["period_done"], habit["current_streak"]) == (1, 1, 1)
    assert habit["scheduled_today"] is False and habit["done_today"] is True
    # Сняли вчерашнюю — сегодняшняя засчитана снова.
    data = _sync(client, user, mark(today - timedelta(days=1), False))
    habit = data["habits"][0]
    assert habit["scheduled_today"] is True and habit["total_done"] == 1


def test_quota_counts_the_first_days_of_a_period(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    if today.timetuple().tm_yday == 1:
        pytest.skip("1 января: другого дня этого года ещё не было")
    habit = _habit("Вода", "year", 1, times_per_day=3)
    created = _sync(client, user, {"type": "create", "ref": "y", "habit": habit})
    task_id = created["results"][0]["id"]

    def mark(day: date, count: int) -> dict[str, object]:
        return {
            "type": "mark", "task": task_id, "date": day.isoformat(),
            "done": count >= 3, "count": count,
        }

    # Сегодня начат (2 из 3), а цель года набрал вчерашний день.
    data = _sync(client, user, mark(today, 2), mark(today - timedelta(days=1), 3))
    assert all(result["ok"] for result in data["results"])
    # Сегодняшний день можно добрать до цели — бонусом: цель года уже набрана вчера.
    data = _sync(client, user, mark(today, 3))
    assert data["results"][0]["ok"] is True
    [habit] = data["habits"]
    assert habit["done_today"] is True and habit["scheduled_today"] is False
    assert (habit["total_done"], habit["period_done"]) == (1, 1)


def test_flexible_form_is_validated(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _habit("A", "decade", 1)},
        {"type": "create", "ref": "b", "habit": _habit("B", "month", 32)},
        {"type": "create", "ref": "c", "habit": _habit("C", "month", 31)},
    )
    assert [result["error"]["code"] if result["error"] else None for result in data["results"]] == [
        "invalid_period", "invalid_period_times", None,
    ]
    # Смена частоты на обычную забывает период.
    habit_id = data["results"][2]["id"]
    data = _sync(
        client,
        user,
        {"type": "update", "task": habit_id, "habit": {"name": "C", "frequency_type": "daily"}},
    )
    [habit] = data["habits"]
    assert (habit["frequency_type"], habit["period"], habit["period_times"]) == ("daily", None, None)


# 06:00 UTC = 09:00 в Москве, вторник 2026-09-22.
MOMENT = datetime(2026, 9, 22, 6, 0, tzinfo=timezone.utc)


def test_reminders_stop_once_the_goal_is_reached(db_url: str) -> None:
    async def run() -> list[str | None]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "U", language="en")
                await repo.update_settings(user, timezone="Europe/Moscow")
                nine = time(9, 0)
                for name, times in (("open", 2), ("closed", 1)):
                    task = await repo.create_task(
                        1, name, FrequencyType.flexible, period="week", period_times=times,
                        reminder_time=nine,
                    )
                    # В понедельник выполнена: «1 раз в неделю» уже набрана.
                    log = await repo.get_or_create_log(task.id, 1, date(2026, 9, 21))
                    await repo.set_log_status(log, TaskStatus.done)
                await session.commit()
            async with database.session_factory() as session:
                return [item.habit_name for item in await due_reminders(Repository(session), MOMENT)]
        finally:
            await database.dispose()

    assert asyncio.run(run()) == ["open"]

