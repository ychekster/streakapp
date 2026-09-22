"""Зависимости FastAPI (Dependency Injection).

Здесь собрано связывание запроса с инфраструктурой: настройки, сессия БД +
репозиторий (с авто-commit/rollback), текущий пользователь Telegram, выведенный
из проверенной `initData` (с ограничением частоты запросов), его запись в БД,
проверка прав администратора и бот для сообщений из админ-панели.
"""

from __future__ import annotations

from typing import AsyncIterator

from aiogram import Bot
from fastapi import Depends, Header, Request

from tma.backend.auth import InitDataError, TelegramUser, verify_init_data
from tma.backend.config import Settings
from tma.backend.constants import INIT_DATA_AUTH_SCHEME
from tma.backend.database import Database
from tma.backend.errors import ApiError
from tma.backend.models import User
from tma.backend.ratelimit import RateLimiter, retry_after_header
from tma.backend.repository import Repository, utc_now
from tma.backend.services import language_from_telegram


def get_settings(request: Request) -> Settings:
    """Настройки приложения (созданы при старте, лежат в `app.state`)."""
    return request.app.state.settings


def _get_database(request: Request) -> Database:
    """Объект подключения к БД из `app.state`."""
    return request.app.state.database


def _get_rate_limiter(request: Request) -> RateLimiter:
    """Ограничитель частоты запросов из `app.state`."""
    return request.app.state.rate_limiter


def get_bot(request: Request) -> Bot:
    """Бот для сообщений из админ-панели (см. messaging.py), создан при старте API."""
    return request.app.state.bot


async def get_repository(request: Request) -> AsyncIterator[Repository]:
    """Репозиторий поверх сессии запроса с авто-commit при успехе и rollback при ошибке.

    Одна сессия на запрос, изменения фиксируются по завершении обработчика. Подключать
    только через `RepositoryDep` (см. ниже).
    """
    database = _get_database(request)
    async with database.session_factory() as session:
        repository = Repository(session)
        try:
            yield repository
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# Зависимость-репозиторий с областью "function": commit выполняется ДО отправки ответа.
# С областью по умолчанию ("request") FastAPI закрывает зависимость уже после отправки,
# и сбой commit (например, занятая база) остался бы незамеченным: клиент получил бы
# 200 и новое состояние, которого в базе нет. Один и тот же объект во всех местах —
# иначе FastAPI не узнает в них одну зависимость и откроет вторую сессию.
RepositoryDep = Depends(get_repository, scope="function")


def _extract_init_data(authorization: str | None) -> str:
    """Достать строку initData из заголовка `Authorization: tma <initData>`.

    Допускаем и схему `tma <initData>` (рекомендация Telegram), и «голую» строку
    initData — некоторые клиенты присылают её без префикса.
    """
    if not authorization:
        raise ApiError(401, "missing_init_data", "Отсутствует авторизация Telegram")
    prefix = f"{INIT_DATA_AUTH_SCHEME} "
    if authorization.lower().startswith(prefix):
        return authorization[len(prefix):]
    return authorization


async def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
) -> TelegramUser:
    """Текущий пользователь Telegram из проверенной `initData` (иначе 401).

    Сверх лимита частоты запросов (config: TMA_RATE_LIMIT_*) — 429 с Retry-After.
    """
    settings = get_settings(request)
    init_data_raw = _extract_init_data(authorization)
    try:
        user = verify_init_data(
            init_data_raw,
            bot_token=settings.bot_token.get_secret_value(),
            max_age_seconds=settings.auth_ttl_seconds,
        )
    except InitDataError as exc:
        raise ApiError(401, "invalid_init_data", "Не удалось подтвердить личность Telegram") from exc
    retry_after = _get_rate_limiter(request).acquire(user.id)
    if retry_after:
        raise ApiError(
            429,
            "rate_limited",
            "Слишком много запросов, попробуйте чуть позже",
            headers=retry_after_header(retry_after),
        )
    return user


async def get_db_user(
    user: TelegramUser = Depends(get_current_user),
    repo: Repository = RepositoryDep,
) -> User:
    """Запись текущего пользователя в БД; создаётся при первом открытии приложения
    (с языком интерфейса по языку его Telegram). Запрос отмечается как активность
    пользователя (для аналитики), а заблокированному администратором — 403.

    FastAPI кеширует зависимости в пределах запроса, поэтому `repo` здесь — тот же
    репозиторий (и та же сессия), что получает обработчик маршрута.
    """
    db_user = await repo.get_or_create_user(
        user.id,
        user.username,
        user.first_name,
        language=language_from_telegram(user.language_code),
    )
    if db_user.blocked_at is not None:
        raise ApiError(403, "user_blocked", "Доступ к приложению ограничен")
    await repo.touch_user(db_user, utc_now())
    return db_user


async def get_admin_user(
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> User:
    """Текущий пользователь, если он администратор; иначе 403. Нужна каждому /admin/*."""
    if not await repo.is_admin(db_user.telegram_id):
        raise ApiError(403, "admin_required", "Нужны права администратора")
    return db_user
