"""Bot side of «Подключить ИИ» for administrators.

On the consent page an administrator may ask for app statistics too (backend/oauth.py):
the API writes to them with «Разрешить» and «Отклонить» (backend/messaging.py). A press
here lets that one connection read statistics (`oauth.confirm_ai_admin`) or spends the
request; the question is replaced with the result.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.types import CallbackQuery
from loguru import logger

from bot.constants import AI_ADMIN_ALLOWED_TEXT, AI_ADMIN_DECLINED_TEXT, AI_ADMIN_EXPIRED_TEXT
from backend.config import Settings
from backend.constants import DEFAULT_LANGUAGE
from backend.database import Database
from backend.messaging import AI_ADMIN_ALLOW, AI_ADMIN_DECLINE
from backend.oauth import confirm_ai_admin, decline_ai_admin
from backend.repository import Repository

router = Router(name="ai_admin")


@router.callback_query(F.data.startswith(AI_ADMIN_ALLOW))
async def allow_ai_admin(
    callback: CallbackQuery, database: Database, web_settings: Settings
) -> None:
    """«Разрешить»: the AI connection may read app statistics."""
    code = (callback.data or "")[len(AI_ADMIN_ALLOW):]
    async with database.session_factory() as session:
        repo = Repository(session)
        allowed = await confirm_ai_admin(repo, web_settings, code, callback.from_user.id)
        language = await _language(repo, callback.from_user.id)
        await session.commit()
    texts = AI_ADMIN_ALLOWED_TEXT if allowed else AI_ADMIN_EXPIRED_TEXT
    await _replace(callback, texts[language])


@router.callback_query(F.data.startswith(AI_ADMIN_DECLINE))
async def decline_ai_admin_press(
    callback: CallbackQuery, database: Database, web_settings: Settings
) -> None:
    """«Отклонить»: the connection keeps working without statistics."""
    code = (callback.data or "")[len(AI_ADMIN_DECLINE):]
    async with database.session_factory() as session:
        repo = Repository(session)
        await decline_ai_admin(repo, web_settings, code, callback.from_user.id)
        language = await _language(repo, callback.from_user.id)
        await session.commit()
    await _replace(callback, AI_ADMIN_DECLINED_TEXT[language])


async def _language(repo: Repository, telegram_id: int) -> str:
    user = await repo.get_user(telegram_id)
    language = user.language if user is not None else DEFAULT_LANGUAGE
    return language if language in AI_ADMIN_ALLOWED_TEXT else DEFAULT_LANGUAGE


async def _replace(callback: CallbackQuery, text: str) -> None:
    """Answer the press and replace the question with the result."""
    await callback.answer()
    if callback.message is None:
        return
    try:
        await callback.message.edit_text(text)  # type: ignore[union-attr]
    except TelegramBadRequest as exc:
        logger.debug("AI admin message not edited: {}", exc)
