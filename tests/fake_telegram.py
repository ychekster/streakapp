"""Вместо Bot API в тестах: запоминает отправленное и изображает пользователей, которые
заблокировали бота."""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.methods import SendMessage


@dataclass
class Sent:
    """Отправленное сообщение: вид, чат, текст или подпись, медиа и прочие параметры."""

    kind: str
    chat_id: int
    text: str | None
    media: Any = None
    extra: dict[str, Any] = field(default_factory=dict)


class FakeTelegram:
    """Ответы — как у Telegram: у фото список размеров, у видео — объект с file_id.
    Загружаемый файл (InputFile) читается целиком — так проверяется, что он дошёл."""

    def __init__(self) -> None:
        self.sent: list[Sent] = []
        self.blocked: set[int] = set()
        # Не принимать анимированные иконки на кнопках — как Telegram, когда у владельца
        # бота кончился Premium.
        self.reject_icons = False
        # Фото профиля: user_id → байты (нет — фото нет); сколько раз их спрашивали.
        self.profile_photos: dict[int, bytes] = {}
        self.photo_requests = 0

    def _check(self, chat_id: int, extra: dict[str, Any]) -> None:
        if chat_id in self.blocked:
            raise TelegramForbiddenError(
                method=SendMessage(chat_id=chat_id, text=""),
                message="Forbidden: bot was blocked by the user",
            )
        markup = extra.get("reply_markup")
        if self.reject_icons and markup is not None and any(
            button.icon_custom_emoji_id for row in markup.inline_keyboard for button in row
        ):
            raise TelegramBadRequest(
                method=SendMessage(chat_id=chat_id, text=""),
                message="Bad Request: custom emoji is unavailable",
            )

    async def _content(self, media: Any) -> Any:
        if hasattr(media, "read"):
            return b"".join([chunk async for chunk in media.read(self)])
        return media

    async def send_message(self, chat_id: int, text: str, **extra: Any) -> SimpleNamespace:
        self._check(chat_id, extra)
        self.sent.append(Sent("message", chat_id, text, extra=extra))
        return SimpleNamespace(photo=None, video=None)

    async def send_photo(
        self, chat_id: int, photo: Any, caption: str | None = None, **extra: Any
    ) -> SimpleNamespace:
        self._check(chat_id, extra)
        self.sent.append(Sent("photo", chat_id, caption, await self._content(photo), extra))
        sizes = [SimpleNamespace(file_id="photo-small"), SimpleNamespace(file_id="photo-large")]
        return SimpleNamespace(photo=sizes, video=None)

    async def send_video(
        self, chat_id: int, video: Any, caption: str | None = None, **extra: Any
    ) -> SimpleNamespace:
        self._check(chat_id, extra)
        self.sent.append(Sent("video", chat_id, caption, await self._content(video), extra))
        return SimpleNamespace(photo=None, video=SimpleNamespace(file_id="video-id"))

    async def get_user_profile_photos(self, user_id: int, limit: int = 100) -> SimpleNamespace:
        self.photo_requests += 1
        if user_id not in self.profile_photos:
            return SimpleNamespace(total_count=0, photos=[])
        # Версия фото меняется вместе с картинкой, как file_unique_id у Telegram.
        version = self.profile_photos[user_id].hex()[:16]
        sizes = [
            SimpleNamespace(
                file_id=f"p{user_id}-{side}",
                file_unique_id=f"u{user_id}-{version}-{side}",
                width=side,
                height=side,
            )
            for side in (160, 320, 640)
        ]
        return SimpleNamespace(total_count=1, photos=[sizes])

    async def get_file(self, file_id: str) -> SimpleNamespace:
        return SimpleNamespace(file_id=file_id, file_path=f"photos/{file_id}.jpg")

    async def download_file(self, file_path: str) -> io.BytesIO:
        user_id = int(file_path.split("/p")[1].split("-")[0])
        assert file_path.endswith("-160.jpg"), "берётся наименьший подходящий размер"
        return io.BytesIO(self.profile_photos[user_id])
