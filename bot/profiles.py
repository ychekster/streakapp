"""Имена участников совместных привычек — такие, как сейчас в Telegram.

Участники видят друг друга по @username (нет — по имени). Mini App присылает свежие имя и
@username с каждым запросом, /start — тоже. Остальное делает бот:

- любое сообщение или нажатие кнопки в боте обновляет их у уже известного пользователя
  (`ProfileMiddleware`);
- раз в сутки бот спрашивает у Telegram (getChat) имена участников совместных привычек,
  которые сутки не открывали Mini App, — тех, кто сидит только в веб-приложении
  (`run_profile_refresh`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from aiogram import BaseMiddleware, Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError
from aiogram.types import TelegramObject, User as TelegramUser
from loguru import logger

from bot.pacing import Pacer
from backend.database import Database
from backend.repository import Repository, utc_now

# Как часто сверять имена с Telegram и кого: не открывавших Mini App столько времени.
REFRESH_INTERVAL = timedelta(days=1)
# Первая сверка — не сразу при старте: бот сначала поднимается.
FIRST_REFRESH_DELAY = timedelta(minutes=5)


class ProfileMiddleware(BaseMiddleware):
    """Обновить имя и @username известного пользователя из апдейта. Сбой не мешает
    обработке."""

    def __init__(self, database: Database) -> None:
        self.database = database

    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        sender: TelegramUser | None = data.get("event_from_user")
        if sender is not None and not sender.is_bot:
            try:
                async with self.database.session_factory() as session:
                    repo = Repository(session)
                    user = await repo.get_user(sender.id)
                    if user is not None:
                        await repo.update_profile(user, sender.username, sender.first_name)
                        await session.commit()
            except Exception:  # noqa: BLE001 — имя не важнее ответа пользователю
                logger.exception("Could not refresh the profile of user {}", sender.id)
        return await handler(event, data)


async def refresh_profiles(bot: Bot, database: Database, pacer: Pacer) -> int:
    """Сверить с Telegram имена участников совместных привычек, которые давно не открывали
    Mini App; вернуть, у скольких они изменились."""
    async with database.session_factory() as session:
        user_ids = await Repository(session).group_users_seen_before(
            utc_now() - REFRESH_INTERVAL
        )
    changed = 0
    for user_id in user_ids:
        await pacer.wait()
        try:
            chat = await bot.get_chat(user_id)
        except TelegramForbiddenError:
            continue
        except TelegramAPIError as exc:
            logger.debug("getChat for {} failed: {}", user_id, exc)
            continue
        async with database.session_factory() as session:
            repo = Repository(session)
            user = await repo.get_user(user_id)
            if user is None:
                continue
            before = (user.username, user.first_name)
            await repo.update_profile(user, chat.username, chat.first_name or user.first_name)
            if (user.username, user.first_name) != before:
                changed += 1
            await session.commit()
    return changed


async def run_profile_refresh(bot: Bot, database: Database, pacer: Pacer) -> None:
    """Бесконечный цикл сверки имён раз в сутки; ошибки не останавливают его."""
    await asyncio.sleep(FIRST_REFRESH_DELAY.total_seconds())
    while True:
        try:
            changed = await refresh_profiles(bot, database, pacer)
            if changed:
                logger.info("Profiles refreshed from Telegram: {}", changed)
        except Exception:  # noqa: BLE001 — цикл не должен падать
            logger.exception("Profile refresh failed")
        await asyncio.sleep(REFRESH_INTERVAL.total_seconds())
