"""Запасной вариант сообщения без анимированных эмодзи.

Анимированные эмодзи (bot/constants.py) бот может отправлять, пока у его владельца
Telegram Premium. Если Telegram отклонил сообщение с ними (TelegramBadRequest), его
отправляют ещё раз без них: в тексте на месте анимированного эмодзи и так стоит обычный
(`CustomEmoji.fallback`), поэтому достаточно убрать сущности custom_emoji, а у кнопок —
иконки. Так приветствие и напоминания доходят и без Premium.
"""

from __future__ import annotations

from typing import Any

from aiogram.enums import MessageEntityType
from aiogram.types import InlineKeyboardMarkup


def without_custom_emoji(content: dict[str, Any]) -> dict[str, Any]:
    """Аргументы сообщения (`Text.as_kwargs()`) без сущностей custom_emoji."""
    entities = [
        entity
        for entity in content.get("entities") or []
        if entity.type != MessageEntityType.CUSTOM_EMOJI
    ]
    return {**content, "entities": entities or None}


def without_icons(markup: InlineKeyboardMarkup) -> InlineKeyboardMarkup:
    """Та же клавиатура без анимированных иконок на кнопках."""
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [button.model_copy(update={"icon_custom_emoji_id": None}) for button in row]
            for row in markup.inline_keyboard
        ]
    )
