"""Bot side of the web app: "log in via Telegram" and the install offer's «Не сейчас».

- `/start login_<code>` — the web app opened the bot to log in with Telegram. The bot
  asks to confirm; «Подтвердить вход» works once and only for a few minutes after the
  app asked. It marks the code as confirmed by this Telegram user, and the app that started the login
  picks it up (`/auth/telegram/poll`, see backend/accounts.py). The user is recorded
  like on a plain /start.
- «Не сейчас» under the one-time install offer (backend/messaging.py) removes its
  buttons.

This router is included before `start`: its /start filter is narrower.
"""

from __future__ import annotations

from aiogram import F, Router
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
from backend.messaging import INSTALL_OFFER_DISMISS
from backend.repository import Repository

router = Router(name="web_login")

_LOGIN_PREFIX = "login_"
_CONFIRM = "login:ok:"
_CANCEL = "login:cancel"


@router.message(CommandStart(deep_link=True, magic=F.args.startswith(_LOGIN_PREFIX)))
async def start_login(
    message: Message, command: CommandObject, database: Database, web_settings: Settings
) -> None:
    """Ask to confirm the login started in the web app. A stale or already confirmed
    link is not offered for confirmation at all."""
    if message.from_user is not None:
        await record_start(database, message.from_user)
    code = (command.args or "")[len(_LOGIN_PREFIX):]
    async with database.session_factory() as session:
        request = await telegram_login_request(Repository(session), web_settings, code)
    if request is None:
        await message.answer(LOGIN_EXPIRED_TEXT)
        return
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=LOGIN_CONFIRM_BUTTON, callback_data=f"{_CONFIRM}{code}")],
            [InlineKeyboardButton(text=LOGIN_CANCEL_BUTTON, callback_data=_CANCEL)],
        ]
    )
    await message.answer(LOGIN_CONFIRM_TEXT, reply_markup=markup)


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


@router.callback_query(F.data == INSTALL_OFFER_DISMISS)
async def dismiss_install_offer(callback: CallbackQuery) -> None:
    """«Не сейчас»: keep the text, remove the buttons."""
    await callback.answer()
    if callback.message is not None:
        try:
            await callback.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        except TelegramBadRequest as exc:
            logger.debug("Install offer buttons already removed: {}", exc)


async def _replace(callback: CallbackQuery, text: str) -> None:
    """Answer the button press and replace the question with the result."""
    await callback.answer()
    if callback.message is None:
        return
    try:
        await callback.message.edit_text(text)  # type: ignore[union-attr]
    except TelegramBadRequest as exc:
        logger.debug("Login message not edited: {}", exc)
