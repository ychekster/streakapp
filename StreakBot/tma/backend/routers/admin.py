"""Эндпоинты админ-панели. Каждый требует прав администратора (зависимость роутера
`get_admin_user`: пользователь из проверенной `initData` есть в таблице `admins`, иначе
403 `admin_required`).

    GET    /admin/analytics?days=30          — аналитика: пользователи, активность, привычки
    GET    /admin/users?q=&cursor=&limit=    — пользователи (поиск, страницы)
    GET    /admin/users/{id}                 — профиль пользователя с его отзывами
    PUT    /admin/users/{id}/block           — заблокировать / разблокировать
    DELETE /admin/users/{id}                 — удалить со всеми данными
    POST   /admin/users/{id}/message         — личное сообщение от бота
    GET    /admin/reviews?cursor=&limit=     — отзывы всех пользователей (страницы)
    GET    /admin/reviews/{id}               — отзыв
    POST   /admin/reviews/{id}/reply         — ответить на отзыв сообщением бота
    GET    /admin/admins                     — администраторы
    POST   /admin/admins                     — добавить администратора по id Telegram
    DELETE /admin/admins/{id}                — убрать администратора (не себя)
    GET    /admin/broadcasts/segments        — сегменты рассылки с числом получателей
    POST   /admin/broadcasts                 — рассылка (multipart: segment, text, media)
    GET    /admin/broadcasts/{id}            — ход рассылки

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from aiogram import Bot
from fastapi import APIRouter, Depends, Path, Query, Request, Response
from starlette.datastructures import UploadFile

from tma.backend import admin as service
from tma.backend.analytics import build_analytics
from tma.backend.constants import (
    ADMIN_PAGE_SIZE,
    ADMIN_PAGE_SIZE_MAX,
    ADMIN_SEARCH_MAX_LENGTH,
    ANALYTICS_PERIODS,
    DEFAULT_ANALYTICS_PERIOD,
)
from tma.backend.dependencies import RepositoryDep, get_admin_user, get_bot
from tma.backend.errors import ApiError
from tma.backend.models import User
from tma.backend.repository import Repository, utc_now
from tma.backend.schemas import (
    AdminBlockUpdate,
    AdminCreate,
    AdminMessage,
    AdminReviewResponse,
    AdminReviewsPage,
    AdminsResponse,
    AdminUserResponse,
    AdminUsersPage,
    AnalyticsResponse,
    BroadcastResponse,
    BroadcastSegmentsResponse,
    DeliveryResponse,
    ReviewReplyResponse,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

_TelegramId = Path(..., ge=1, description="id Telegram пользователя")
_PageSize = Query(ADMIN_PAGE_SIZE, ge=1, le=ADMIN_PAGE_SIZE_MAX)
_Cursor = Query(None, max_length=32, description="Курсор страницы из прошлого ответа")


@router.get("/analytics", response_model=AnalyticsResponse)
async def read_analytics(
    days: int = Query(DEFAULT_ANALYTICS_PERIOD, description="Период графиков, дней: 7, 30, 90"),
    repo: Repository = RepositoryDep,
) -> AnalyticsResponse:
    """Аналитика за период (дни — по UTC, сегодня включительно)."""
    if days not in ANALYTICS_PERIODS:
        raise ApiError(422, "invalid_period", "Период — 7, 30 или 90 дней")
    return await build_analytics(repo, days, utc_now())


# --------------------------------------------------------------------------- #
#  Пользователи
# --------------------------------------------------------------------------- #


@router.get("/users", response_model=AdminUsersPage)
async def read_users(
    q: str | None = Query(
        None, max_length=ADMIN_SEARCH_MAX_LENGTH, description="Имя, @username или id"
    ),
    cursor: str | None = _Cursor,
    limit: int = _PageSize,
    repo: Repository = RepositoryDep,
) -> AdminUsersPage:
    """Пользователи, новые сначала; `next_cursor` ответа — для следующей страницы."""
    return await service.list_users(repo, q, cursor, limit)


@router.get("/users/{telegram_id}", response_model=AdminUserResponse)
async def read_user(
    telegram_id: int = _TelegramId,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminUserResponse:
    """Профиль пользователя с его отзывами (пояс — на языке администратора)."""
    profile = await service.user_profile(repo, telegram_id, admin.language)
    return AdminUserResponse(user=profile)


@router.put("/users/{telegram_id}/block", response_model=AdminUserResponse)
async def block_user(
    payload: AdminBlockUpdate,
    telegram_id: int = _TelegramId,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminUserResponse:
    """Заблокировать (`blocked: true`) или разблокировать пользователя. Администратора —
    нельзя (409 `user_is_admin`)."""
    return AdminUserResponse(
        user=await service.set_user_blocked(repo, telegram_id, payload.blocked, admin.language)
    )


@router.delete("/users/{telegram_id}", status_code=204, response_class=Response)
async def delete_user(
    telegram_id: int = _TelegramId, repo: Repository = RepositoryDep
) -> Response:
    """Удалить пользователя со всеми его данными. Администратора — нельзя."""
    await service.delete_user(repo, telegram_id)
    return Response(status_code=204)


@router.post("/users/{telegram_id}/message", response_model=DeliveryResponse)
async def message_user(
    payload: AdminMessage,
    telegram_id: int = _TelegramId,
    repo: Repository = RepositoryDep,
    bot: Bot = Depends(get_bot),
) -> DeliveryResponse:
    """Личное сообщение от бота. Заблокировал бота — `delivered: false`."""
    return await service.message_user(repo, bot, telegram_id, payload.text)


# --------------------------------------------------------------------------- #
#  Отзывы
# --------------------------------------------------------------------------- #


@router.get("/reviews", response_model=AdminReviewsPage)
async def read_reviews(
    cursor: str | None = _Cursor,
    limit: int = _PageSize,
    repo: Repository = RepositoryDep,
) -> AdminReviewsPage:
    """Отзывы всех пользователей, новые сначала."""
    return await service.list_reviews(repo, cursor, limit)


@router.get("/reviews/{review_id}", response_model=AdminReviewResponse)
async def read_review(
    review_id: int = Path(..., ge=1), repo: Repository = RepositoryDep
) -> AdminReviewResponse:
    return AdminReviewResponse(review=await service.get_review(repo, review_id))


@router.post("/reviews/{review_id}/reply", response_model=ReviewReplyResponse)
async def reply_to_review(
    payload: AdminMessage,
    review_id: int = Path(..., ge=1),
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
    bot: Bot = Depends(get_bot),
) -> ReviewReplyResponse:
    """Ответить на отзыв: сообщение от бота с цитатой отзыва."""
    return await service.reply_to_review(repo, bot, admin, review_id, payload.text)


# --------------------------------------------------------------------------- #
#  Администраторы
# --------------------------------------------------------------------------- #


@router.get("/admins", response_model=AdminsResponse)
async def read_admins(
    admin: User = Depends(get_admin_user), repo: Repository = RepositoryDep
) -> AdminsResponse:
    return await service.list_admins(repo, admin)


@router.post("/admins", response_model=AdminsResponse, status_code=201)
async def create_admin(
    payload: AdminCreate,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminsResponse:
    """Добавить администратора; ответ — обновлённый список."""
    return await service.add_admin(repo, admin, payload.telegram_id)


@router.delete("/admins/{telegram_id}", response_model=AdminsResponse)
async def delete_admin(
    telegram_id: int = _TelegramId,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminsResponse:
    """Убрать администратора (себя — нельзя); ответ — обновлённый список."""
    return await service.remove_admin(repo, admin, telegram_id)


# --------------------------------------------------------------------------- #
#  Рассылки
# --------------------------------------------------------------------------- #


@router.get("/broadcasts/segments", response_model=BroadcastSegmentsResponse)
async def read_segments(
    admin: User = Depends(get_admin_user), repo: Repository = RepositoryDep
) -> BroadcastSegmentsResponse:
    return await service.broadcast_segments(repo, admin)


@router.post("/broadcasts", response_model=BroadcastResponse, status_code=201)
async def create_broadcast(
    request: Request,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
    bot: Bot = Depends(get_bot),
) -> BroadcastResponse:
    """Рассылка: форма multipart с полями `segment`, `text` и необязательным файлом
    `media` (фото или видео). Копия приходит автору сразу, остальным — от бота.

    Форма разбирается здесь, уже после проверки прав, а не объявленными параметрами
    `Form`/`File`: их FastAPI читает до зависимостей, и анонимный запрос успевал бы
    загрузить файл до 50 МБ (путь рассылки — единственный с таким пределом тела).
    """
    async with request.form(max_files=1, max_fields=3) as form:
        media = form.get("media")
        if media is not None and not isinstance(media, UploadFile):
            raise ApiError(422, "invalid_media", "Поле media — файл")
        broadcast = await service.create_broadcast(
            repo,
            bot,
            admin,
            segment=str(form.get("segment") or ""),
            text=str(form.get("text") or ""),
            media=media,
        )
    return BroadcastResponse(broadcast=broadcast)


@router.get("/broadcasts/{broadcast_id}", response_model=BroadcastResponse)
async def read_broadcast(
    broadcast_id: int = Path(..., ge=1), repo: Repository = RepositoryDep
) -> BroadcastResponse:
    return BroadcastResponse(broadcast=await service.get_broadcast(repo, broadcast_id))
