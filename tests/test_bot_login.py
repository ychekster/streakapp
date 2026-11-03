"""«Войти через Telegram» в боте (bot/handlers/web_login.py): сколько бы раз ни открылась
ссылка входа, в чате остаётся одно подтверждение."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from backend.accounts import CODE_TELEGRAM_LOGIN, TELEGRAM_LOGIN_TTL, create_code
from backend.config import load_settings
from backend.database import Database
from backend.repository import Repository
from bot.handlers import web_login


class _Bot:
    def __init__(self) -> None:
        self.deleted: list[int] = []

    async def delete_message(self, chat_id: int, message_id: int) -> None:
        self.deleted.append(message_id)


class _Message:
    """/start login_… от пользователя; `answers` — общий список ответов бота в чате."""

    def __init__(self, bot: _Bot, message_id: int, answers: list[dict[str, Any]]) -> None:
        self.bot = bot
        self.message_id = message_id
        self.chat = SimpleNamespace(id=42)
        self.from_user = SimpleNamespace(
            id=42, username="anya", first_name="Аня", language_code="ru", is_bot=False
        )
        self.answers = answers

    async def answer(self, text: str, **kwargs: Any) -> SimpleNamespace:
        self.answers.append({"text": text, **kwargs})
        return SimpleNamespace(message_id=1000 + len(self.answers))


def test_repeated_login_link_leaves_one_confirmation(db_url: str) -> None:
    async def scenario() -> None:
        database = Database(db_url)
        await database.create_tables()
        settings = load_settings()
        async with database.session_factory() as session:
            repo = Repository(session)
            await repo.get_or_create_user(-5, None, None, language="ru")
            code = await create_code(
                repo, settings, CODE_TELEGRAM_LOGIN, -5, TELEGRAM_LOGIN_TTL, short=True
            )
            await session.commit()
        bot = _Bot()
        answers: list[dict[str, Any]] = []
        command = SimpleNamespace(args=f"login_{code}")
        # Двойное нажатие: два /start почти одновременно.
        await asyncio.gather(
            web_login.start_login(_Message(bot, 1, answers), command, database, settings),  # type: ignore[arg-type]
            web_login.start_login(_Message(bot, 2, answers), command, database, settings),  # type: ignore[arg-type]
        )
        # Два подтверждения ушли по очереди, но первое и повторный /start удалены.
        assert len(answers) == 2 and bot.deleted == [1001, 2]
        assert web_login._prompts[42] == 1002
        await database.dispose()

    asyncio.run(scenario())
