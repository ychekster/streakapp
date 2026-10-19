"""Совместные привычки (backend/groups.py): приглашение, вступление через бота, день группы,
общие поля, выход, возврат, исключение, заморозка и уведомления об отметках."""

from __future__ import annotations

import asyncio
import os
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AuthUser, new_user
from tests.fake_telegram import FakeTelegram
from backend import groups
from backend.constants import MAX_GROUP_MEMBERS
from backend.database import Database
from backend.errors import ApiError
from backend.models import FrequencyType
from backend.repository import Repository, utc_now

BOT = "knot_test_bot"


@pytest.fixture(autouse=True)
def bot(client: TestClient):
    """Имя бота для ссылок и бот-заглушка (первая отметка шлёт предложение установить)."""
    original = client.app.state.bot
    client.app.state.bot_username = BOT
    client.app.state.bot = FakeTelegram()
    yield
    client.app.state.bot = original


def _sync(client: TestClient, user: AuthUser, *ops: dict[str, object]) -> dict:
    response = client.post("/sync", json={"ops": list(ops)}, headers=user.headers)
    assert response.status_code == 200, response.text
    return response.json()


def _habit(client: TestClient, user: AuthUser, name: str = "Бег", **fields: object) -> int:
    data = _sync(
        client,
        user,
        {"type": "create", "ref": f"r-{name}", "habit": {"name": name, "frequency_type": "daily", **fields}},
    )
    return data["results"][0]["id"]


def _only(client: TestClient, user: AuthUser, name: str = "Бег") -> dict:
    return next(habit for habit in _sync(client, user)["habits"] if habit["name"] == name)


def _invite(client: TestClient, user: AuthUser, task_id: int) -> tuple[int, str]:
    response = client.post("/groups/invite", json={"task": task_id}, headers=user.headers)
    assert response.status_code == 200, response.text
    data = response.json()
    prefix = f"https://t.me/{BOT}?start=join_"
    assert data["invite_url"].startswith(prefix)
    return data["group_id"], data["invite_url"][len(prefix):]


async def _with_repo(action):  # type: ignore[no-untyped-def]
    database = Database(os.environ["DATABASE_URL"])
    try:
        async with database.session_factory() as session:
            repo = Repository(session)
            result = await action(repo)
            await session.commit()
            return result
    finally:
        await database.dispose()


def _join(user: AuthUser, code: str, name: str = "Петя", username: str | None = None) -> str:
    """Принять приглашение в боте (как bot/handlers/group_invite.py)."""

    async def action(repo: Repository) -> str:
        db_user = await repo.get_or_create_user(user.id, username, name, language="ru")
        outcome, _ = await groups.join(repo, db_user, code)
        return outcome

    return asyncio.run(_with_repo(action))


def _mark(client: TestClient, user: AuthUser, task_id: int, day: date, done: bool = True) -> None:
    _sync(client, user, {"type": "mark", "task": task_id, "date": day.isoformat(), "done": done})


def _today(client: TestClient, user: AuthUser) -> date:
    return date.fromisoformat(_sync(client, user)["today"])


def test_invite_join_and_the_shared_day(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user, color="green", times_per_day=1)
    group_id, code = _invite(client, user, owner_task)
    # Пока в ней один владелец, это обычная привычка с готовой ссылкой.
    alone = _only(client, user)
    assert alone["group"]["id"] == group_id and len(alone["group"]["members"]) == 1
    # Ссылка постоянная.
    assert _invite(client, user, owner_task) == (group_id, code)

    friend = new_user()
    assert _join(friend, code, username="petya") == "joined"
    assert _join(friend, code) == "member"
    mine = _only(client, friend)
    assert (mine["frequency_type"], mine["color"], mine["auto_mark"]) == ("daily", "green", False)
    # Имена — из Telegram (initData тестов: @user<id>).
    names = [member["name"] for member in mine["group"]["members"]]
    assert names == [f"@user{user.id}", f"@user{friend.id}"]
    assert mine["group"]["is_owner"] is False and _only(client, user)["group"]["is_owner"]

    today = _today(client, user)
    _mark(client, user, owner_task, today)
    owner = _only(client, user)
    # Моя часть сделана, день группы — ещё нет.
    assert owner["done_today"] is True and owner["history"][-1] is False
    assert owner["current_streak"] == 0 and owner["total_done"] == 0
    seen = _only(client, friend)
    assert [member["done"] for member in seen["group"]["members"]] == [True, False]
    assert seen["group"]["others_history"][-1] is True

    _mark(client, friend, mine["id"], today)
    for person in (user, friend):
        habit = _only(client, person)
        assert habit["history"][-1] is True
        assert (habit["current_streak"], habit["total_done"]) == (1, 1)


def test_shared_fields_belong_to_the_owner(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user, "Чтение")
    _, code = _invite(client, user, owner_task)
    friend = new_user()
    _join(friend, code)
    friend_task = _only(client, friend, "Чтение")["id"]

    # Участник: название и расписание не меняются, цвет — его.
    _sync(
        client,
        friend,
        {
            "type": "update",
            "task": friend_task,
            "habit": {"name": "Другое", "frequency_type": "specific_days", "days": ["mon"],
                      "color": "red", "times_per_day": 3, "auto_mark": True},
        },
    )
    mine = _only(client, friend, "Чтение")
    assert (mine["frequency_type"], mine["times_per_day"], mine["color"]) == ("daily", 1, "red")
    assert mine["auto_mark"] is False

    # Владелец: меняется у всех.
    _sync(
        client,
        user,
        {
            "type": "update",
            "task": owner_task,
            "habit": {"name": "Книги", "frequency_type": "daily", "times_per_day": 2,
                      "color": "blue", "auto_mark": False},
        },
    )
    mine = _only(client, friend, "Книги")
    assert (mine["times_per_day"], mine["color"]) == (2, "red")


def test_name_taken_by_the_member_gets_a_number(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user, "Йога")
    _, code = _invite(client, user, owner_task)
    friend = new_user()
    _habit(client, friend, "Йога")
    _join(friend, code)
    assert {habit["name"] for habit in _sync(client, friend)["habits"]} == {"Йога", "Йога (2)"}


def test_leave_recounts_and_return_restores(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    group_id, code = _invite(client, user, owner_task)
    friend = new_user()
    _join(friend, code)
    friend_task = _only(client, friend)["id"]
    today = _today(client, user)
    _mark(client, user, owner_task, today)
    assert _only(client, user)["history"][-1] is False

    # Друг вышел: у владельца день засчитан, у друга привычка обычная.
    assert client.post(f"/groups/{group_id}/leave", headers=friend.headers).status_code == 204
    assert _only(client, user)["history"][-1] is True
    left = _only(client, friend)
    assert left["group"] is None and left["id"] == friend_task

    # Вернулся со своей привычкой: прошлое снова с ним.
    assert _join(friend, code) == "rejoined"
    assert _only(client, friend)["id"] == friend_task
    assert _only(client, user)["history"][-1] is False

    # Удалил привычку — возвращается с нуля, с новой привычкой.
    client.post(f"/groups/{group_id}/leave", headers=friend.headers)
    _sync(client, friend, {"type": "delete", "task": friend_task})
    assert _join(friend, code) == "joined"
    again = _only(client, friend)
    assert again["id"] != friend_task and len(again["group"]["members"]) == 2


def test_delete_leaves_the_group(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    _, code = _invite(client, user, owner_task)
    friend = new_user()
    _join(friend, code)
    _sync(client, friend, {"type": "delete", "task": _only(client, friend)["id"]})
    assert len(_only(client, user)["group"]["members"]) == 1


def test_kick_and_owner_leaving(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    group_id, code = _invite(client, user, owner_task)
    first, second = new_user(), new_user()
    _join(first, code)
    _join(second, code)

    # Исключает только владелец.
    response = client.post(
        f"/groups/{group_id}/kick", json={"user_id": second.id}, headers=first.headers
    )
    assert response.json()["error"]["code"] == "group_not_owner"
    response = client.post(
        f"/groups/{group_id}/reset", headers=first.headers
    )
    assert response.json()["error"]["code"] == "group_not_owner"
    assert (
        client.post(
            f"/groups/{group_id}/kick", json={"user_id": second.id}, headers=user.headers
        ).status_code
        == 204
    )
    assert _only(client, second)["group"] is None

    # Владелец вышел — владелец тот, кто вступил раньше всех.
    client.post(f"/groups/{group_id}/leave", headers=user.headers)
    assert _only(client, first)["group"]["is_owner"] is True
    # Новый владелец сбрасывает ссылку: прежняя не действует.
    response = client.post(f"/groups/{group_id}/reset", headers=first.headers)
    assert response.status_code == 200
    with pytest.raises(ApiError) as refused:
        _join(new_user(), code)
    assert refused.value.code == "group_not_found"


def test_frozen_member_is_not_waited_for(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    _, code = _invite(client, user, owner_task)
    friend = new_user()
    _join(friend, code)
    today = _today(client, user)
    _sync(
        client,
        friend,
        {"type": "freeze", "task": _only(client, friend)["id"], "date": today.isoformat(), "frozen": True},
    )
    _mark(client, user, owner_task, today)
    habit = _only(client, user)
    assert habit["history"][-1] is True
    assert [member["frozen"] for member in habit["group"]["members"]] == [False, True]


def test_group_is_limited(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    _, code = _invite(client, user, owner_task)
    for _ in range(MAX_GROUP_MEMBERS - 1):
        _join(new_user(), code)
    with pytest.raises(ApiError) as refused:
        _join(new_user(), code)
    assert refused.value.code == "group_full"


def test_guest_cannot_share() -> None:
    async def action(repo: Repository) -> None:
        guest = await repo.create_web_user("ru", utc_now())
        task = await repo.create_task(guest.telegram_id, "Бег", FrequencyType.daily)
        await groups.create_invite(repo, guest, task)

    with pytest.raises(ApiError) as refused:
        asyncio.run(_with_repo(action))
    assert refused.value.code == "group_needs_telegram"


def test_marks_are_told_once_to_those_who_asked(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user, "Вода")
    group_id, code = _invite(client, user, owner_task)
    friend, quiet = new_user(), new_user()
    _join(friend, code, username="petya")
    _join(quiet, code)
    assert (
        client.post(f"/groups/{group_id}/notify", json={"on": True}, headers=user.headers).status_code
        == 204
    )
    today = _today(client, user)
    _mark(client, user, owner_task, today)
    friend_task = _only(client, friend, "Вода")["id"]
    _mark(client, friend, friend_task, today)

    async def due(repo: Repository):  # type: ignore[no-untyped-def]
        notices, logs = await groups.due_group_marks(repo, utc_now())
        await repo.mark_group_notified(logs, utc_now())
        return [n for n in notices if n.user_id in (user.id, friend.id, quiet.id)]

    # Владелец отметил раньше, чем кто-то включил уведомления, — о нём никому.
    notices = asyncio.run(_with_repo(due))
    assert [(n.user_id, n.actor, n.habit_name) for n in notices] == [
        (user.id, f"@user{friend.id}", "Вода")
    ]
    # Снял и снова поставил — повтора нет.
    _mark(client, friend, friend_task, today, False)
    _mark(client, friend, friend_task, today)
    assert asyncio.run(_with_repo(due)) == []


def test_member_days_before_joining_are_the_owners(client: TestClient, user: AuthUser) -> None:
    owner_task = _habit(client, user)
    today = _today(client, user)
    _mark(client, user, owner_task, today - timedelta(days=1))
    _, code = _invite(client, user, owner_task)
    friend = new_user()
    _join(friend, code)
    owner = _only(client, user)
    # Вчера он был один: день его.
    assert owner["history"][-2] is True and owner["current_streak"] == 1
    friend_habit = _only(client, friend)
    assert friend_habit["total_done"] == 0 and friend_habit["history"][-2] is False
