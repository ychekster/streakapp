"""Bot side of the admin panel in the web app.

The web app asks to open the admin panel on a device that is not allowed yet
(`POST /auth/admin-device`): the API writes to the administrator with «Разрешить» and
«Отклонить» (backend/messaging.py). A press here allows that one web session
(backend/accounts.py, confirm_admin_device) or spends the request; the question is
replaced with the result, and the app that waits (`/auth/admin-device/poll`) opens the
panel or stops waiting.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery
from loguru import logger

from bot.constants import (
    ADMIN_DEVICE_ALLOWED_TEXT,
    ADMIN_DEVICE_DECLINED_TEXT,
    ADMIN_DEVICE_EXPIRED_TEXT,
)
from backend.accounts import confirm_admin_device, decline_admin_device
from backend.config import Settings
from backend.constants import DEFAULT_LANGUAGE
from backend.database import Database
from backend.messaging import ADMIN_DEVICE_ALLOW, ADMIN_DEVICE_DECLINE
from backend.repository import Repository

router = Router(name="admin_device")


@router.callback_query(F.data.startswith(ADMIN_DEVICE_ALLOW))
async def allow_admin_device(
    callback: CallbackQuery, database: Database, web_settings: Settings
) -> None:
    """«Разрешить»: the device that asked may open the admin panel."""
    code = (callback.data or "")[len(ADMIN_DEVICE_ALLOW):]
    async with database.session_factory() as session:
        repo = Repository(session)
        allowed = await confirm_admin_device(repo, web_settings, code, callback.from_user.id)
        language = await _language(repo, callback.from_user.id)
        await session.commit()
    texts = ADMIN_DEVICE_ALLOWED_TEXT if allowed else ADMIN_DEVICE_EXPIRED_TEXT
    await _replace(callback, texts[language])


@router.callback_query(F.data.startswith(ADMIN_DEVICE_DECLINE))
async def decline_admin_device_press(
    callback: CallbackQuery, database: Database, web_settings: Settings
) -> None:
    """«Отклонить»: the request is spent, the app stops waiting."""
    code = (callback.data or "")[len(ADMIN_DEVICE_DECLINE):]
    async with database.session_factory() as session:
        repo = Repository(session)
        await decline_admin_device(repo, web_settings, code, callback.from_user.id)
        language = await _language(repo, callback.from_user.id)
        await session.commit()
    await _replace(callback, ADMIN_DEVICE_DECLINED_TEXT[language])


async def _language(repo: Repository, telegram_id: int) -> str:
    user = await repo.get_user(telegram_id)
    language = user.language if user is not None else DEFAULT_LANGUAGE
    return language if language in ADMIN_DEVICE_ALLOWED_TEXT else DEFAULT_LANGUAGE


async def _replace(callback: CallbackQuery, text: str) -> None:
    """Answer the press and replace the question with the result."""
    await callback.answer()
    if callback.message is None:
        return
    try:
        await callback.message.edit_text(text)  # type: ignore[union-attr]
    except TelegramBadRequest as exc:
        logger.debug("Admin device message not edited: {}", exc)
