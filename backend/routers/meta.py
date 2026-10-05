"""Эндпоинты справочных данных для форм.

    GET /meta             — лимит длины названия привычки
    GET /meta/timezones   — каталог часовых поясов на языке интерфейса
    GET /meta/timezones?q — поиск города (его пояса) по названию

Требуют авторизацию: `initData` Telegram или сессию веб-приложения.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from starlette.concurrency import run_in_threadpool

from backend import validation
from backend.constants import DEFAULT_LANGUAGE, TIMEZONE_QUERY_MAX_LENGTH
from backend.dependencies import Principal, get_principal
from backend.schemas import MetaResponse, TimezonesResponse
from backend.services import build_meta, build_timezones

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("", response_model=MetaResponse)
async def read_meta(
    _: Principal = Depends(get_principal),
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
    _: Principal = Depends(get_principal),
) -> TimezonesResponse:
    """Часовые пояса для выбора в настройках: без `q` — каталог (по поясу на зону, с
    запада на восток), с `q` — найденные города. У каждого — зона, город, страна и
    смещение.

    Сборка каталога и поиск по ~64 тыс. городов — чистый CPU (до десятков мс), поэтому
    они идут в пуле потоков: цикл событий тем временем обслуживает другие запросы."""
    return await run_in_threadpool(build_timezones, validation.validate_language(language), q)
