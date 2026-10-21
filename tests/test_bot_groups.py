"""Бот и совместные привычки: приглашение по ссылке (bot/handlers/group_invite.py),
«Отметки участников» (bot/reminders.py) и свежие имена (bot/profiles.py)."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from tests.fake_telegram import FakeTelegram
from backend import groups
from backend.database import Database
from backend.models import FrequencyType, Task
from backend.repository import Repository
from backend.services import user_today
from bot import reminders as bot_reminders
from bot.handlers import group_invite
from bot.pacing import Pacer
from bot.profiles import ProfileMiddleware


class _Message:
    def __init__(self, user: SimpleNamespace) -> None:
        self.from_user = user
        self.answers: list[dict[str, Any]] = []
        self.edits: list[str] = []

    async def answer(self, text: str | None = None, **kwargs: Any) -> None:
        self.answers.append({"text": text, **kwargs})

    async def edit_text(self, text: str, **kwargs: Any) -> None:
        self.edits.append(text)


class _Callback:
    def __init__(self, user: SimpleNamespace, data: str) -> None:
        self.from_user = user
        self.data = data
        self.message = _Message(user)
        self.bot: Any = None

    async def answer(self, *args: Any, **kwargs: Any) -> None:
        return None


def _tg(user_id: int, username: str | None = None, first_name: str = "Петя") -> SimpleNamespace:
    return SimpleNamespace(
        id=user_id, username=username, first_name=first_name, language_code="ru", is_bot=False
    )


async def _owner_with_invite(database: Database, **fields: Any) -> tuple[str, Task]:
    async with database.session_factory() as session:
        repo = Repository(session)
        owner = await repo.get_or_create_user(1, "anya", "Аня", language="ru")
        task = await repo.create_task(1, "Бег", fields.pop("frequency", FrequencyType.daily), **fields)
        group = await groups.create_group(repo, owner, task)
        await session.commit()
        return group.invite_code, task


def test_invite_is_shown_and_accepted(db_url: str) -> None:
    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            code, _ = await _owner_with_invite(
                database, frequency=FrequencyType.specific_days, days="mon,wed,fri",
                times_per_day=2,
            )
            message = _Message(_tg(2, "petya"))
            await group_invite.start_invite(
                message, SimpleNamespace(args=f"join_{code}"), database  # type: ignore[arg-type]
            )
            [shown] = message.answers
            assert shown["text"] == (
                "Вас приглашают в групповую привычку\n\n"
                "Название: Бег\n"
                "Повтор: Пн, Ср и Пт\n"
                "Цель: 2 раза в день\n"
                "Участников: 1 из 12\n"
                "Состоят: @anya\n\n"
                "Нажмите «Принять», чтобы присоединиться."
            )
            assert [entity.type for entity in shown["entities"]] == ["bold"] * 5
            buttons = [row[0] for row in shown["reply_markup"].inline_keyboard]
            assert [button.text for button in buttons] == ["Принять", "Отклонить"]

            callback = _Callback(_tg(2, "petya"), buttons[0].callback_data)
            await group_invite.accept_invite(callback, database)  # type: ignore[arg-type]
            assert callback.message.edits == ["Готово! «Бег» уже в ваших привычках."]

            # Уже участник.
            again = _Message(_tg(2, "petya"))
            await group_invite.start_invite(
                again, SimpleNamespace(args=f"join_{code}"), database  # type: ignore[arg-type]
            )
            assert again.answers[0]["text"] == "Вы уже в этой привычке."

            # Ссылку сбросили — старое сообщение больше не работает.
            async with database.session_factory() as session:
                repo = Repository(session)
                group = await repo.get_group_by_code(code)
                await groups.reset_invite(repo, await repo.get_user(1), group.id)
                await session.commit()
            late = _Callback(_tg(3), f"join:ok:{code}")
            async with database.session_factory() as session:
                await Repository(session).get_or_create_user(3, None, "Вася", language="ru")
                await session.commit()
            await group_invite.accept_invite(late, database)  # type: ignore[arg-type]
            assert late.message.edits == ["Приглашение больше не действует."]

            declined = _Callback(_tg(3), "join:no")
            await group_invite.decline_invite(declined, database)  # type: ignore[arg-type]
            assert declined.message.edits == ["Приглашение отклонено."]
        finally:
            await database.dispose()

    asyncio.run(run())


def test_left_member_joins_like_anyone(db_url: str) -> None:
    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            code, _ = await _owner_with_invite(database)
            async with database.session_factory() as session:
                repo = Repository(session)
                friend = await repo.get_or_create_user(2, None, "Петя", language="ru")
                await groups.join(repo, friend, code)
                group = await repo.get_group_by_code(code)
                await groups.leave(repo, friend, group.id)
                await session.commit()
            message = _Message(_tg(2))
            await group_invite.start_invite(
                message, SimpleNamespace(args=f"join_{code}"), database  # type: ignore[arg-type]
            )
            buttons = [row[0].text for row in message.answers[0]["reply_markup"].inline_keyboard]
            assert buttons == ["Принять", "Отклонить"]
            assert "@anya, " not in message.answers[0]["text"]
            assert message.answers[0]["text"].endswith("Нажмите «Принять», чтобы присоединиться.")
        finally:
            await database.dispose()

    asyncio.run(run())


def test_marks_are_sent_once(db_url: str) -> None:
    async def run() -> list[Any]:
        database = Database(db_url)
        await database.create_tables()
        telegram = FakeTelegram()
        try:
            code, owner_task = await _owner_with_invite(database)
            async with database.session_factory() as session:
                repo = Repository(session)
                friend = await repo.get_or_create_user(2, None, "Петя", language="en")
                _, friend_task = await groups.join(repo, friend, code)
                group = await repo.get_group_by_code(code)
                await groups.set_notify(repo, await repo.get_user(1), group.id, True)
                await groups.set_notify(repo, friend, group.id, True)
                await repo.add_done_log(friend_task, user_today(friend))
                await session.commit()
            keyboards = bot_reminders.open_app_keyboards("https://example.com")
            for _ in range(2):
                await bot_reminders._send_group_marks(
                    telegram, database, Pacer(1000), keyboards  # type: ignore[arg-type]
                )
            return telegram.sent
        finally:
            await database.dispose()

    sent = asyncio.run(run())
    assert [(item.chat_id, item.text) for item in sent] == [(1, "«Бег»: отметка от Петя")]


def test_profile_follows_telegram(db_url: str) -> None:
    async def run() -> tuple[str | None, str | None]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                await Repository(session).get_or_create_user(5, "old", "Old", language="ru")
                await session.commit()
            middleware = ProfileMiddleware(database)

            async def handler(event: Any, data: dict[str, Any]) -> None:
                return None

            await middleware(handler, object(), {"event_from_user": _tg(5, None, "Новое")})  # type: ignore[arg-type]
            async with database.session_factory() as session:
                user = await Repository(session).get_user(5)
                return user.username, user.first_name
        finally:
            await database.dispose()

    # @username удалили — у остальных участников он подписан именем.
    assert asyncio.run(run()) == (None, "Новое")
    assert groups.member_name(SimpleNamespace(username=None, first_name="Новое")) == "Новое"  # type: ignore[arg-type]


def test_joining_checks_members_photos(db_url: str) -> None:
    """Вступил — фото его и владельца (ещё не сверённое) сверяются сразу."""

    async def run() -> None:
        database = Database(db_url)
        await database.create_tables()
        try:
            code, _ = await _owner_with_invite(database)
            async with database.session_factory() as session:
                await Repository(session).get_or_create_user(2, "petya", "Петя", language="ru")
                await session.commit()
            fake = FakeTelegram()
            fake.profile_photos[1] = b"anya"
            callback = _Callback(_tg(2, "petya"), f"join:ok:{code}")
            callback.bot = fake
            await group_invite.accept_invite(callback, database)  # type: ignore[arg-type]
            async with database.session_factory() as session:
                repo = Repository(session)
                owner, friend = await repo.get_user(1), await repo.get_user(2)
            assert owner.photo_id and owner.photo_file_id == "p1-160"
            assert friend.photo_id is None and friend.photo_checked_at is not None
            assert fake.photo_requests == 2
        finally:
            await database.dispose()

    asyncio.run(run())
