"""Задачи (бета; настройки → «Задачи»): разовые дела и их папки едут через POST /sync,
как папки привычек; с привычками не связаны."""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient

from bot import reminders as bot_reminders
from bot.pacing import Pacer
from tests.conftest import AuthUser
from tests.fake_telegram import FakeTelegram
from backend.constants import MAX_TODO_FOLDERS_PER_USER
from backend.database import Database
from backend.repository import Repository
from backend.schemas import SyncTodoCreate
from backend.services import DueReminder, apply_sync, due_todo_reminders


def _sync(client: TestClient, user: AuthUser, *ops: dict[str, object]) -> dict:
    response = client.post("/sync", json={"ops": list(ops)}, headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_no_todos_by_default(client: TestClient, user: AuthUser) -> None:
    data = _sync(client, user)
    assert data["todos"] == []
    assert data["todo_folders"] == []


def test_todo_in_offline_folder_is_created_once(client: TestClient, user: AuthUser) -> None:
    ops = (
        {"type": "todo_folder_create", "ref": "f-1", "name": " Учёба\n"},
        {"type": "todo_create", "ref": "t-1", "text": "Сдать лабу", "folder": "f-1"},
        {"type": "todo_create", "ref": "t-2", "text": "Купить хлеб"},
    )
    first = _sync(client, user, *ops)
    assert all(result["ok"] for result in first["results"])
    folder_id = first["results"][0]["id"]
    assert first["todo_folders"] == [
        {"id": folder_id, "name": "Учёба", "kind": None, "color": None}
    ]
    todos = first["todos"]
    assert [(todo["text"], todo["folder"], todo["done_at"]) for todo in todos] == [
        ("Сдать лабу", folder_id, None),
        ("Купить хлеб", None, None),
    ]
    assert todos[0]["id"] == first["results"][1]["id"]

    # Ответ не дошёл — устройство шлёт то же ещё раз: те же задачи, не вторые.
    again = _sync(client, user, *ops)
    assert [result["id"] for result in again["results"]] == [
        result["id"] for result in first["results"]
    ]
    assert len(again["todos"]) == 2
    assert len(again["todo_folders"]) == 1


def test_todo_done_text_and_delete(client: TestClient, user: AuthUser) -> None:
    data = _sync(client, user, {"type": "todo_create", "ref": "t-1", "text": "Позвонить"})
    todo_id = data["todos"][0]["id"]
    data = _sync(client, user, {"type": "todo_update", "key": todo_id, "done": True})
    done_at = data["todos"][0]["done_at"]
    assert done_at is not None
    # Повтор отметки не сдвигает время.
    data = _sync(client, user, {"type": "todo_update", "key": "t-1", "done": True, "text": "Позвонить маме"})
    assert data["todos"][0]["done_at"] == done_at
    assert data["todos"][0]["text"] == "Позвонить маме"
    data = _sync(client, user, {"type": "todo_update", "key": todo_id, "done": False})
    assert data["todos"][0]["done_at"] is None

    data = _sync(client, user, {"type": "todo_update", "key": todo_id, "text": "  "})
    assert data["results"][0]["error"]["code"] == "invalid_todo"

    data = _sync(client, user, {"type": "todo_delete", "key": todo_id})
    assert data["todos"] == []
    # Уже удалённая — не ошибка; изменить её нельзя.
    data = _sync(
        client,
        user,
        {"type": "todo_delete", "key": todo_id},
        {"type": "todo_update", "key": todo_id, "done": True},
    )
    assert data["results"][0]["ok"]
    assert data["results"][1]["error"]["code"] == "todo_not_found"


def test_todo_moves_between_folders(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "f-1", "name": "Работа"},
        {"type": "todo_create", "ref": "t-1", "text": "Отчёт"},
        {"type": "todo_update", "key": "t-1", "folder": "f-1"},
    )
    folder_id = data["todo_folders"][0]["id"]
    assert data["todos"][0]["folder"] == folder_id
    data = _sync(client, user, {"type": "todo_update", "key": "t-1", "no_folder": True})
    assert data["todos"][0]["folder"] is None


def test_deleting_folder_keeps_its_todos(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "f-1", "name": "Дом"},
        {"type": "todo_create", "ref": "t-1", "text": "Помыть окна", "folder": "f-1"},
        {"type": "todo_folder_delete", "key": "f-1"},
    )
    assert data["todo_folders"] == []
    assert data["todos"][0]["text"] == "Помыть окна"
    assert data["todos"][0]["folder"] is None
    # Задача в уже удалённую папку — без папки.
    data = _sync(client, user, {"type": "todo_create", "ref": "t-2", "text": "Ещё", "folder": "f-1"})
    assert data["results"][0]["ok"]
    assert data["todos"][1]["folder"] is None


def test_todo_folder_order_and_rename(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "a", "name": "Работа"},
        {"type": "todo_folder_create", "ref": "b", "name": "Учёба"},
        {"type": "todo_folder_create", "ref": "c", "name": "Дом"},
        {"type": "todo_folder_order", "order": ["c", "a"]},
        {"type": "todo_folder_update", "key": "a", "name": "Работа и деньги"},
    )
    assert [folder["name"] for folder in data["todo_folders"]] == [
        "Дом",
        "Работа и деньги",
        "Учёба",
    ]
    data = _sync(client, user, {"type": "todo_folder_update", "key": "a", "name": ""})
    assert data["results"][0]["error"]["code"] == "invalid_folder_name"


def test_todo_folder_limit(client: TestClient, user: AuthUser) -> None:
    ops = [
        {"type": "todo_folder_create", "ref": f"f-{index}", "name": f"Папка {index}"}
        for index in range(MAX_TODO_FOLDERS_PER_USER + 1)
    ]
    data = _sync(client, user, *ops)
    assert len(data["todo_folders"]) == MAX_TODO_FOLDERS_PER_USER
    assert data["results"][-1]["error"]["code"] == "todo_folder_limit"


def test_todos_are_private(client: TestClient, user: AuthUser, other_user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "f-1", "name": "Моё"},
        {"type": "todo_create", "ref": "t-1", "text": "Секрет", "folder": "f-1"},
    )
    todo_id = data["todos"][0]["id"]
    folder_id = data["todo_folders"][0]["id"]
    other = _sync(
        client,
        other_user,
        {"type": "todo_update", "key": todo_id, "done": True},
        {"type": "todo_delete", "key": todo_id},
        {"type": "todo_create", "ref": "x", "text": "Чужая папка", "folder": folder_id},
    )
    assert other["results"][0]["error"]["code"] == "todo_not_found"
    assert other["todo_folders"] == []
    assert other["todos"][0]["folder"] is None
    mine = _sync(client, user)
    assert mine["todos"][0]["done_at"] is None
    assert len(mine["todos"]) == 1


def test_show_todos_setting_is_off_by_default(client: TestClient, user: AuthUser) -> None:
    assert _sync(client, user)["settings"]["show_todos"] is False
    data = _sync(client, user, {"type": "settings", "patch": {"show_todos": True}})
    assert data["settings"]["show_todos"] is True


def test_todo_date_and_reminder_are_set_and_cleared(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_create", "ref": "t", "text": "Банк", "due_date": "2030-05-02", "remind_time": "15:00"},
    )
    todo = data["todos"][0]
    assert (todo["due_date"], todo["remind_time"]) == ("2030-05-02", "15:00")
    # Only the reminder off: the date stays; a text edit does not touch them.
    data = _sync(
        client,
        user,
        {"type": "todo_update", "key": "t", "remind_time": None},
        {"type": "todo_update", "key": "t", "text": "Банк завтра"},
    )
    todo = data["todos"][0]
    assert (todo["due_date"], todo["remind_time"]) == ("2030-05-02", None)
    data = _sync(
        client,
        user,
        {"type": "todo_update", "key": "t", "due_date": None},
        {"type": "todo_update", "key": "t", "remind_time": "25:00"},
    )
    assert data["todos"][0]["due_date"] is None
    assert data["results"][1]["error"]["code"] == "invalid_reminder_time"


def test_todo_reminder_moment_is_in_the_users_zone(db_url: str) -> None:
    async def run() -> list[object]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "Аня", language="ru")
                user.timezone = "Asia/Almaty"
                day = date.today() + timedelta(days=3)
                past = date.today() - timedelta(days=1)
                await apply_sync(
                    repo,
                    user,
                    [
                        SyncTodoCreate(type="todo_create", ref="a", text="A", due_date=day, remind_time="09:00"),
                        SyncTodoCreate(type="todo_create", ref="b", text="B", due_date=past, remind_time="09:00"),
                        SyncTodoCreate(type="todo_create", ref="c", text="C", remind_time="09:00"),
                    ],
                )
                todos = await repo.get_todos(1)
                return [todo.remind_at for todo in todos]
        finally:
            await database.dispose()

    moments = asyncio.run(run())
    day = date.today() + timedelta(days=3)
    # 09:00 in Almaty (UTC+5) is 04:00 UTC; a past day and no day — no reminder.
    assert moments == [datetime(day.year, day.month, day.day, 4, 0), None, None]


def test_todo_reminder_comes_once_and_not_for_done(db_url: str) -> None:
    async def run() -> tuple[list[Any], list[Any]]:
        database = Database(db_url)
        await database.create_tables()
        telegram = FakeTelegram()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "Аня", language="ru")
                user.show_todos = True
                # Вкладка «Задачи» выключена — напоминаний нет.
                await repo.get_or_create_user(2, None, "Боря", language="ru")
                soon = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
                await repo.create_todo(1, "Позвонить в банк", None, None, remind_at=soon)
                await repo.create_todo(
                    1, "Уже сделано", None, None, remind_at=soon, done_at=soon
                )
                await repo.create_todo(2, "Без вкладки", None, None, remind_at=soon)
                await session.commit()
            keyboards = bot_reminders.open_app_keyboards("https://example.com")
            for _ in range(2):
                await bot_reminders._send_todo_reminders(
                    telegram, database, Pacer(1000), keyboards  # type: ignore[arg-type]
                )
            async with database.session_factory() as session:
                left = await due_todo_reminders(
                    Repository(session), datetime.now(timezone.utc).replace(tzinfo=None)
                )
            return telegram.sent, left
        finally:
            await database.dispose()

    sent, left = asyncio.run(run())
    assert [(item.chat_id, item.text.endswith("Позвонить в банк")) for item in sent] == [(1, True)]
    assert left == []


def test_todo_push_opens_the_app() -> None:
    reminder = DueReminder(
        task_id=None, user_id=1, habit_name="Банк", language="ru", todo_id=7
    )
    payload = bot_reminders.push_payload(reminder, "https://example.com")
    assert payload["title"] == "Банк"
    assert payload["tag"] == "todo-7"


def test_recommended_todo_list_keeps_its_kind_once(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "a", "name": "Сегодня", "kind": "today"},
        {"type": "todo_folder_create", "ref": "b", "name": "Снова", "kind": "today"},
        {"type": "todo_folder_create", "ref": "c", "name": "Дом"},
    )
    assert data["results"][1]["error"]["code"] == "todo_folder_kind_taken"
    assert [(item["name"], item["kind"]) for item in data["todo_folders"]] == [
        ("Сегодня", "today"),
        ("Дом", None),
    ]


def test_todo_settings_are_off_by_default(client: TestClient, user: AuthUser) -> None:
    settings = _sync(client, user)["settings"]
    assert (settings["todo_folder_swipe"], settings["todo_checks_right"]) == (False, False)
    patch = {"todo_folder_swipe": True, "todo_checks_right": True}
    settings = _sync(client, user, {"type": "settings", "patch": patch})["settings"]
    assert (settings["todo_folder_swipe"], settings["todo_checks_right"]) == (True, True)


def test_all_todos_place_among_lists(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "a", "name": "Работа"},
        {"type": "todo_folder_create", "ref": "b", "name": "Дом"},
        {"type": "todo_folder_order", "order": ["b", None, "a"]},
    )
    assert [item["name"] for item in data["todo_folders"]] == ["Дом", "Работа"]
    assert data["all_todos_position"] == 1
    # A list before «All tasks» is deleted — it moves into its place.
    data = _sync(client, user, {"type": "todo_folder_delete", "key": "b"})
    assert data["all_todos_position"] == 0


def test_todo_list_color(client: TestClient, user: AuthUser) -> None:
    data = _sync(
        client,
        user,
        {"type": "todo_folder_create", "ref": "a", "name": "Работа", "color": "green"},
        {"type": "todo_folder_create", "ref": "b", "name": "Дом"},
        {"type": "todo_folder_update", "key": "b", "name": "Дом", "color": "#AABBCC"},
        {"type": "todo_folder_update", "key": "a", "name": "Работа и деньги"},
        {"type": "todo_folder_create", "ref": "c", "name": "Ой", "color": "плохой"},
    )
    assert [(item["name"], item["color"]) for item in data["todo_folders"]] == [
        ("Работа и деньги", "green"),
        ("Дом", "#aabbcc"),
    ]
    assert data["results"][4]["error"]["code"] == "invalid_color"
