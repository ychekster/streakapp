"""Эндпоинты справочных данных для форм.

    GET /meta           — лимит длины названия привычки
    GET /meta/timezones — каталог часовых поясов на языке интерфейса

Требуют валидную `initData`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from tma.backend import validation
from tma.backend.auth import TelegramUser
from tma.backend.constants import DEFAULT_LANGUAGE
from tma.backend.dependencies import get_current_user
from tma.backend.schemas import MetaResponse, TimezonesResponse
from tma.backend.services import build_meta, build_timezones

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=MetaResponse)
async def read_meta(
    _: TelegramUser = Depends(get_current_user),
) -> MetaResponse:
    """Справочные данные для формы привычки."""
    return build_meta()


@router.get("/timezones", response_model=TimezonesResponse)
async def read_timezones(
    language: str = Query(DEFAULT_LANGUAGE, description="Язык названий: ru, en"),
    _: TelegramUser = Depends(get_current_user),
) -> TimezonesResponse:
    """Каталог часовых поясов для выбора в настройках: город, страна и смещение."""
    return build_timezones(validation.validate_language(language))
