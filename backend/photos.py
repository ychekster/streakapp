"""Фото профиля участников совместных привычек — из Telegram.

Фото берёт бот (getUserProfilePhotos → getFile → скачать): ссылка на файл Telegram
содержит токен бота, поэтому приложению отдаются сами байты (routers/groups.py). Нет фото
(или его скрыли настройками приватности) — None, приложение рисует букву. Ответы Telegram
помнятся в памяти процесса PHOTO_TTL: список участников открывают часто, а фото меняют
редко.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from aiogram import Bot
from loguru import logger

# Сколько помнить фото (и то, что его нет).
PHOTO_TTL = 6 * 60 * 60
# Сколько фото держать в памяти: дальше выбрасываются самые старые.
PHOTO_CACHE_SIZE = 500
# Размер, который нужен кружку участника (с запасом на @3x): берётся наименьший не меньше.
PHOTO_MIN_SIDE = 160


@dataclass
class _Cached:
    content: bytes | None
    fetched_at: float


_cache: dict[int, _Cached] = {}


def clear_cache() -> None:
    """Забыть все фото (тесты)."""
    _cache.clear()


async def profile_photo(bot: Bot, user_id: int) -> bytes | None:
    """Текущее фото профиля пользователя (JPEG) или None — его нет или Telegram не ответил
    (тогда не запоминается: спросим в следующий раз)."""
    now = time.monotonic()
    cached = _cache.get(user_id)
    if cached is not None and now - cached.fetched_at < PHOTO_TTL:
        return cached.content
    try:
        photos = await bot.get_user_profile_photos(user_id=user_id, limit=1)
        content: bytes | None = None
        if photos.photos:
            sizes = photos.photos[0]
            fitting = [size for size in sizes if min(size.width, size.height) >= PHOTO_MIN_SIDE]
            size = min(fitting, key=lambda item: item.width) if fitting else sizes[-1]
            file = await bot.get_file(size.file_id)
            if file.file_path:
                data = await bot.download_file(file.file_path)
                content = data.getvalue() if data is not None else None
    except Exception as exc:  # noqa: BLE001 — без фото участник просто с буквой
        logger.debug("Profile photo of {} is unavailable: {}", user_id, exc)
        return None
    if len(_cache) >= PHOTO_CACHE_SIZE:
        oldest = min(_cache, key=lambda key: _cache[key].fetched_at)
        del _cache[oldest]
    _cache[user_id] = _Cached(content, now)
    return content
