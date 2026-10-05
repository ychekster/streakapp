"""Синхронизация с устройством.

    POST /sync — применить изменения, сделанные на устройстве, и вернуть актуальное
                 состояние: привычки, настройки и день отметки

Приложение (и Mini App, и веб-приложение) меняет привычки и настройки сразу у себя —
без ожидания сервера и без связи, — копит изменения и отправляет их сюда пачкой (см.
frontend/src/data/). Пустая пачка — просто загрузка состояния при запуске. Операции
применяются по порядку, каждая отдельно (services.apply_sync); итог каждой — в ответе.
"""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from backend.dependencies import Principal, RepositoryDep, get_db_user, get_principal
from backend.models import User
from backend.repository import Repository
from backend.routers.tasks import record_checkin, record_first_habit
from backend.schemas import SyncRequest, SyncResponse
from backend.services import apply_sync, list_habits, read_settings, user_today

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync(
    payload: SyncRequest,
    request: Request,
    background: BackgroundTasks,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> SyncResponse:
    """Применить операции устройства и вернуть состояние после них."""
    outcome = await apply_sync(repo, db_user, payload.ops)
    if outcome.first_habit:
        await record_first_habit(request, repo, db_user, principal)
    if outcome.checked_in:
        await record_checkin(request, background, repo, db_user, principal)
    return SyncResponse(
        results=outcome.results,
        habits=await list_habits(repo, db_user),
        settings=await read_settings(repo, db_user),
        today=user_today(db_user),
    )
