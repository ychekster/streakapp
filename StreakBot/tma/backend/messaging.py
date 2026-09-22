"""Сообщения бота, которые отправляет сам API: личное сообщение и ответ на отзыв из
админ-панели, копия рассылки её автору.

Они уходят сразу, в запросе администратора, — и он тут же видит результат: сообщение
дошло или пользователь заблокировал бота. Массовую рассылку отправляет процесс бота
(bot/broadcasts.py): она долгая и должна переживать перезапуск.

Бот (`aiogram.Bot` с тем же BOT_TOKEN) создаётся при старте API (`app.state.bot`) и не
обращается к сети, пока нечего отправить. Тексты — без разметки (`parse_mode` не
задаётся): что написал администратор, то и придёт.

Что пользователь заблокировал бота или ни разу его не запускал — не ошибка запроса, а
результат доставки (`Undelivered`): так вызывающий успевает отметить блокировку в базе
(ApiError откатил бы транзакцию). Остальные сбои Telegram — ApiError.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Literal

from aiogram import Bot
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.types import InputFile, Message
from aiogram.utils.formatting import Bold, ExpandableBlockQuote, Text
from loguru import logger
from starlette.datastructures import UploadFile

from tma.backend.constants import DEFAULT_LANGUAGE
from tma.backend.errors import ApiError

# Заголовок ответа на отзыв — на языке пользователя (ключи — constants.LANGUAGES).
# Под ним — цитата отзыва (свёрнутая, если длинная) и сам ответ.
REVIEW_REPLY_TITLES: dict[str, str] = {
    "ru": "💬 Ответ на ваш отзыв",
    "en": "💬 Reply to your review",
}
# Отзыв в цитате обрезается до стольких символов.
REVIEW_QUOTE_MAX_LENGTH = 300

# Telegram просит подождать (RetryAfter) не дольше этого — ждём и повторяем, иначе ошибка:
# администратор ждёт ответа на свой запрос.
_RETRY_AFTER_MAX_SECONDS = 5
# Загрузка видео до 50 МБ в Telegram может идти дольше таймаута запроса по умолчанию.
_UPLOAD_TIMEOUT_SECONDS = 300
_UPLOAD_CHUNK_BYTES = 256 * 1024
# Ответ Telegram «чат не найден» — пользователь ни разу не запускал бота.
_CHAT_NOT_FOUND = "chat not found"

# Почему сообщение не доставлено: пользователь заблокировал бота или не запускал его.
Undelivered = Literal["bot_blocked", "chat_not_found"]


class _UploadInputFile(InputFile):
    """Файл из формы запроса — в Telegram по частям, не читая его в память целиком."""

    def __init__(self, upload: UploadFile) -> None:
        super().__init__(filename=upload.filename or "media", chunk_size=_UPLOAD_CHUNK_BYTES)
        self._upload = upload

    async def read(self, bot: Bot) -> AsyncGenerator[bytes, None]:
        await self._upload.seek(0)
        while chunk := await self._upload.read(self.chunk_size):
            yield chunk


async def _send(send: Callable[[], Awaitable[Message]]) -> Message | Undelivered:
    """Отправить сообщение: на короткий RetryAfter — подождать и повторить один раз.

    Блокировка бота пользователем и «чат не найден» — результат (`Undelivered`),
    остальные ошибки Telegram — ApiError.
    """
    try:
        try:
            return await send()
        except TelegramRetryAfter as exc:
            if exc.retry_after > _RETRY_AFTER_MAX_SECONDS:
                raise
            await asyncio.sleep(exc.retry_after)
            return await send()
    except TelegramForbiddenError:
        return "bot_blocked"
    except TelegramBadRequest as exc:
        if _CHAT_NOT_FOUND in exc.message.lower():
            return "chat_not_found"
        logger.warning("Telegram rejected a message: {}", exc.message)
        raise ApiError(422, "telegram_rejected", "Telegram не принял сообщение") from exc
    except TelegramRetryAfter as exc:
        raise ApiError(
            503, "telegram_busy", "Telegram просит подождать, попробуйте позже"
        ) from exc
    except TelegramAPIError as exc:
        logger.warning("Telegram request failed: {}", exc)
        raise ApiError(502, "telegram_error", "Не удалось связаться с Telegram") from exc


async def send_text(bot: Bot, chat_id: int, text: str) -> Undelivered | None:
    """Личное сообщение как есть. None — доставлено."""
    result = await _send(lambda: bot.send_message(chat_id=chat_id, text=text))
    return result if isinstance(result, str) else None


def _quote(text: str) -> str:
    """Отзыв для цитаты: не длиннее REVIEW_QUOTE_MAX_LENGTH."""
    if len(text) <= REVIEW_QUOTE_MAX_LENGTH:
        return text
    return text[: REVIEW_QUOTE_MAX_LENGTH - 1].rstrip() + "…"


async def send_review_reply(
    bot: Bot, chat_id: int, language: str, review: str, reply: str
) -> Undelivered | None:
    """Ответ на отзыв: заголовок на языке пользователя, цитата отзыва и ответ. None —
    доставлено."""
    title = REVIEW_REPLY_TITLES.get(language, REVIEW_REPLY_TITLES[DEFAULT_LANGUAGE])
    content = Text(Bold(title), "\n", ExpandableBlockQuote(_quote(review)), "\n", reply)
    result = await _send(lambda: bot.send_message(chat_id=chat_id, **content.as_kwargs()))
    return result if isinstance(result, str) else None


async def send_broadcast_copy(
    bot: Bot,
    chat_id: int,
    text: str | None,
    media: UploadFile | None,
    media_type: str | None,
) -> str | None:
    """Прислать рассылку её автору — раньше всех, как образец — и вернуть file_id
    загруженного медиа (по нему бот разошлёт то же фото или видео остальным, не
    загружая файл заново). Без медиа — None.

    Автор не запускал бота или заблокировал его — 409: без этой копии медиа в Telegram не
    загрузить.
    """
    if media is None or media_type is None:
        result = await _send(lambda: bot.send_message(chat_id=chat_id, text=text or ""))
    elif media_type == "photo":
        result = await _send(
            lambda: bot.send_photo(
                chat_id=chat_id,
                photo=_UploadInputFile(media),
                caption=text,
                request_timeout=_UPLOAD_TIMEOUT_SECONDS,
            )
        )
    else:
        result = await _send(
            lambda: bot.send_video(
                chat_id=chat_id,
                video=_UploadInputFile(media),
                caption=text,
                supports_streaming=True,
                request_timeout=_UPLOAD_TIMEOUT_SECONDS,
            )
        )
    if isinstance(result, str):
        raise ApiError(
            409,
            "admin_chat_unavailable",
            "Сначала запустите бота: копия рассылки приходит вам первой",
        )
    # Telegram не распознал фото или видео (прислал его файлом) — разослать как задумано
    # не выйдет.
    if media_type == "photo":
        if not result.photo:
            raise ApiError(422, "invalid_media", "Фото в этом формате не поддерживается")
        return result.photo[-1].file_id  # самый крупный размер
    if media_type == "video":
        if result.video is None:
            raise ApiError(422, "invalid_media", "Видео в этом формате не поддерживается")
        return result.video.file_id
    return None
