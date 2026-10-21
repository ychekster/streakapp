"""Имена участников совместных привычек — такие, как сейчас в Telegram.

Участники видят друг друга по @username (нет — по имени). Mini App присылает свежие имя и
@username с каждым запросом, /start — тоже. Остальное делает бот:

- любое сообщение или нажатие кнопки в боте обновляет их у уже известного пользователя
  (`ProfileMiddleware`);
- раз в сутки бот спрашивает у Telegram (getChat) имена участников совместных привычек,
  которые сутки не открывали Mini App, — тех, кто сидит только в веб-приложении
  (`run_profile_refresh`).

Фото профиля участников (backend/photos.py) бот сверяет с Telegram сам: раз в
PHOTO_MAX_AGE у каждого (`run_photo_refresh`, проверяет каждые PHOTO_LOOP_INTERVAL), а
у вступившего и тех, чьё фото ещё не сверяли, — сразу при вступлении
(`refresh_new_mates_photos`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from datetime import timedelta
from typing import Any

from aiogram import BaseMiddleware, Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError
from aiogram.types import TelegramObject, User as TelegramUser
from loguru import logger

from bot.pacing import Pacer
from backend.database import Database
from backend.photos import PHOTO_MAX_AGE, current_photo
from backend.repository import Repository, utc_now

# Как часто сверять имена с Telegram и кого: не открывавших Mini App столько времени.
REFRESH_INTERVAL = timedelta(days=1)
# Первая сверка — не сразу при старте: бот сначала поднимается.
FIRST_REFRESH_DELAY = timedelta(minutes=5)
# Как часто искать участников, чьё фото пора сверить, и первый поиск после старта.
PHOTO_LOOP_INTERVAL = timedelta(minutes=10)
FIRST_PHOTO_REFRESH_DELAY = timedelta(seconds=30)


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


async def refresh_photos(
    bot: Bot, database: Database, user_ids: list[int], pacer: Pacer | None = None
) -> int:
    """Сверить фото профиля пользователей с Telegram; вернуть, у скольких оно сменилось.
    Запрос в Telegram — без открытой сессии."""
    changed = 0
    for user_id in user_ids:
        if pacer is not None:
            await pacer.wait()
        try:
            photo = await current_photo(bot, user_id)
        except TelegramBadRequest as exc:
            # Telegram такого не знает — считать, что фото нет, и не спрашивать каждый раз.
            logger.debug("Profile photo of {} is unavailable: {}", user_id, exc)
            photo = None
        except TelegramAPIError as exc:
            logger.debug("getUserProfilePhotos for {} failed: {}", user_id, exc)
            continue
        async with database.session_factory() as session:
            repo = Repository(session)
            user = await repo.get_user(user_id)
            if user is None:
                continue
            photo_id = photo.photo_id if photo is not None else None
            if photo_id != user.photo_id:
                changed += 1
            await repo.set_photo(
                user, photo_id, photo.file_id if photo is not None else None, utc_now()
            )
            await session.commit()
    return changed


async def refresh_new_mates_photos(bot: Bot, database: Database, user_id: int) -> None:
    """Вступил в совместную привычку: сверить фото — его и тех участников, чьё фото ещё
    не сверяли. Сбой не мешает вступлению."""
    try:
        async with database.session_factory() as session:
            user_ids = await Repository(session).group_mates_photo_unchecked(user_id)
        await refresh_photos(bot, database, sorted({user_id, *user_ids}))
    except Exception:  # noqa: BLE001 — фото не важнее вступления
        logger.exception("Could not refresh photos after user {} joined", user_id)


async def run_photo_refresh(bot: Bot, database: Database, pacer: Pacer) -> None:
    """Бесконечный цикл сверки фото участников; ошибки не останавливают его."""
    await asyncio.sleep(FIRST_PHOTO_REFRESH_DELAY.total_seconds())
    while True:
        try:
            async with database.session_factory() as session:
                user_ids = await Repository(session).group_users_photo_checked_before(
                    utc_now() - PHOTO_MAX_AGE
                )
            changed = await refresh_photos(bot, database, user_ids, pacer)
            if changed:
                logger.info("Profile photos changed in Telegram: {}", changed)
        except Exception:  # noqa: BLE001 — цикл не должен падать
            logger.exception("Photo refresh failed")
        await asyncio.sleep(PHOTO_LOOP_INTERVAL.total_seconds())
