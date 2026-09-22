"""Эндпоинты настроек пользователя.

    GET /settings — текущие настройки (пояс, язык, тема, «Отмечать за вчера»)
    PUT /settings — обновить настройки (частично)

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from tma.backend.dependencies import RepositoryDep, get_db_user
from tma.backend.models import User
from tma.backend.repository import Repository
from tma.backend.schemas import SettingsResponse, SettingsUpdate
from tma.backend.services import serialize_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def read_settings(db_user: User = Depends(get_db_user)) -> SettingsResponse:
    """Вернуть текущие настройки пользователя."""
    return serialize_settings(db_user)


@router.put("", response_model=SettingsResponse)
async def write_settings(
    payload: SettingsUpdate,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> SettingsResponse:
    """Обновить настройки (передаются только меняемые поля) и вернуть актуальные."""
    return await update_settings(repo, db_user, payload)
