"""Эндпоинты настроек пользователя.

    GET /settings — текущие настройки (время уведомлений, часовой пояс)
    PUT /settings — обновить настройки (частично)

Те же настройки, что задаются через /settings бота (кроме привычек). Доступ к
данным — только через репозиторий бота; правила валидации совпадают с ботом.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from bot.database.repository import Repository
from tma.backend.auth import TelegramUser
from tma.backend.dependencies import get_current_user, get_repository
from tma.backend.errors import ApiError
from tma.backend.schemas import SettingsResponse, SettingsUpdate
from tma.backend.services import serialize_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def read_settings(
    user: TelegramUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> SettingsResponse:
    """Вернуть текущие настройки пользователя."""
    db_user = await repo.get_user(user.id)
    if db_user is None:
        raise ApiError(404, "user_not_found", "Пользователь не найден")
    return serialize_settings(db_user)


@router.put("", response_model=SettingsResponse)
async def write_settings(
    payload: SettingsUpdate,
    user: TelegramUser = Depends(get_current_user),
    repo: Repository = Depends(get_repository),
) -> SettingsResponse:
    """Обновить настройки (передаются только меняемые поля) и вернуть актуальные."""
    db_user = await repo.get_user(user.id)
    if db_user is None:
        raise ApiError(404, "user_not_found", "Пользователь не найден")
    return await update_settings(repo, db_user, payload)
