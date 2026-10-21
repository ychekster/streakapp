"""Фото профиля участников совместных привычек — из Telegram.

Какое у человека фото сейчас, бот сверяет с Telegram (getUserProfilePhotos) и запоминает в
`users`: `photo_id` — file_unique_id (меняется вместе с фото), `photo_file_id` — чтобы
скачать (bot/profiles.py: при вступлении и раз в PHOTO_MAX_AGE). Участники получают
`photo_id` в `/sync` (GroupMember.photo): приложение держит фото на устройстве по этой
версии и загружает новое, только когда она сменилась.

Саму картинку отдаёт API (routers/groups.py): ссылка на файл Telegram содержит токен бота,
поэтому приложению идут байты. Скачанные помнятся в памяти процесса по версии фото.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta

from aiogram import Bot

from backend.models import User

# Как часто сверять фото участников с Telegram: человек сменил фото — у остальных оно
# сменится не позже чем через столько (и с очередным /sync).
PHOTO_MAX_AGE = timedelta(hours=3)
# Сколько картинок держать в памяти API: дальше выбрасываются самые старые.
PHOTO_CACHE_SIZE = 500
# Размер, который нужен кружку участника (с запасом на @3x): берётся наименьший не меньше.
PHOTO_MIN_SIDE = 160


@dataclass(frozen=True)
class CurrentPhoto:
    """Текущее фото профиля: версия (file_unique_id) и file_id, чтобы скачать."""

    photo_id: str
    file_id: str


async def current_photo(bot: Bot, user_id: int) -> CurrentPhoto | None:
    """Фото профиля пользователя в Telegram сейчас; None — фото нет (или оно скрыто
    настройками приватности). Ошибки Telegram не перехватываются."""
    photos = await bot.get_user_profile_photos(user_id=user_id, limit=1)
    if not photos.photos:
        return None
    sizes = photos.photos[0]
    fitting = [size for size in sizes if min(size.width, size.height) >= PHOTO_MIN_SIDE]
    size = min(fitting, key=lambda item: item.width) if fitting else sizes[-1]
    return CurrentPhoto(photo_id=size.file_unique_id, file_id=size.file_id)


# Скачанные картинки по версии фото (порядок — по времени добавления).
_cache: dict[str, bytes] = {}


def clear_cache() -> None:
    """Забыть все картинки (тесты)."""
    _cache.clear()


async def photo_bytes(bot: Bot, user: User) -> bytes | None:
    """Картинка текущего фото пользователя (JPEG); None — фото нет или Telegram её не
    отдал. Вызывать без открытой транзакции: идёт в Telegram."""
    if not user.photo_id or not user.photo_file_id:
        return None
    cached = _cache.get(user.photo_id)
    if cached is not None:
        return cached
    try:
        file = await bot.get_file(user.photo_file_id)
        data = await bot.download_file(file.file_path) if file.file_path else None
    except Exception:  # noqa: BLE001 — без фото участник просто с буквой
        return None
    if data is None:
        return None
    content = data.getvalue()
    if len(_cache) >= PHOTO_CACHE_SIZE:
        del _cache[next(iter(_cache))]
    _cache[user.photo_id] = content
    return content
