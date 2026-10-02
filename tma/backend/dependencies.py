"""Зависимости FastAPI (Dependency Injection).

Здесь собрано связывание запроса с инфраструктурой: настройки, сессия БД +
репозиторий (с авто-commit/rollback), текущий пользователь — из проверенной `initData`
Telegram или из сессии веб-приложения (с ограничением частоты запросов), его запись в
БД, проверка прав администратора и бот для сообщений из админ-панели.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import AsyncIterator

from aiogram import Bot
from fastapi import Depends, Header, Request

from tma.backend.accounts import resolve_session
from tma.backend.auth import InitDataError, TelegramUser, verify_init_data
from tma.backend.config import Settings
from tma.backend.constants import INIT_DATA_AUTH_SCHEME, WEB_SESSION_AUTH_SCHEME
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


def _bearer_token(authorization: str | None) -> str | None:
    """The web session token from `Authorization: Bearer <token>`; None — another scheme."""
    prefix = f"{WEB_SESSION_AUTH_SCHEME} "
    if authorization and authorization.lower().startswith(prefix):
        return authorization[len(prefix):].strip()
    return None


def _rate_limit(request: Request, user_id: int) -> None:
    """Сверх лимита частоты запросов (config: TMA_RATE_LIMIT_*) — 429 с Retry-After."""
    retry_after = _get_rate_limiter(request).acquire(user_id)
    if retry_after:
        raise ApiError(
            429,
            "rate_limited",
            "Слишком много запросов, попробуйте чуть позже",
            headers=retry_after_header(retry_after),
        )


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
    _rate_limit(request, user.id)
    return user


@dataclass(frozen=True)
class Principal:
    """Who is calling: a Telegram Mini App user (`telegram`) or a web app session
    (`session_token`). `user_id` is the account id in both cases."""

    user_id: int
    telegram: TelegramUser | None = None
    session_token: str | None = None


async def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    repo: Repository = RepositoryDep,
) -> Principal:
    """The caller: `Authorization: tma <initData>` (Mini App, as before) or
    `Authorization: Bearer <token>` (installed web app). Invalid — 401."""
    token = _bearer_token(authorization)
    if token is None:
        telegram = await get_current_user(request, authorization)
        return Principal(user_id=telegram.id, telegram=telegram)
    session = await resolve_session(repo, get_settings(request), token)
    if session is None:
        raise ApiError(401, "invalid_session", "Сессия устарела — войдите снова")
    _rate_limit(request, session.user_id)
    return Principal(user_id=session.user_id, session_token=token)


async def get_optional_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    repo: Repository = RepositoryDep,
) -> Principal | None:
    """Like get_principal, but no (or an expired) authorization is not an error."""
    if not authorization:
        return None
    try:
        return await get_principal(request, authorization, repo)
    except ApiError as exc:
        if exc.status_code == 401:
            return None
        raise


async def get_db_user(
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> User:
    """Запись текущего пользователя в БД. Пользователь Telegram создаётся при первом
    открытии приложения (с языком интерфейса по языку его Telegram); аккаунт веб-сессии
    уже есть (его создал вход). Запрос отмечается как активность пользователя (для
    аналитики), а заблокированному администратором — 403.

    FastAPI кеширует зависимости в пределах запроса, поэтому `repo` здесь — тот же
    репозиторий (и та же сессия), что получает обработчик маршрута.
    """
    if principal.telegram is not None:
        user = principal.telegram
        db_user = await repo.get_or_create_user(
            user.id,
            user.username,
            user.first_name,
            language=language_from_telegram(user.language_code),
        )
    else:
        found = await repo.get_user(principal.user_id)
        if found is None:
            raise ApiError(401, "invalid_session", "Сессия устарела — войдите снова")
        db_user = found
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
