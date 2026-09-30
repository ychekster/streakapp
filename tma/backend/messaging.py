"""Сообщения бота, которые отправляет сам API: личное сообщение и ответ на отзыв из
админ-панели, копия рассылки её автору. Здесь же — кнопка под рассылкой: её ставят и
копия автору, и бот, рассылающий остальным (bot/broadcasts.py).

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
from typing import Literal, NamedTuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from aiogram import Bot
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramBadRequest,
    TelegramForbiddenError,
    TelegramRetryAfter,
)
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InputFile,
    Message,
    WebAppInfo,
)
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


class BroadcastButton(NamedTuple):
    """Кнопка под рассылкой: подпись на языке получателя (ключи — constants.LANGUAGES),
    id анимированной иконки перед подписью (None — без иконки) и экран приложения, который
    она открывает (None — главный)."""

    texts: dict[str, str]
    icon_emoji_id: str | None
    screen: str | None


# Кнопки рассылки (ключи — constants.BROADCAST_BUTTONS). «Открыть приложение» — та же,
# что под приветствием и напоминанием бота (bot/constants.py: REMINDER_BUTTONS и
# OPEN_APP_EMOJI; тест следит, чтобы они совпадали). «Написать отзыв» открывает
# приложение сразу на экране отзыва.
BROADCAST_BUTTONS: dict[str, BroadcastButton] = {
    "open_app": BroadcastButton(
        texts={"ru": "Открыть приложение", "en": "Open App"},
        icon_emoji_id="6028346797368283073",
        screen=None,
    ),
    "review": BroadcastButton(
        texts={"ru": "Написать отзыв", "en": "Write a review"},
        icon_emoji_id="5886685105065300941",  # ⭐️
        screen="review",
    ),
}
# Параметр адреса Mini App с экраном, на котором она откроется (читает фронтенд, App.tsx).
APP_SCREEN_PARAM = "open"

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


def app_url(tma_url: str, screen: str | None) -> str:
    """Адрес Mini App, открывающий экран `screen` (None — главный)."""
    if screen is None:
        return tma_url
    parts = urlsplit(tma_url)
    query = [*parse_qsl(parts.query), (APP_SCREEN_PARAM, screen)]
    return urlunsplit(parts._replace(query=urlencode(query)))


def broadcast_keyboard(
    button: str | None, language: str, tma_url: str, *, icon: bool = True
) -> InlineKeyboardMarkup | None:
    """Клавиатура под рассылкой: кнопка `button` (None — без кнопки) с подписью на языке
    `language`; `icon=False` — без анимированной иконки (её Telegram может не принять,
    см. bot/emoji.py)."""
    if button is None:
        return None
    spec = BROADCAST_BUTTONS[button]
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=spec.texts.get(language, spec.texts[DEFAULT_LANGUAGE]),
                    icon_custom_emoji_id=spec.icon_emoji_id if icon else None,
                    web_app=WebAppInfo(url=app_url(tma_url, spec.screen)),
                )
            ]
        ]
    )


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
    keyboard: Callable[[bool], InlineKeyboardMarkup | None],
) -> str | None:
    """Прислать рассылку её автору — раньше всех, как образец — и вернуть file_id
    загруженного медиа (по нему бот разошлёт то же фото или видео остальным, не
    загружая файл заново). Без медиа — None.

    `keyboard(icon)` — кнопка под сообщением (с анимированной иконкой или без). Если
    Telegram не принял сообщение с иконкой (у владельца бота кончился Premium), оно
    отправляется ещё раз без неё.

    Автор не запускал бота или заблокировал его — 409: без этой копии медиа в Telegram не
    загрузить.
    """

    async def deliver(markup: InlineKeyboardMarkup | None) -> Message | Undelivered:
        if media is None or media_type is None:
            return await _send(
                lambda: bot.send_message(chat_id=chat_id, text=text or "", reply_markup=markup)
            )
        if media_type == "photo":
            return await _send(
                lambda: bot.send_photo(
                    chat_id=chat_id,
                    photo=_UploadInputFile(media),
                    caption=text,
                    reply_markup=markup,
                    request_timeout=_UPLOAD_TIMEOUT_SECONDS,
                )
            )
        return await _send(
            lambda: bot.send_video(
                chat_id=chat_id,
                video=_UploadInputFile(media),
                caption=text,
                supports_streaming=True,
                reply_markup=markup,
                request_timeout=_UPLOAD_TIMEOUT_SECONDS,
            )
        )

    markup = keyboard(True)
    try:
        result = await deliver(markup)
    except ApiError as exc:
        plain = keyboard(False)
        if exc.code != "telegram_rejected" or plain == markup:
            raise
        result = await deliver(plain)
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
