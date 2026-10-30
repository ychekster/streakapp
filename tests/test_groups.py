"""Совместные привычки (backend/groups.py): создание, приглашение, вступление через бота,
день группы, общие поля, выход (прошлое не меняется), возврат, исключение, заморозка и
уведомления об отметках."""

from __future__ import annotations

import asyncio
import os
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AuthUser, new_user
from tests.fake_telegram import FakeTelegram
from backend import groups, photos
from backend.constants import MAX_GROUP_MEMBERS
from backend.database import Database
from backend.errors import ApiError
from sqlalchemy import select

from backend.models import FrequencyType, HabitGroupPeriod
from backend.repository import Repository, utc_now
from bot.profiles import refresh_photos

BOT = "knot_test_bot"


@pytest.fixture(autouse=True)
def bot(client: TestClient):
    """Имя бота для ссылок и бот-заглушка."""
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


def _ids(client: TestClient, user: AuthUser) -> set[int]:
    return {habit["id"] for habit in _sync(client, user)["habits"]}


def _link(client: TestClient, user: AuthUser, group_id: int) -> str:
    response = client.get(f"/groups/{group_id}/invite", headers=user.headers)
    assert response.status_code == 200, response.text
    data = response.json()
    prefix = f"https://t.me/{BOT}?start=join_"
    assert data["group_id"] == group_id and data["invite_url"].startswith(prefix)
    return data["invite_url"][len(prefix):]


def _shared(
    client: TestClient, user: AuthUser, name: str = "Бег", **fields: object
) -> tuple[int, int, str]:
    """Создать совместную привычку: id привычки, id группы и код ссылки."""
    task_id = _habit(client, user, name, shared=True, **fields)
    group_id = _only(client, user, name)["group"]["id"]
    return task_id, group_id, _link(client, user, group_id)


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


def _joined_days_ago(user: AuthUser, group_id: int, days: int) -> None:
    """Сдвинуть начало участия назад: будто вступил `days` дней назад."""

    async def action(repo: Repository) -> None:
        member = await repo.get_member(group_id, user.id)
        period = await repo.session.scalar(
            select(HabitGroupPeriod).where(
                HabitGroupPeriod.member_id == member.id, HabitGroupPeriod.end_on.is_(None)
            )
        )
        period.start_on -= timedelta(days=days)

    asyncio.run(_with_repo(action))


def _mark(client: TestClient, user: AuthUser, task_id: int, day: date, done: bool = True) -> None:
    _sync(client, user, {"type": "mark", "task": task_id, "date": day.isoformat(), "done": done})


def _today(client: TestClient, user: AuthUser) -> date:
    return date.fromisoformat(_sync(client, user)["today"])


def _update(client: TestClient, user: AuthUser, task_id: int, **fields: object) -> dict:
    """Изменить привычку «Бег» (ежедневную) с полями формы `fields`: результат операции."""
    habit = {"name": "Бег", "frequency_type": "daily", **fields}
    return _sync(client, user, {"type": "update", "task": task_id, "habit": habit})["results"][0]


def test_plain_habit_becomes_shared_and_back(client: TestClient, user: AuthUser) -> None:
    task_id = _habit(client, user, auto_mark=True)
    today = _today(client, user)
    _mark(client, user, task_id, today - timedelta(days=1))
    assert _only(client, user)["group"] is None

    # Включил «Групповую привычку»: та же привычка с отметками, автоотметки больше нет.
    assert _update(client, user, task_id, shared=True, auto_mark=True)["ok"]
    habit = _only(client, user)
    assert habit["id"] == task_id and habit["auto_mark"] is False
    assert habit["total_done"] == 1 and len(habit["group"]["members"]) == 1
    group_id = habit["group"]["id"]
    code = _link(client, user, group_id)
    # Без «shared» (старые клиенты) — как была.
    _update(client, user, task_id)
    assert _only(client, user)["group"]["id"] == group_id

    # Есть другие — выключить нельзя, только выйти.
    friend = new_user()
    _join(friend, code)
    result = _update(client, user, task_id, shared=False)
    assert result["error"]["code"] == "group_has_members"
    assert _only(client, user)["group"]["id"] == group_id

    # Снова один — выключил: привычка обычная с отметками, ссылки больше нет.
    client.post(f"/groups/{group_id}/leave", headers=friend.headers)
    assert _update(client, user, task_id, shared=False)["ok"]
    habit = _only(client, user)
    assert habit["group"] is None and habit["total_done"] == 1
    with pytest.raises(ApiError) as refused:
        _join(new_user(), code)
    assert refused.value.code == "group_not_found"


def test_invite_join_and_the_shared_day(client: TestClient, user: AuthUser) -> None:
    owner_task, group_id, code = _shared(client, user, color="green", auto_mark=True)
    # Совместная с самого начала, даже пока в ней один владелец; автоотметки нет.
    alone = _only(client, user)
    assert alone["group"]["id"] == group_id and len(alone["group"]["members"]) == 1
    assert alone["auto_mark"] is False
    # Ссылка постоянная.
    assert _link(client, user, group_id) == code

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


def test_mark_yesterday_answer_carries_my_part_of_today(client: TestClient, user: AuthUser) -> None:
    # Моя часть за календарный сегодня — в next_day_count (день группы ещё не выполнен):
    # выключили «Отмечать за вчера» — приложение сразу видит мою отметку.
    task_id, _, code = _shared(client, user)
    _join(new_user(), code)
    today = _today(client, user)
    _mark(client, user, task_id, today)
    data = _sync(client, user, {"type": "settings", "patch": {"mark_yesterday": True}})
    habit = next(item for item in data["habits"] if item["id"] == task_id)
    assert (habit["next_day_done"], habit["next_day_count"]) == (False, 1)


def test_shared_fields_belong_to_the_owner(client: TestClient, user: AuthUser) -> None:
    owner_task, _, code = _shared(client, user, "Чтение")
    friend = new_user()
    _join(friend, code)
    friend_task = _only(client, friend, "Чтение")["id"]

    # Участник: всё, кроме напоминаний, — как было; напоминания — его.
    _sync(
        client,
        friend,
        {
            "type": "update",
            "task": friend_task,
            "habit": {"name": "Другое", "description": "моё", "frequency_type": "specific_days",
                      "days": ["mon"], "color": "red", "times_per_day": 3, "auto_mark": True,
                      "reminder_time": "08:00", "reminder_times": ["08:00"]},
        },
    )
    mine = _only(client, friend, "Чтение")
    assert (mine["frequency_type"], mine["times_per_day"], mine["color"]) == ("daily", 1, "blue")
    assert mine["description"] is None and mine["auto_mark"] is False
    assert mine["reminder_time"] == "08:00"

    # Владелец: меняется у всех, напоминания участника остаются.
    _sync(
        client,
        user,
        {
            "type": "update",
            "task": owner_task,
            "habit": {"name": "Книги", "description": "по 20 страниц", "frequency_type": "daily",
                      "times_per_day": 2, "color": "green", "auto_mark": False, "overtime": True},
        },
    )
    mine = _only(client, friend, "Книги")
    assert (mine["times_per_day"], mine["color"], mine["overtime"]) == (2, "green", True)
    assert mine["description"] == "по 20 страниц" and mine["reminder_time"] == "08:00"


def test_name_taken_by_the_member_stays_as_is(client: TestClient, user: AuthUser) -> None:
    _, _, code = _shared(client, user, "Йога")
    friend = new_user()
    _habit(client, friend, "Йога")
    _join(friend, code)
    assert [habit["name"] for habit in _sync(client, friend)["habits"]] == ["Йога", "Йога"]


def test_leaving_keeps_the_past_and_return_is_a_new_habit(
    client: TestClient, user: AuthUser
) -> None:
    owner_task, group_id, code = _shared(client, user)
    friend, other = new_user(), new_user()
    _join(friend, code)
    _join(other, code)
    for person in (user, friend, other):
        _joined_days_ago(person, group_id, 2)
    friend_task, other_task = _only(client, friend)["id"], _only(client, other)["id"]
    today = _today(client, user)
    before, yesterday = today - timedelta(days=2), today - timedelta(days=1)
    for person, task_id in ((user, owner_task), (other, other_task)):
        _mark(client, person, task_id, before)
        _mark(client, person, task_id, yesterday)
    _mark(client, friend, friend_task, before)
    assert _only(client, user)["history"][-3:-1] == [True, False]

    # Друг вышел: привычка осталась у него обычной, прошлое группы — как было.
    assert client.post(f"/groups/{group_id}/leave", headers=friend.headers).status_code == 204
    alone = _only(client, friend)
    assert alone["id"] == friend_task and alone["group"] is None
    assert alone["history"][-3:-1] == [True, False]
    assert _only(client, user)["history"][-3:-1] == [True, False]
    assert len(_only(client, user)["group"]["members"]) == 2
    # Его правки в своей привычке группу больше не трогают.
    _mark(client, friend, friend_task, yesterday)
    assert _only(client, user)["history"][-3:-1] == [True, False]
    # Сегодня его нет — его и не ждут.
    _mark(client, user, owner_task, today)
    _mark(client, other, other_task, today)
    assert _only(client, user)["history"][-1] is True

    # Вернулся — как новичок: новая привычка без истории, прежняя осталась обычной.
    assert _join(friend, code) == "joined"
    habits = _sync(client, friend)["habits"]
    assert [habit["name"] for habit in habits] == ["Бег", "Бег"]
    back = next(habit for habit in habits if habit["group"] is not None)
    assert back["id"] != friend_task and back["group"]["id"] == group_id
    assert back["total_done"] == 0 and back["history"][-3:-1] == [False, False]
    # Сегодня его снова ждут; прошлое — без перемен.
    assert _only(client, user)["history"][-3:] == [True, False, False]
    _mark(client, friend, back["id"], today)
    assert _only(client, user)["history"][-1] is True

    # Удаление (с другого устройства) — тот же выход; вернуться можно с новой привычкой.
    _sync(client, friend, {"type": "delete", "task": back["id"]})
    assert back["id"] not in _ids(client, friend)
    assert _only(client, user)["history"][-3:] == [True, False, True]
    assert _join(friend, code) == "joined"
    assert len(_sync(client, friend)["habits"]) == 2


def test_kicking_does_not_rewrite_the_past(client: TestClient, user: AuthUser) -> None:
    owner_task, group_id, code = _shared(client, user)
    lazy = new_user()
    _join(lazy, code)
    for person in (user, lazy):
        _joined_days_ago(person, group_id, 1)
    yesterday = _today(client, user) - timedelta(days=1)
    _mark(client, user, owner_task, yesterday)
    assert _only(client, user)["history"][-2] is False
    client.post(f"/groups/{group_id}/kick", json={"user_id": lazy.id}, headers=user.headers)
    owner = _only(client, user)
    assert owner["history"][-2] is False and owner["best_streak"] == 0


def test_alone_it_stays_shared_and_last_out_ends_it(client: TestClient, user: AuthUser) -> None:
    owner_task, group_id, code = _shared(client, user)
    friend = new_user()
    _join(friend, code)
    client.post(f"/groups/{group_id}/leave", headers=friend.headers)
    # Остался один — привычка всё равно совместная.
    alone = _only(client, user)
    assert alone["group"]["id"] == group_id and len(alone["group"]["members"]) == 1

    # Вышел последний — группы больше нет, ссылка не действует; привычка осталась обычной.
    client.post(f"/groups/{group_id}/leave", headers=user.headers)
    assert _only(client, user)["id"] == owner_task and _only(client, user)["group"] is None
    with pytest.raises(ApiError) as refused:
        _join(friend, code)
    assert refused.value.code == "group_not_found"


def test_kick_and_owner_leaving(client: TestClient, user: AuthUser) -> None:
    _, group_id, code = _shared(client, user)
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
    # Исключённый не теряет привычку: она у него обычная, со всеми отметками.
    kept = _sync(client, second)["habits"]
    assert len(kept) == 1 and kept[0]["group"] is None

    # Чёрный список: по ссылке не вступить; его видит только владелец.
    with pytest.raises(ApiError) as refused:
        _join(second, code)
    assert refused.value.code == "group_banned"

    async def preview(repo: Repository) -> str:
        db_user = await repo.get_user(second.id)
        found = await groups.preview_invite(repo, db_user, code)
        return found.state

    assert asyncio.run(_with_repo(preview)) == "banned"
    banned = _only(client, user)["group"]["banned"]
    assert [item["user_id"] for item in banned] == [second.id]
    assert banned[0]["name"] == f"@user{second.id}"
    assert _only(client, first)["group"]["banned"] == []
    response = client.post(
        f"/groups/{group_id}/unban", json={"user_id": second.id}, headers=first.headers
    )
    assert response.json()["error"]["code"] == "group_not_owner"

    # Убрали из чёрного списка — вернулся по ссылке с новой привычкой, прежняя — у него.
    unban = client.post(f"/groups/{group_id}/unban", json={"user_id": second.id}, headers=user.headers)
    assert unban.status_code == 204
    assert _only(client, user)["group"]["banned"] == []
    response = client.post(
        f"/groups/{group_id}/unban", json={"user_id": second.id}, headers=user.headers
    )
    assert response.json()["error"]["code"] == "group_member_not_found"
    assert _join(second, code) == "joined"
    habits = _sync(client, second)["habits"]
    assert len(habits) == 2
    assert [habit["id"] for habit in habits if habit["group"] is None] == [kept[0]["id"]]

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
    owner_task, _, code = _shared(client, user)
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
    _, _, code = _shared(client, user)
    for _ in range(MAX_GROUP_MEMBERS - 1):
        _join(new_user(), code)
    with pytest.raises(ApiError) as refused:
        _join(new_user(), code)
    assert refused.value.code == "group_full"


def test_guest_cannot_share() -> None:
    async def action(repo: Repository) -> None:
        guest = await repo.create_web_user("ru", utc_now())
        task = await repo.create_task(guest.telegram_id, "Бег", FrequencyType.daily)
        await groups.create_group(repo, guest, task)

    with pytest.raises(ApiError) as refused:
        asyncio.run(_with_repo(action))
    assert refused.value.code == "group_needs_telegram"


def test_marks_are_told_once_to_those_who_asked(client: TestClient, user: AuthUser) -> None:
    owner_task, group_id, code = _shared(client, user, "Вода")
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
    # Исправил давний день в календаре — это не новость для остальных.
    _mark(client, friend, friend_task, today - timedelta(days=5))
    assert asyncio.run(_with_repo(due)) == []


def test_member_days_before_joining_are_the_owners(client: TestClient, user: AuthUser) -> None:
    owner_task, _, code = _shared(client, user)
    today = _today(client, user)
    _mark(client, user, owner_task, today - timedelta(days=1))
    friend = new_user()
    _join(friend, code)
    owner = _only(client, user)
    # Вчера он был один: день его.
    assert owner["history"][-2] is True and owner["current_streak"] == 1
    friend_habit = _only(client, friend)
    assert friend_habit["total_done"] == 0 and friend_habit["history"][-2] is False


def test_day_is_shaded_by_everyone(client: TestClient, user: AuthUser) -> None:
    owner_task, _, code = _shared(client, user, "Отжимания", times_per_day=3)
    first, second = new_user(), new_user()
    _join(first, code)
    _join(second, code)
    today = _today(client, user)

    def count(person: AuthUser, task_id: int, value: int) -> None:
        _sync(client, person, {"type": "mark", "task": task_id, "date": today.isoformat(),
                               "done": False, "count": value})

    count(user, owner_task, 3)
    count(first, _only(client, first, "Отжимания")["id"], 1)
    habit = _only(client, user, "Отжимания")
    group = habit["group"]
    # 3 + 1 из 3 человек × 3 раза.
    assert (group["others_units"][-1], group["people"][-1]) == (1, 3)
    assert group["fill_history"][-1] == pytest.approx(4 / 9, abs=1e-3)
    # Моя часть — в history_counts, день группы не выполнен.
    assert habit["history_counts"][-1] == 3 and habit["history"][-1] is False


def test_member_photos_come_from_telegram(client: TestClient, user: AuthUser) -> None:
    photos.clear_cache()
    fake: FakeTelegram = client.app.state.bot
    _, group_id, code = _shared(client, user)
    friend, stranger = new_user(), new_user()
    _join(friend, code)
    fake.profile_photos[friend.id] = b"jpeg-bytes"

    async def database() -> Database:
        return Database(os.environ["DATABASE_URL"])

    def refresh() -> int:
        async def run() -> int:
            db = await database()
            try:
                return await refresh_photos(fake, db, [user.id, friend.id])  # type: ignore[arg-type]
            finally:
                await db.dispose()

        return asyncio.run(run())

    def photo_of(person: AuthUser, member: AuthUser) -> str | None:
        members = _only(client, person)["group"]["members"]
        return next(item["photo"] for item in members if item["user_id"] == member.id)

    # Пока не сверяли — фото нет (буква); после сверки — версия.
    assert photo_of(user, friend) is None
    assert refresh() == 1
    version = photo_of(user, friend)
    assert version and photo_of(friend, user) is None

    url = f"/groups/{group_id}/members/{friend.id}/photo"
    response = client.get(url, params={"v": version}, headers=user.headers)
    assert response.status_code == 200
    assert response.content == b"jpeg-bytes" and response.headers["content-type"] == "image/jpeg"
    assert "immutable" in response.headers["cache-control"]
    # Нет фото — 404 (приложение рисует букву).
    assert client.get(f"/groups/{group_id}/members/{user.id}/photo",
                      headers=friend.headers).status_code == 404
    # Чужим — нет.
    assert client.get(url, headers=stranger.headers).status_code == 404
    assert client.get(f"/groups/{group_id}/members/{stranger.id}/photo",
                      headers=user.headers).status_code == 404

    # Сменил фото — новая версия после следующей сверки; прежняя ссылка — ненадолго.
    fake.profile_photos[friend.id] = b"new-jpeg"
    assert refresh() == 1
    assert photo_of(user, friend) not in (None, version)
    stale = client.get(url, params={"v": version}, headers=user.headers)
    assert stale.content == b"new-jpeg" and "immutable" not in stale.headers["cache-control"]


def test_member_page_shows_their_own_marks(client: TestClient, user: AuthUser) -> None:
    owner_task, group_id, code = _shared(client, user, reminder_times=["08:00"])
    friend, stranger = new_user(), new_user()
    _join(friend, code)
    today = _today(client, user)
    _mark(client, user, owner_task, today - timedelta(days=1))
    _mark(client, user, owner_task, today)

    def page(viewer: AuthUser, member: AuthUser):  # type: ignore[no-untyped-def]
        return client.get(f"/groups/{group_id}/members/{member.id}", headers=viewer.headers)

    # Мои отметки — моя серия, хотя день группы без друга не выполнен.
    response = page(friend, user)
    assert response.status_code == 200, response.text
    data = response.json()
    habit = data["habit"]
    assert data["day"] == today.isoformat()
    assert habit["history"][-2:] == [True, True] and habit["done_today"] is True
    assert (habit["current_streak"], habit["total_done"]) == (2, 2)
    # Как обычная привычка, без чужих напоминаний.
    assert habit["group"] is None and habit["reminder_times"] == []
    # У группы сегодня не выполнен (вчера — до вступления друга, по моим отметкам).
    assert _only(client, user)["total_done"] == 1

    # Себя тоже можно открыть; у друга пока ничего.
    assert page(user, user).json()["habit"]["total_done"] == 2
    assert page(user, friend).json()["habit"]["total_done"] == 0
    # Чужим и про чужих — нет.
    assert page(stranger, user).json()["error"]["code"] == "group_not_found"
    assert page(user, stranger).json()["error"]["code"] == "group_member_not_found"
    # Исключённого больше не открыть.
    client.post(f"/groups/{group_id}/kick", json={"user_id": friend.id}, headers=user.headers)
    assert page(user, friend).status_code == 404


def test_shared_flexible_counts_each_members_goal(client: TestClient, user: AuthUser) -> None:
    _, group_id, code = _shared(client, user, "Текст", frequency_type="flexible", period="year", period_times=1)
    friend = new_user()
    assert _join(friend, code) == "joined"
    _joined_days_ago(user, group_id, 400)
    _joined_days_ago(friend, group_id, 400)
    today = date.fromisoformat(_sync(client, user)["today"])
    mine = _only(client, user, "Текст")
    _mark(client, user, mine["id"], today)
    habit = _only(client, user, "Текст")
    # Я набрал цель, друг — нет: период группы ещё не засчитан.
    assert habit["period_done"] == 1 and habit["group"]["others_reached"] is False
    assert habit["current_streak"] == 0 and habit["history"][-1] is True
    progress = {member["is_me"]: member["period_done"] for member in habit["group"]["members"]}
    assert progress == {True: 1, False: 0}
    # Друг выполнил в другой день — у каждого своя цель: засчитано.
    theirs = _only(client, friend, "Текст")
    _mark(client, friend, theirs["id"], date.fromisoformat(_sync(client, friend)["today"]))
    habit = _only(client, user, "Текст")
    assert habit["group"]["others_reached"] is True and habit["current_streak"] == 1
