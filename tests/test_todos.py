"""Задачи (бета; настройки → «Задачи»): разовые дела и их папки едут через POST /sync,
как папки привычек; с привычками не связаны."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.conftest import AuthUser
from backend.constants import MAX_TODO_FOLDERS_PER_USER


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
    assert first["todo_folders"] == [{"id": folder_id, "name": "Учёба"}]
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
