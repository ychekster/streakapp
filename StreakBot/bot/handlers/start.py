"""Команда /start — единственная функция бота.

Присылает приветствие с кратким описанием проекта и кнопкой запуска Mini App.
Всё взаимодействие с привычками происходит в приложении, не в чате.
"""

from __future__ import annotations

from aiogram import Router
from aiogram.filters import CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    Message,
    WebAppInfo,
)
from aiogram.utils.formatting import Bold, Text

from bot.config import Config
from bot.constants import (
    BTN_OPEN_APP,
    WELCOME_ABOUT,
    WELCOME_CALL_TO_ACTION,
    WELCOME_TITLE,
)

router = Router(name="start")


def _open_app_kb(tma_url: str) -> InlineKeyboardMarkup:
    """Inline-кнопка, открывающая Mini App."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text=BTN_OPEN_APP, web_app=WebAppInfo(url=tma_url))]
        ]
    )


@router.message(CommandStart())
async def cmd_start(message: Message, config: Config) -> None:
    """Приветствие: жирный заголовок, абзац о проекте, жирный призыв и кнопка."""
    content = Text(
        Bold(WELCOME_TITLE),
        "\n\n",
        WELCOME_ABOUT,
        "\n\n",
        Bold(WELCOME_CALL_TO_ACTION),
    )
    await message.answer(**content.as_kwargs(), reply_markup=_open_app_kb(config.tma_url))
