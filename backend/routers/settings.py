"""Эндпоинты настроек пользователя.

    GET /settings — текущие настройки (пояс, язык, тема, «Отмечать за вчера») и
                    признак администратора (вход в админ-панель)
    PUT /settings — обновить настройки (частично)

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.dependencies import Principal, RepositoryDep, get_db_user, get_principal
from backend.models import User
from backend.repository import Repository
from backend.schemas import SettingsResponse, SettingsUpdate
from backend.services import read_settings as build_settings, update_settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=SettingsResponse)
async def read_settings(
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> SettingsResponse:
    """Вернуть текущие настройки пользователя."""
    return await build_settings(repo, db_user, via_telegram=principal.telegram is not None)


@router.put("", response_model=SettingsResponse)
async def write_settings(
    payload: SettingsUpdate,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> SettingsResponse:
    """Обновить настройки (передаются только меняемые поля) и вернуть актуальные."""
    await update_settings(repo, db_user, payload)
    return await build_settings(repo, db_user, via_telegram=principal.telegram is not None)
