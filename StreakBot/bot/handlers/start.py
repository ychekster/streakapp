"""Команда /start — единственная команда бота.

Присылает приветствие с кратким описанием проекта и кнопкой запуска Mini App.
Всё взаимодействие с привычками происходит в приложении, не в чате.

Запустивший бота записывается в базу (если его там ещё нет) — так админ-панель знает
и тех, кто приложение ещё не открывал, а рассылка «не открывали приложение» находит их.
/start означает и что бот не заблокирован: отметка о блокировке снимается.
"""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    User as TelegramUser,
    WebAppInfo,
)
from aiogram.utils.formatting import Bold, Text
from loguru import logger

from bot.config import Config
from bot.constants import (
    BTN_OPEN_APP,
    WELCOME_ABOUT,
    WELCOME_CALL_TO_ACTION,
    WELCOME_TITLE,
)
from tma.backend.database import Database
from tma.backend.repository import Repository
from tma.backend.services import language_from_telegram

router = Router(name="start")


def _open_app_kb(tma_url: str) -> InlineKeyboardMarkup:
    """Inline-кнопка, открывающая Mini App."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=BTN_OPEN_APP, web_app=WebAppInfo(url=tma_url))]
        ]
    )


async def _record_start(database: Database, user: TelegramUser) -> None:
    """Записать запустившего бота (язык интерфейса — по языку Telegram, как в API) и
    снять отметку о блокировке бота. Сбой не мешает приветствию."""
    try:
        async with database.session_factory() as session:
            repo = Repository(session)
            await repo.get_or_create_user(
                user.id,
                user.username,
                user.first_name,
                language=language_from_telegram(user.language_code),
            )
            await repo.set_bot_blocked([user.id], blocked=False)
            await session.commit()
    except Exception:  # noqa: BLE001 — база недоступна: приветствие всё равно уходит
        logger.exception("Could not record /start of user {}", user.id)


@router.message(CommandStart())
async def cmd_start(message: Message, config: Config, database: Database) -> None:
    """Приветствие: жирный заголовок, абзац о проекте, жирный призыв и кнопка."""
    if message.from_user is not None:
        await _record_start(database, message.from_user)
    content = Text(
        Bold(WELCOME_TITLE),
        "\n\n",
        WELCOME_ABOUT,
        "\n\n",
        Bold(WELCOME_CALL_TO_ACTION),
    )
    await message.answer(**content.as_kwargs(), reply_markup=_open_app_kb(config.tma_url))
