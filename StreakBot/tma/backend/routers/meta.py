"""Эндпоинт справочных данных для форм.

    GET /meta — дни недели, диапазоны времени, варианты часовых поясов

Значения берутся из констант бота, поэтому формы TMA используют те же правила,
что и /add и /settings бота. Требует валидную `initData`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from tma.backend.auth import TelegramUser
from tma.backend.dependencies import get_current_user
from tma.backend.schemas import MetaResponse
from tma.backend.services import build_meta

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=MetaResponse)
async def read_meta(
    _: TelegramUser = Depends(get_current_user),
) -> MetaResponse:
    """Справочные данные для форм создания привычки и настроек."""
    return build_meta()
