"""Bot side of the web app: "log in via Telegram".

- `/start login_<code>` — the web app opened the bot to log in with Telegram. The bot
  asks to confirm; «Подтвердить вход» works once and only for a few minutes after the
  app asked. It marks the code as confirmed by this Telegram user, and the app that started the login
  picks it up (`/auth/telegram/poll`, see backend/accounts.py). The user is recorded
  like on a plain /start (after the answer: it is not kept waiting).

The chat keeps one confirmation however many times the link was opened (a double press
in the app, Telegram opened twice): a repeated /start login_… is deleted, and so is the
earlier confirmation — the new one takes its place; a repeat of a code already confirmed
is only deleted (not «link expired»). Remembered in memory: after a bot restart the first
repeat simply asks again.

This router is included before `start`: its /start filter is narrower.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from loguru import logger

from bot.constants import (
    LOGIN_CANCEL_BUTTON,
    LOGIN_CANCELLED_TEXT,
    LOGIN_CONFIRM_BUTTON,
    LOGIN_CONFIRM_TEXT,
    LOGIN_DONE_TEXT,
    LOGIN_EXPIRED_TEXT,
)
from bot.handlers.start import record_start
from backend.accounts import confirm_telegram_login, telegram_login_request
from backend.config import Settings
from backend.database import Database
from backend.repository import Repository

router = Router(name="web_login")

_LOGIN_PREFIX = "login_"
_CONFIRM = "login:ok:"
_CANCEL = "login:cancel"

# Chat → the message id of its confirmation still waiting for a press, and the last code
# asked there.
_prompts: dict[int, int] = {}
_codes: dict[int, str] = {}
# Two /start of one chat at once (a double press) are answered one after the other.
_locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


@router.message(CommandStart(deep_link=True, magic=F.args.startswith(_LOGIN_PREFIX)))
async def start_login(
    message: Message, command: CommandObject, database: Database, web_settings: Settings
) -> None:
    """Ask to confirm the login started in the web app. A stale or already confirmed
    link is not offered for confirmation at all. A repeat replaces the confirmation (see
    the module comment)."""
    code = (command.args or "")[len(_LOGIN_PREFIX):]
    chat_id = message.chat.id
    async with _locks[chat_id]:
        async with database.session_factory() as session:
            request = await telegram_login_request(Repository(session), web_settings, code)
        if request is None and _codes.get(chat_id) == code:
            await _delete(message.bot, chat_id, message.message_id)
            return
        _codes[chat_id] = code
        earlier = _prompts.pop(chat_id, None)
        if earlier is not None:
            await _delete(message.bot, chat_id, earlier)
            await _delete(message.bot, chat_id, message.message_id)
        if request is None:
            await message.answer(LOGIN_EXPIRED_TEXT)
        else:
            markup = InlineKeyboardMarkup(
                inline_keyboard=[
                    [
                        InlineKeyboardButton(
                            text=LOGIN_CONFIRM_BUTTON, callback_data=f"{_CONFIRM}{code}"
                        )
                    ],
                    [InlineKeyboardButton(text=LOGIN_CANCEL_BUTTON, callback_data=_CANCEL)],
                ]
            )
            sent = await message.answer(LOGIN_CONFIRM_TEXT, reply_markup=markup)
            _prompts[chat_id] = sent.message_id
    if message.from_user is not None:
        await record_start(database, message.from_user)


async def _delete(bot: Bot | None, chat_id: int, message_id: int) -> None:
    """Delete a message of the chat; one already gone (or too old) is left as it is."""
    if bot is None:
        return
    try:
        await bot.delete_message(chat_id, message_id)
    except TelegramBadRequest as exc:
        logger.debug("Login message not deleted: {}", exc)


@router.callback_query(F.data.startswith(_CONFIRM))
async def confirm_login(
    callback: CallbackQuery, database: Database, web_settings: Settings
) -> None:
    """Confirm: the app gets logged into this Telegram account."""
    code = (callback.data or "")[len(_CONFIRM):]
    user = callback.from_user
    async with database.session_factory() as session:
        confirmed = await confirm_telegram_login(
            Repository(session), web_settings, code, user.id, user.username, user.first_name
        )
        await session.commit()
    await _replace(callback, LOGIN_DONE_TEXT if confirmed else LOGIN_EXPIRED_TEXT)


@router.callback_query(F.data == _CANCEL)
async def cancel_login(callback: CallbackQuery) -> None:
    await _replace(callback, LOGIN_CANCELLED_TEXT)


async def _replace(callback: CallbackQuery, text: str) -> None:
    """Answer the button press and replace the question with the result."""
    await callback.answer()
    if callback.message is None:
        return
    if _prompts.get(callback.message.chat.id) == callback.message.message_id:
        del _prompts[callback.message.chat.id]
    try:
        await callback.message.edit_text(text)  # type: ignore[union-attr]
    except TelegramBadRequest as exc:
        logger.debug("Login message not edited: {}", exc)
