"""Совместные привычки (backend/groups.py).

    GET  /groups/{group_id}/invite  — ссылка-приглашение
    POST /groups/{group_id}/reset   — новая ссылка, прежняя больше не действует (владелец)
    POST /groups/{group_id}/leave   — выйти: привычка остаётся обычной (по ссылке вернётся)
    POST /groups/{group_id}/kick    — исключить участника (владелец)
    POST /groups/{group_id}/notify  — «Отметки участников»
    GET  /groups/{group_id}/members/{user_id} — страница участника: его привычка по его
         отметкам (сетка, серии, счёт), как обычная
    GET  /groups/{group_id}/members/{user_id}/photo?v=<версия> — фото участника из Telegram
         (JPEG; нет — 404)

Групповой привычку делают через POST /sync (`create` или `update` с `shared`), обычной —
`update` с `"shared": false`, пока в ней никого, кроме него. Только с аккаунтом Telegram (Mini App или веб-приложение со входом через Telegram).
Вступают по ссылке через бота (bot/handlers/group_invite.py). Состояние после действия
приложение берёт из следующего POST /sync.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Query, Request, Response

from backend import groups, photos
from backend.constants import MAX_DB_INT
from backend.dependencies import RepositoryDep, get_db_user
from backend.errors import ApiError
from backend.models import User
from backend.repository import Repository
from backend.routers.auth import bot_username
from backend.schemas import (
    GroupInviteResponse,
    GroupKickRequest,
    GroupMemberHabitResponse,
    GroupNotifyRequest,
)

router = APIRouter(prefix="/groups", tags=["groups"])

_GroupId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор совместной привычки")
_UserId = Path(..., ge=1, le=MAX_DB_INT, description="Telegram id участника")
# Картинка по версии фото (`v`, GroupMember.photo) не меняется — хранить сколько угодно;
# без версии или с прежней — час.
_PHOTO_CACHE_FOREVER = "private, max-age=31536000, immutable"
_PHOTO_CACHE_HOUR = "private, max-age=3600"


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


@router.get("/{group_id}/members/{user_id}", response_model=GroupMemberHabitResponse)
async def member_habit(
    group_id: int = _GroupId,
    user_id: int = _UserId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> GroupMemberHabitResponse:
    """Страница участника: его привычка по его отметкам (любой участник той же привычки)."""
    response = await groups.member_habit(repo, db_user, group_id, user_id)
    await repo.commit()
    return response


@router.get("/{group_id}/members/{user_id}/photo")
async def member_photo(
    request: Request,
    group_id: int = _GroupId,
    user_id: int = _UserId,
    v: str | None = Query(None, max_length=64, description="Версия фото (GroupMember.photo)"),
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Текущее фото участника из Telegram (только участникам той же привычки); нет фото —
    404."""
    owner = await groups.photo_owner(repo, db_user, group_id, user_id)
    current = owner.photo_id
    # Сессия закрывается до запроса в Telegram.
    await repo.commit()
    content = await photos.photo_bytes(request.app.state.bot, owner)
    if content is None:
        raise ApiError(404, "photo_not_found", "Фото нет")
    forever = v is not None and v == current
    return Response(
        content=content,
        media_type="image/jpeg",
        headers={"Cache-Control": _PHOTO_CACHE_FOREVER if forever else _PHOTO_CACHE_HOUR},
    )
