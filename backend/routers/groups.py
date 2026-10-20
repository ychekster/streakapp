"""Совместные привычки (backend/groups.py).

    GET  /groups/{group_id}/invite  — ссылка-приглашение
    POST /groups/{group_id}/reset   — новая ссылка, прежняя больше не действует (владелец)
    POST /groups/{group_id}/leave   — выйти: привычка пропадает (вернётся по ссылке)
    POST /groups/{group_id}/kick    — исключить участника (владелец)
    POST /groups/{group_id}/notify  — «Отметки участников»

Совместную привычку создают через POST /sync (`create` с `shared`); обычную совместной
не сделать. Только с аккаунтом Telegram (Mini App или веб-приложение со входом через Telegram).
Вступают по ссылке через бота (bot/handlers/group_invite.py). Состояние после действия
приложение берёт из следующего POST /sync.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Request, Response

from backend import groups
from backend.constants import MAX_DB_INT
from backend.dependencies import RepositoryDep, get_db_user
from backend.models import User
from backend.repository import Repository
from backend.routers.auth import bot_username
from backend.schemas import (
    GroupInviteResponse,
    GroupKickRequest,
    GroupNotifyRequest,
)

router = APIRouter(prefix="/groups", tags=["groups"])

_GroupId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор совместной привычки")


async def _invite_response(request: Request, group) -> GroupInviteResponse:  # type: ignore[no-untyped-def]
    return GroupInviteResponse(
        group_id=group.id, invite_url=groups.invite_url(await bot_username(request), group)
    )


@router.get("/{group_id}/invite", response_model=GroupInviteResponse)
async def invite(
    request: Request,
    group_id: int = _GroupId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> GroupInviteResponse:
    """Ссылка-приглашение совместной привычки (любой участник)."""
    group = await groups.invite_of(repo, db_user, group_id)
    await repo.commit()
    return await _invite_response(request, group)


@router.post("/{group_id}/reset", response_model=GroupInviteResponse)
async def reset(
    request: Request,
    group_id: int = _GroupId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> GroupInviteResponse:
    """Сбросить ссылку (владелец): прежняя больше не действует."""
    group = await groups.reset_invite(repo, db_user, group_id)
    await repo.commit()
    return await _invite_response(request, group)


@router.post("/{group_id}/leave", status_code=204)
async def leave(
    group_id: int = _GroupId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Выйти из совместной привычки."""
    await groups.leave(repo, db_user, group_id)
    return Response(status_code=204)


@router.post("/{group_id}/kick", status_code=204)
async def kick(
    payload: GroupKickRequest,
    group_id: int = _GroupId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Исключить участника (только владелец)."""
    await groups.kick(repo, db_user, group_id, payload.user_id)
    return Response(status_code=204)


@router.post("/{group_id}/notify", status_code=204)
async def notify(
    payload: GroupNotifyRequest,
    group_id: int = _GroupId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Включить или выключить «Отметки участников»."""
    await groups.set_notify(repo, db_user, group_id, payload.on)
    return Response(status_code=204)
