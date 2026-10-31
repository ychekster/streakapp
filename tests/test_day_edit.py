"""Окно дня в календаре: отметка за любой прошлый день, бонусные отметки (в сетке есть, в
числах — нет) и заметки к дням."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

from fastapi.testclient import TestClient

from backend.constants import HISTORY_DAYS, NOTE_MAX_LENGTH
from backend.models import FrequencyType
from backend.services import compute_streaks, counted_days
from tests.conftest import AuthUser
from tests.test_sync import _sync, _today

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _create(client: TestClient, user: AuthUser, **habit: object) -> int:
    data = _sync(
        client, user, {"type": "create", "ref": "h", "habit": {"name": "Бег", **habit}}
    )
    return data["results"][0]["id"]


def _mark(task_id: int, day: date, done: bool = True) -> dict[str, object]:
    return {"type": "mark", "task": task_id, "date": day.isoformat(), "done": done}


def test_a_missed_past_day_can_be_fixed(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    task_id = _create(client, user, frequency_type="daily")
    days = [today - timedelta(days=offset) for offset in (5, 4, 2, 1)]
    habit = _sync(client, user, *(_mark(task_id, day) for day in days))["habits"][0]
    assert (habit["current_streak"], habit["best_streak"], habit["total_done"]) == (2, 2, 4)
    # Пропуск три дня назад исправили — серии склеились.
    habit = _sync(client, user, _mark(task_id, today - timedelta(days=3)))["habits"][0]
    assert (habit["current_streak"], habit["best_streak"], habit["total_done"]) == (5, 5, 5)


def test_unscheduled_day_is_a_bonus(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    # Только по дню недели вчерашнего дня: сегодня не запланирована.
    yesterday = today - timedelta(days=1)
    task_id = _create(
        client, user, frequency_type="specific_days", days=[WEEKDAYS[yesterday.weekday()]]
    )
    habit = _sync(client, user, _mark(task_id, yesterday))["habits"][0]
    assert (habit["current_streak"], habit["total_done"]) == (1, 1)
    # Сегодня не по графику: отметка в сетке и во «всего выполнено», но не в сериях.
    habit = _sync(client, user, _mark(task_id, today))["habits"][0]
    assert habit["scheduled_today"] is False and habit["done_today"] is True
    assert habit["history"][-1] is True
    assert (habit["current_streak"], habit["best_streak"], habit["total_done"]) == (1, 1, 2)
    # Бонусные дни между запланированными серию не рвут: неделю назад — тоже по графику.
    week_ago = yesterday - timedelta(days=7)
    habit = _sync(
        client, user, _mark(task_id, week_ago), _mark(task_id, week_ago + timedelta(days=1))
    )["habits"][0]
    assert (habit["current_streak"], habit["total_done"]) == (2, 4)


def test_past_day_is_judged_by_its_own_schedule() -> None:
    # До воскресенья — пн/ср/пт, с воскресенья — каждый день. Вторник прошлой недели тогда
    # был не по графику: его отметка — бонусная, хоть сейчас график и ежедневный.
    sunday = date(2026, 9, 27)
    monday = sunday - timedelta(days=6)
    task = SimpleNamespace(frequency_type=FrequencyType.daily, days=None, start_date=None)
    period = SimpleNamespace(
        until=sunday, frequency_type=FrequencyType.specific_days, days="mon,wed,fri",
        start_date=None, period=None, period_times=None,
    )
    done = {monday, monday + timedelta(days=1), monday + timedelta(days=2), sunday}
    counted = counted_days(task, done, periods=[period])  # type: ignore[arg-type]
    assert counted == {monday, monday + timedelta(days=2), sunday}
    # Пятница по тому графику пропущена — серия с воскресенья.
    assert compute_streaks(task, done, sunday, periods=[period]) == (1, 2)  # type: ignore[arg-type]


def test_several_times_a_day_uses_the_current_goal(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    task_id = _create(client, user, frequency_type="daily", times_per_day=3)
    day = today - timedelta(days=10)

    def count(value: int) -> dict[str, object]:
        return {
            "type": "mark", "task": task_id, "date": day.isoformat(),
            "done": value >= 3, "count": value,
        }

    habit = _sync(client, user, count(2))["habits"][0]
    assert habit["history_counts"][-11] == 2 and habit["history"][-11] is False
    habit = _sync(client, user, count(3))["habits"][0]
    assert habit["history"][-11] is True and habit["total_done"] == 1


def test_day_notes(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    task_id = _create(client, user, frequency_type="daily")
    day = today - timedelta(days=3)

    def note(text: str, on: date = day) -> dict[str, object]:
        return {"type": "note", "task": task_id, "date": on.isoformat(), "text": text}

    data = _sync(client, user, note("  Болел,\r\n\r\n\r\nно   вышел  "))
    assert data["results"][0]["ok"] is True
    assert data["habits"][0]["notes"] == {day.isoformat(): "Болел,\n\nно вышел"}
    data = _sync(client, user, note("Бегал 5 км"))
    assert data["habits"][0]["notes"] == {day.isoformat(): "Бегал 5 км"}
    # Пустая — удалить.
    data = _sync(client, user, note("   "))
    assert data["habits"][0]["notes"] == {}
    # Слишком длинная, вне истории, в будущем — отвергнуты.
    data = _sync(
        client,
        user,
        note("я" * (NOTE_MAX_LENGTH + 1)),
        note("x", today - timedelta(days=HISTORY_DAYS)),
        note("x", today + timedelta(days=1)),
    )
    assert [result["error"]["code"] for result in data["results"]] == [
        "invalid_note", "invalid_date", "invalid_date",
    ]
