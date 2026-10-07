"""POST /sync: изменения, накопленные на устройстве (в том числе без связи), применяются
пачкой по порядку, каждая операция отдельно; ответ — состояние после них."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AuthUser
from tests.fake_telegram import FakeTelegram
from backend.constants import HISTORY_DAYS, SYNC_MAX_OPS


def _habit(name: str = "Зарядка", **fields: object) -> dict[str, object]:
    return {"name": name, "frequency_type": "daily", **fields}


def _sync(client: TestClient, user: AuthUser, *ops: dict[str, object]) -> dict:
    response = client.post("/sync", json={"ops": list(ops)}, headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _today(client: TestClient, user: AuthUser) -> date:
    return date.fromisoformat(_sync(client, user)["today"])


@pytest.fixture
def telegram(client: TestClient) -> Iterator[FakeTelegram]:
    fake = FakeTelegram()
    original = client.app.state.bot
    client.app.state.bot = fake
    yield fake
    client.app.state.bot = original


def test_empty_sync_is_the_state(client: TestClient, user: AuthUser) -> None:
    data = _sync(client, user)
    assert data["results"] == []
    assert data["habits"] == []
    assert data["settings"]["language"] == "ru"
    assert date.fromisoformat(data["today"])


def test_offline_habit_is_created_once_and_found_by_its_ref(
    client: TestClient, user: AuthUser
) -> None:
    today = _today(client, user)
    ops = (
        {"type": "create", "ref": "dev-1", "habit": _habit()},
        {"type": "mark", "task": "dev-1", "date": today.isoformat(), "done": True},
        {"type": "update", "task": "dev-1", "habit": _habit("Бег", color="green")},
    )
    first = _sync(client, user, *ops)
    assert [result["ok"] for result in first["results"]] == [True, True, True]
    habit_id = first["results"][0]["id"]
    [habit] = first["habits"]
    assert (habit["id"], habit["name"], habit["color"]) == (habit_id, "Бег", "green")
    assert habit["done_today"] is True and habit["history"][-1] is True

    # The answer was lost and the device sends the same batch again: still one habit.
    again = _sync(client, user, *ops)
    assert again["results"][0] == {"ok": True, "id": habit_id, "error": None}
    assert [item["id"] for item in again["habits"]] == [habit_id]
    assert again["habits"][0]["total_done"] == 1


def test_mark_sets_a_day_and_is_idempotent(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    yesterday = today - timedelta(days=1)
    created = _sync(client, user, {"type": "create", "ref": "a", "habit": _habit()})
    habit_id = created["results"][0]["id"]

    def mark(day: date, done: bool) -> dict[str, object]:
        return {"type": "mark", "task": habit_id, "date": day.isoformat(), "done": done}

    data = _sync(client, user, mark(yesterday, True), mark(today, True), mark(today, True))
    [habit] = data["habits"]
    assert habit["history"][-2:] == [True, True]
    assert (habit["current_streak"], habit["total_done"]) == (2, 2)

    data = _sync(client, user, mark(today, False), mark(today, False))
    assert data["habits"][0]["history"][-2:] == [True, False]
    assert data["habits"][0]["done_today"] is False


def test_habit_done_several_times_a_day(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    created = _sync(
        client, user, {"type": "create", "ref": "w", "habit": _habit("Вода", times_per_day=3)}
    )
    habit_id = created["results"][0]["id"]
    assert (created["habits"][0]["times_per_day"], created["habits"][0]["today_count"]) == (3, 0)

    def count(value: int) -> dict[str, object]:
        return {
            "type": "mark",
            "task": habit_id,
            "date": today.isoformat(),
            "done": False,
            "count": value,
        }

    [habit] = _sync(client, user, count(1), count(2))["habits"]
    assert (habit["today_count"], habit["done_today"], habit["total_done"]) == (2, False, 0)
    # Done once the goal is reached — the server counts it, whatever `done` says.
    [habit] = _sync(client, user, count(3))["habits"]
    assert (habit["today_count"], habit["done_today"], habit["current_streak"]) == (3, True, 1)
    [habit] = _sync(client, user, count(0))["habits"]
    assert (habit["today_count"], habit["done_today"]) == (0, False)

    # A plain mark clears the count; the goal is checked.
    [habit] = _sync(
        client, user, {"type": "mark", "task": habit_id, "date": today.isoformat(), "done": True}
    )["habits"]
    assert (habit["today_count"], habit["done_today"]) == (0, True)
    refused = _sync(
        client, user, {"type": "update", "task": habit_id, "habit": _habit("Вода", times_per_day=97)}
    )
    assert refused["results"][0]["error"]["code"] == "invalid_times_per_day"


def test_mark_outside_the_history_is_refused(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    created = _sync(client, user, {"type": "create", "ref": "a", "habit": _habit()})
    habit_id = created["results"][0]["id"]
    data = _sync(
        client,
        user,
        {"type": "mark", "task": habit_id, "date": (today + timedelta(days=1)).isoformat(),
         "done": True},
        {"type": "mark", "task": habit_id,
         "date": (today - timedelta(days=HISTORY_DAYS)).isoformat(), "done": True},
        {"type": "mark", "task": habit_id,
         "date": (today - timedelta(days=HISTORY_DAYS - 1)).isoformat(), "done": True},
    )
    codes = [result["error"] and result["error"]["code"] for result in data["results"]]
    assert codes == ["invalid_date", "invalid_date", None]
    assert data["habits"][0]["history"][0] is True
    assert data["habits"][0]["total_done"] == 1


def test_freeze_keeps_the_streak_and_marks_its_days(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    created = _sync(client, user, {"type": "create", "ref": "a", "habit": _habit()})
    habit_id = created["results"][0]["id"]

    def day(offset: int) -> str:
        return (today - timedelta(days=offset)).isoformat()

    def freeze(offset: int, frozen: bool) -> dict[str, object]:
        return {"type": "freeze", "task": habit_id, "date": day(offset), "frozen": frozen}

    # Выполнена 5 и 4 дня назад, заморожена 3 и 2 дня назад, выполнена вчера.
    data = _sync(
        client,
        user,
        {"type": "mark", "task": habit_id, "date": day(5), "done": True},
        {"type": "mark", "task": habit_id, "date": day(4), "done": True},
        freeze(3, True),
        freeze(3, True),  # повтор — не новая заморозка
        freeze(1, False),
        freeze(1, False),
        {"type": "mark", "task": habit_id, "date": day(1), "done": True},
    )
    assert all(result["ok"] for result in data["results"])
    [habit] = data["habits"]
    assert habit["frozen_since"] is None
    assert habit["frozen_history"][-6:] == [False, False, True, True, False, False]
    assert habit["current_streak"] == 3

    # Текущая заморозка: с сегодняшнего дня, сегодня — уже замороженный день.
    data = _sync(client, user, freeze(0, True))
    habit = data["habits"][0]
    assert habit["frozen_since"] == today.isoformat()
    assert habit["frozen_history"][-1] is True
    assert habit["current_streak"] == 3

    # Разморозили в тот же день — заморозка не оставила дней.
    data = _sync(client, user, freeze(0, False))
    habit = data["habits"][0]
    assert habit["frozen_since"] is None
    assert habit["frozen_history"][-2:] == [False, False]


def test_freeze_outside_the_history_is_refused(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    created = _sync(client, user, {"type": "create", "ref": "a", "habit": _habit()})
    habit_id = created["results"][0]["id"]
    data = _sync(
        client,
        user,
        {"type": "freeze", "task": habit_id, "date": (today + timedelta(days=1)).isoformat(),
         "frozen": True},
    )
    assert data["results"][0]["error"]["code"] == "invalid_date"
    assert data["habits"][0]["frozen_since"] is None


def test_a_refused_operation_does_not_stop_the_others(
    client: TestClient, user: AuthUser
) -> None:
    data = _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _habit("Вода")},
        {"type": "create", "ref": "b", "habit": _habit("вода")},
        {"type": "mark", "task": "b", "date": _today(client, user).isoformat(), "done": True},
        {"type": "update", "task": 999_999_999, "habit": _habit("Сон")},
        {"type": "settings", "patch": {"theme": "dark"}},
    )
    codes = [result["error"] and result["error"]["code"] for result in data["results"]]
    assert codes == [None, "duplicate_name", "task_not_found", "task_not_found", None]
    assert [habit["name"] for habit in data["habits"]] == ["Вода"]
    assert data["settings"]["theme"] == "dark"


def test_delete_is_idempotent_and_works_by_ref(client: TestClient, user: AuthUser) -> None:
    created = _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _habit("Один")},
        {"type": "create", "ref": "b", "habit": _habit("Два")},
    )
    first_id = created["results"][0]["id"]
    data = _sync(
        client,
        user,
        {"type": "delete", "task": first_id},
        {"type": "delete", "task": first_id},
        {"type": "delete", "task": "b"},
        {"type": "delete", "task": "never-created"},
    )
    assert all(result["ok"] for result in data["results"])
    assert data["habits"] == []
    # A retried create of a deleted habit does not bring it back.
    again = _sync(client, user, {"type": "create", "ref": "a", "habit": _habit("Один")})
    assert again["results"][0]["id"] == first_id
    assert again["habits"] == []


def test_operations_apply_in_order(client: TestClient, user: AuthUser) -> None:
    today = _today(client, user)
    data = _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _habit()},
        {"type": "settings", "patch": {"mark_yesterday": True}},
        # Today is no longer a day to mark: the marking day is yesterday now.
        {"type": "mark", "task": "a", "date": today.isoformat(), "done": True},
        {"type": "mark", "task": "a", "date": (today - timedelta(days=1)).isoformat(),
         "done": True},
    )
    codes = [result["error"] and result["error"]["code"] for result in data["results"]]
    assert codes == [None, None, "invalid_date", None]
    assert data["today"] == (today - timedelta(days=1)).isoformat()
    assert data["settings"]["mark_yesterday"] is True
    assert data["habits"][0]["done_today"] is True


def test_other_users_habit_is_not_reachable(
    client: TestClient, user: AuthUser, other_user: AuthUser
) -> None:
    theirs = _sync(client, other_user, {"type": "create", "ref": "same", "habit": _habit()})
    their_id = theirs["results"][0]["id"]
    today = _today(client, user).isoformat()
    data = _sync(
        client,
        user,
        {"type": "mark", "task": their_id, "date": today, "done": True},
        {"type": "mark", "task": "same", "date": today, "done": True},
        {"type": "delete", "task": their_id},
    )
    codes = [result["error"] and result["error"]["code"] for result in data["results"]]
    assert codes == ["task_not_found", "task_not_found", None]
    # The same device id in another account is another habit.
    mine = _sync(client, user, {"type": "create", "ref": "same", "habit": _habit()})
    assert mine["results"][0]["id"] != their_id
    assert len(_sync(client, other_user)["habits"]) == 1


def test_too_many_operations_are_refused(client: TestClient, user: AuthUser) -> None:
    ops = [{"type": "settings", "patch": {"theme": "dark"}}] * (SYNC_MAX_OPS + 1)
    response = client.post("/sync", json={"ops": ops}, headers=user.headers)
    assert response.status_code == 422


def test_first_checkin_through_sync_offers_the_app_once(
    client: TestClient, telegram: FakeTelegram, user: AuthUser
) -> None:
    today = _today(client, user).isoformat()
    _sync(
        client,
        user,
        {"type": "create", "ref": "a", "habit": _habit()},
        {"type": "mark", "task": "a", "date": today, "done": True},
    )
    _sync(client, user, {"type": "mark", "task": "a", "date": today, "done": False})
    _sync(client, user, {"type": "mark", "task": "a", "date": today, "done": True})
    offers = [sent for sent in telegram.sent if sent.chat_id == user.id]
    assert len(offers) == 1
