"""«Экспорт данных» / «Импорт данных»: файл со всем о пользователе и загрузка его в другой
аккаунт (привычки добавляются к текущим, совместные — обычными, настройки — из файла)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.constants import EXPORT_VERSION, MAX_HABITS_PER_USER
from tests.conftest import AuthUser, new_user
from tests.fake_telegram import FakeTelegram
from tests.test_sync import _sync, _today


@pytest.fixture
def telegram(client: TestClient) -> Iterator[FakeTelegram]:
    fake = FakeTelegram()
    original = client.app.state.bot
    client.app.state.bot = fake
    yield fake
    client.app.state.bot = original


def _export(client: TestClient, user: AuthUser) -> dict:
    response = client.get("/export", headers=user.headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-disposition"].startswith('attachment; filename="knot-export-')
    return response.json()


def _import(client: TestClient, user: AuthUser, data: object) -> dict:
    response = client.post("/import", json=data, headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _fill(client: TestClient, user: AuthUser) -> date:
    """Привычки с отметками, заметкой, заморозкой, папкой и настройками."""
    today = _today(client, user)
    _sync(
        client,
        user,
        {"type": "create", "ref": "run", "habit": {
            "name": "Бег", "frequency_type": "specific_days", "days": ["mon", "thu"],
            "reminder_times": ["07:30", "19:00"], "description": "Утром", "color": "#12ab34",
        }},
        {"type": "create", "ref": "water", "habit": {
            "name": "Вода", "frequency_type": "daily", "times_per_day": 3, "overtime": True,
        }},
        {"type": "create", "ref": "team", "habit": {
            "name": "Вместе", "frequency_type": "daily", "shared": True,
        }},
    )
    state = _sync(client, user)
    ids = {habit["name"]: habit["id"] for habit in state["habits"]}
    _sync(
        client,
        user,
        {"type": "mark", "task": ids["Бег"], "date": (today - timedelta(days=1)).isoformat(), "done": True},
        {"type": "mark", "task": ids["Вода"], "date": (today - timedelta(days=2)).isoformat(), "done": False, "count": 2},
        {"type": "note", "task": ids["Бег"], "date": (today - timedelta(days=1)).isoformat(), "text": "5 км"},
        {"type": "freeze", "task": ids["Вода"], "date": today.isoformat(), "frozen": True},
        {"type": "folder_create", "ref": "f", "folder": {"name": "Спорт", "habits": [ids["Бег"]]}},
        {"type": "settings", "patch": {"language": "en", "theme": "dark", "mark_yesterday": True}},
    )
    return today


def test_export_has_everything(client: TestClient, user: AuthUser) -> None:
    _fill(client, user)
    data = _export(client, user)
    assert (data["format"], data["version"]) == ("knot-export", EXPORT_VERSION)
    assert data["account"]["id"] == user.id
    assert data["settings"]["language"] == "en"
    habits = {habit["name"]: habit for habit in data["habits"]}
    run = habits["Бег"]
    assert run["days"] == ["mon", "thu"]
    assert run["reminder_times"] == ["07:30", "19:00"]
    assert run["description"] == "Утром" and run["color"] == "#12ab34"
    assert len(run["notes"]) == 1 and run["notes"][0]["text"] == "5 км"
    assert habits["Вода"]["marks"][0]["count"] == 2 and habits["Вода"]["marks"][0]["done"] is False
    assert habits["Вода"]["frozen_since"] is not None
    assert habits["Вместе"]["shared"] == {"is_owner": True, "members": 1}
    assert data["folders"][0]["habits"] == [run["id"]]


def test_import_into_another_account(client: TestClient, user: AuthUser) -> None:
    today = _fill(client, user)
    data = _export(client, user)
    # History older than the app shows (364 days) lives only in the file — it comes along.
    old = (today - timedelta(days=500)).isoformat()
    run_file = next(habit for habit in data["habits"] if habit["name"] == "Бег")
    run_file["marks"].insert(0, {"date": old, "done": True})
    other = new_user()
    _sync(client, other, {"type": "create", "ref": "x", "habit": {"name": "бег", "frequency_type": "daily"}})

    assert _import(client, other, data) == {"habits": 3, "folders": 1}
    state = _sync(client, other)
    habits = {habit["name"]: habit for habit in state["habits"]}
    # Added to what was there; the taken name got « (2)»; the shared one is ordinary.
    assert set(habits) == {"бег", "Бег (2)", "Вода", "Вместе"}
    assert habits["Вместе"]["group"] is None
    run = habits["Бег (2)"]
    assert run["reminder_times"] == ["07:30", "19:00"]
    assert run["notes"] == {(today - timedelta(days=1)).isoformat(): "5 км"}
    assert habits["Вода"]["frozen_since"] is not None
    assert state["settings"]["language"] == "en" and state["settings"]["mark_yesterday"] is True
    [folder] = state["folders"]
    assert folder["name"] == "Спорт" and folder["habits"] == [run["id"]]
    again = {habit["name"]: habit for habit in _export(client, other)["habits"]}
    assert [mark["date"] for mark in again["Бег (2)"]["marks"]] == [
        old, (today - timedelta(days=1)).isoformat()
    ]
    assert again["Вода"]["marks"][0]["count"] == 2


def test_import_respects_the_habit_limit(client: TestClient, user: AuthUser) -> None:
    habits = [{"id": index, "name": f"H{index}"} for index in range(MAX_HABITS_PER_USER)]
    _sync(client, user, {"type": "create", "ref": "x", "habit": {"name": "Есть", "frequency_type": "daily"}})
    response = client.post("/import", json={"format": "knot-export", "habits": habits}, headers=user.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "habit_limit"
    assert len(_sync(client, user)["habits"]) == 1


@pytest.mark.parametrize(
    "body",
    [
        {"habits": []},  # not our file
        {"format": "knot-export", "version": EXPORT_VERSION + 1},
        {"format": "knot-export", "habits": [{"id": 1, "name": "   "}]},
        {"format": "knot-export", "habits": [{"id": 1, "name": "A", "frequency_type": "weird"}]},
        [1, 2, 3],
    ],
)
def test_bad_files_change_nothing(client: TestClient, user: AuthUser, body: object) -> None:
    response = client.post("/import", json=body, headers=user.headers)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_import_file"
    assert _sync(client, user)["habits"] == []


def test_export_by_the_bot(client: TestClient, user: AuthUser, telegram: FakeTelegram) -> None:
    _fill(client, user)
    response = client.post("/export/telegram", headers=user.headers)
    assert response.status_code == 204, response.text
    [sent] = telegram.sent
    assert (sent.kind, sent.chat_id) == ("document", user.id)
    assert sent.extra["filename"].startswith("knot-export-")
    assert b'"knot-export"' in sent.media
    assert "Import Data" in (sent.text or "")  # the user's language (en, set in _fill)

    telegram.blocked.add(user.id)
    response = client.post("/export/telegram", headers=user.headers)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "export_chat_unavailable"
