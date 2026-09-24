"""Точка входа API-сервера TMA (FastAPI).

Запуск из корня репозитория:

    python -m tma.backend.main
    # или с автоперезагрузкой при разработке:
    uvicorn tma.backend.main:app --reload --port 8000

Последовательность старта: логирование → настройки → подключение к БД, создание
таблиц и первый администратор → бот для сообщений из админ-панели → middleware
(заголовки и учёт медленных запросов, CORS, предел размера тела) → обработчики ошибок
→ роутеры.
"""

from __future__ import annotations

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

from aiogram import Bot
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from tma.backend.config import Settings, load_settings
from tma.backend.constants import (
    BROADCAST_UPLOAD_MAX_BYTES,
    BROADCAST_UPLOAD_PATH,
    MAX_REQUEST_BODY_BYTES,
    SEED_ADMIN_IDS,
    SLOW_REQUEST_SECONDS,
)
from tma.backend.database import Database
from tma.backend.errors import error_response, register_error_handlers
from tma.backend.middleware import BodySizeLimitMiddleware, ResponseMetaMiddleware
from tma.backend.ratelimit import RateLimiter
from tma.backend.repository import Repository
from tma.backend.routers import admin, meta, reviews, settings as settings_router, tasks
from tma.backend.timezones import warm_up as warm_up_timezones

# Сколько секунд браузер может кешировать ответ на CORS-preflight.
_CORS_MAX_AGE_SECONDS = 600


def setup_logging(settings: Settings) -> None:
    """Логи API в stderr и, если задан TMA_LOG_FILE, в файл с ротацией.

    `diagnose=False` обязателен: иначе loguru печатает в трейсбэке значения всех
    переменных — вместе с токеном бота и чужой initData.
    """
    logger.remove()
    logger.add(sys.stderr, level=settings.log_level, diagnose=False)
    if settings.log_file:
        Path(settings.log_file).parent.mkdir(parents=True, exist_ok=True)
        logger.add(
            settings.log_file,
            level=settings.log_level,
            rotation="10 MB",
            retention="14 days",
            encoding="utf-8",
            enqueue=True,
            diagnose=False,
        )


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Жизненный цикл приложения: поднять подключение к БД и закрыть его при остановке."""
    settings: Settings = load_settings()
    app.state.settings = settings
    app.state.rate_limiter = RateLimiter(
        settings.rate_limit_burst, settings.rate_limit_per_second
    )
    app.state.database = Database(
        settings.database_url,
        pool_size=settings.db_pool_size,
        max_overflow=settings.db_max_overflow,
    )
    await app.state.database.create_tables()
    # Новая база (без миграций) получает первого администратора, как и мигрированная.
    async with app.state.database.session_factory() as session:
        await Repository(session).seed_admins(SEED_ADMIN_IDS)
        await session.commit()
    # Личные сообщения и ответы на отзывы из админ-панели (messaging.py). К сети бот
    # обращается только при отправке.
    app.state.bot = Bot(token=settings.bot_token.get_secret_value())
    # Справочник городов для выбора пояса — сейчас, а не на первом запросе.
    await asyncio.to_thread(warm_up_timezones)
    logger.info("TMA API started (database connected, cities loaded)")
    try:
        yield
    finally:
        await app.state.bot.session.close()
        await app.state.database.dispose()
        logger.info("TMA API stopped (database disposed)")


def create_app() -> FastAPI:
    """Собрать и сконфигурировать FastAPI-приложение."""
    settings = load_settings()
    setup_logging(settings)
    docs = settings.docs_enabled
    app = FastAPI(
        title="StreakBot Mini App API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url="/redoc" if docs else None,
        openapi_url="/openapi.json" if docs else None,
    )

    # Порядок: добавленное последним оборачивает остальное. Снаружи — заголовки и учёт
    # времени (видят каждый ответ), затем CORS (и ответ 413 получает CORS-заголовки),
    # внутри — предел размера тела.
    app.add_middleware(
        BodySizeLimitMiddleware,
        max_bytes=MAX_REQUEST_BODY_BYTES,
        path_limits={BROADCAST_UPLOAD_PATH: BROADCAST_UPLOAD_MAX_BYTES},
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=_CORS_MAX_AGE_SECONDS,
    )
    app.add_middleware(ResponseMetaMiddleware, slow_seconds=SLOW_REQUEST_SECONDS)

    register_error_handlers(app)
    app.include_router(tasks.router)
    app.include_router(settings_router.router)
    app.include_router(meta.router)
    app.include_router(reviews.router)
    app.include_router(admin.router)

    @app.get("/health", tags=["meta"], response_model=None)
    async def health(request: Request) -> dict[str, str] | JSONResponse:
        """Проверка живости сервиса и доступности БД (для мониторинга/проксей)."""
        try:
            await request.app.state.database.ping()
        except Exception as exc:  # noqa: BLE001 — любая ошибка БД = сервис не готов
            logger.warning("Health check failed: database unavailable ({})", exc)
            return error_response(503, "database_unavailable", "База данных недоступна")
        return {"status": "ok"}

    return app


app = create_app()


def run() -> None:
    """Запустить uvicorn с хостом и портом из настроек."""
    import uvicorn

    settings = load_settings()
    uvicorn.run(app, host=settings.host, port=settings.port, server_header=False)


if __name__ == "__main__":
    run()
