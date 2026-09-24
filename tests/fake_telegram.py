"""Вместо Bot API в тестах: запоминает отправленное и изображает пользователей, которые
заблокировали бота."""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any

from aiogram.exceptions import TelegramForbiddenError
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

    def _check(self, chat_id: int) -> None:
        if chat_id in self.blocked:
            raise TelegramForbiddenError(
                method=SendMessage(chat_id=chat_id, text=""),
                message="Forbidden: bot was blocked by the user",
            )

    async def _content(self, media: Any) -> Any:
        if hasattr(media, "read"):
            return b"".join([chunk async for chunk in media.read(self)])
        return media

    async def send_message(self, chat_id: int, text: str, **extra: Any) -> SimpleNamespace:
        self._check(chat_id)
        self.sent.append(Sent("message", chat_id, text, extra=extra))
        return SimpleNamespace(photo=None, video=None)

    async def send_photo(
        self, chat_id: int, photo: Any, caption: str | None = None, **extra: Any
    ) -> SimpleNamespace:
        self._check(chat_id)
        self.sent.append(Sent("photo", chat_id, caption, await self._content(photo), extra))
        sizes = [SimpleNamespace(file_id="photo-small"), SimpleNamespace(file_id="photo-large")]
        return SimpleNamespace(photo=sizes, video=None)

    async def send_video(
        self, chat_id: int, video: Any, caption: str | None = None, **extra: Any
    ) -> SimpleNamespace:
        self._check(chat_id)
        self.sent.append(Sent("video", chat_id, caption, await self._content(video), extra))
        return SimpleNamespace(photo=None, video=SimpleNamespace(file_id="video-id"))
