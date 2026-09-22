"""Эндпоинты справочных данных для форм.

    GET /meta             — лимит длины названия привычки
    GET /meta/timezones   — каталог часовых поясов на языке интерфейса
    GET /meta/timezones?q — поиск города (его пояса) по названию

Требуют валидную `initData`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from tma.backend import validation
from tma.backend.auth import TelegramUser
from tma.backend.constants import DEFAULT_LANGUAGE, TIMEZONE_QUERY_MAX_LENGTH
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
    q: str | None = Query(
        None,
        max_length=TIMEZONE_QUERY_MAX_LENGTH,
        description="Поиск: название города (можно с уточнением страны или региона), "
        "страны или смещение («+3»)",
    ),
    _: TelegramUser = Depends(get_current_user),
) -> TimezonesResponse:
    """Часовые пояса для выбора в настройках: без `q` — каталог (по поясу на зону, с
    запада на восток), с `q` — найденные города. У каждого — зона, город, страна и
    смещение."""
    return build_timezones(validation.validate_language(language), q)
