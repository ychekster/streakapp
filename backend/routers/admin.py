"""Эндпоинты админ-панели. Каждый требует прав администратора (зависимость роутера
`get_admin_user`: пользователь из проверенной `initData` есть в таблице `admins`, иначе
403 `admin_required`).

    GET    /admin/analytics/{section}?period=&platform=&source=&basis=&compare=
                                             — раздел аналитики: summary, funnel, retention,
                                               churn, habits, sources, messaging
    POST   /admin/segments                   — люди за цифрой аналитики (группа)
    GET    /admin/segments/{id}              — группа: название и сколько людей
    GET    /admin/analytics-config           — пороги активации, данные для ссылок с меткой
    PUT    /admin/analytics-config           — изменить пороги активации
    GET    /admin/funnel?since=&until=       — web app funnel (landing → install → habit)
    GET    /admin/users?q=&filter=&cursor=&limit= — пользователи (поиск, фильтр, страницы)
    GET    /admin/users/count?q=&filter=     — сколько пользователей под поиском и фильтром
    GET    /admin/users/{id}                 — профиль пользователя с его отзывами
    GET    /admin/users/{id}/habits          — его привычки (как он видит их сам)
    GET    /admin/users/{id}/timeline?offset= — лента действий, новые сначала
    PUT    /admin/users/{id}/block           — заблокировать / разблокировать
    PUT    /admin/users/{id}/test            — тестовый аккаунт (не входит в аналитику)
    DELETE /admin/users/{id}                 — удалить со всеми данными
    POST   /admin/users/{id}/message         — личное сообщение от бота
    GET    /admin/reviews?cursor=&limit=     — отзывы всех пользователей (страницы)
    GET    /admin/reviews/{id}               — отзыв
    POST   /admin/reviews/{id}/reply         — ответить на отзыв сообщением бота
    GET    /admin/admins                     — администраторы
    POST   /admin/admins                     — добавить администратора по id Telegram
    DELETE /admin/admins/{id}                — убрать администратора (не себя)
    GET    /admin/broadcasts/recipients?audience= — сколько получателей у фильтра
    POST   /admin/broadcasts                 — рассылка (multipart: audience, text, button,
                                               media)
    GET    /admin/broadcasts/{id}            — ход рассылки

Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from aiogram import Bot
from fastapi import APIRouter, Depends, Path, Query, Request, Response
from starlette.datastructures import UploadFile

from datetime import date, timedelta

from backend import admin as service
from backend.analytics import service as analytics
from backend.analytics.profile import timeline
from backend.funnel import funnel_report
from backend.constants import (
    ADMIN_PAGE_SIZE,
    ADMIN_PAGE_SIZE_MAX,
    ADMIN_SEARCH_MAX_LENGTH,
    AUDIENCE_MAX_LENGTH,
    DEFAULT_ANALYTICS_PERIOD,
    MAX_DB_INT,
)
from backend.dependencies import RepositoryDep, get_admin_user, get_bot, get_settings
from backend.routers.auth import bot_username
from backend.errors import ApiError
from backend.models import User
from backend.repository import Repository, utc_now
from backend.schemas import (
    AdminBlockUpdate,
    AdminCreate,
    AdminMessage,
    AdminReviewResponse,
    AdminReviewsPage,
    AdminsResponse,
    AdminTestUpdate,
    AdminUserHabits,
    AdminUserResponse,
    AdminUsersCount,
    AdminUsersPage,
    AnalyticsChurnResponse,
    AnalyticsConfig,
    AnalyticsConfigUpdate,
    AnalyticsFunnelResponse,
    AnalyticsHabitsResponse,
    AnalyticsMessagingResponse,
    AnalyticsRetentionResponse,
    AnalyticsSourcesResponse,
    AnalyticsSummary,
    BroadcastRecipients,
    BroadcastResponse,
    DeliveryResponse,
    FunnelResponse,
    ReviewReplyResponse,
    SegmentCreate,
    SegmentInfo,
    TimelinePage,
)

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin_user)])

# Идентификаторы в пути. Верхняя граница — предел целого в колонке базы: без неё число
# длиннее 64 бит доходило бы до запроса и падало ошибкой драйвера (500) вместо понятного
# ответа о некорректном параметре.
# Web-only accounts have negative ids (see models.User), hence the lower bound.
_TelegramId = Path(..., ge=-MAX_DB_INT, le=MAX_DB_INT, description="id пользователя")
_ReviewId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор отзыва")
_BroadcastId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор рассылки")
_SegmentId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор группы")
_PageSize = Query(ADMIN_PAGE_SIZE, ge=1, le=ADMIN_PAGE_SIZE_MAX)
_Cursor = Query(None, max_length=32, description="Курсор страницы из прошлого ответа")
_Search = Query(None, max_length=ADMIN_SEARCH_MAX_LENGTH, description="Имя, @username или id")
_FILTER_DESCRIPTION = "Фильтр «признак:значение» через запятую (audience.py)"
# Параметр запроса привязывается к имени первого аргумента, который его использует: у
# фильтра рассылки имя другое («audience»), поэтому и объект Query — свой.
_Filter = Query(None, max_length=AUDIENCE_MAX_LENGTH, description=_FILTER_DESCRIPTION)
_Audience = Query(None, max_length=AUDIENCE_MAX_LENGTH, description=_FILTER_DESCRIPTION)


# Разделы аналитики (схемы ответа — Analytics* в schemas.py).
_SECTIONS = ("summary", "funnel", "retention", "churn", "habits", "sources", "messaging")
_SectionResponse = (
    AnalyticsSummary
    | AnalyticsFunnelResponse
    | AnalyticsRetentionResponse
    | AnalyticsChurnResponse
    | AnalyticsHabitsResponse
    | AnalyticsSourcesResponse
    | AnalyticsMessagingResponse
)


@router.get("/analytics/{section}", response_model=_SectionResponse)
async def read_analytics(
    section: str = Path(..., max_length=16, description="Раздел: " + ", ".join(_SECTIONS)),
    period: str = Query(DEFAULT_ANALYTICS_PERIOD, max_length=8, description="today, 7, 30, 90, all"),
    platform: str | None = Query(None, max_length=16, description="telegram или web"),
    source: str | None = Query(None, max_length=32, description="Источник; direct — без метки"),
    basis: str | None = Query(None, max_length=16, description="Удержание: open или checkin"),
    compare: str | None = Query(None, max_length=16, description="Кривая: none, platform, source"),
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> object:
    """Раздел аналитики за период (дни — по Алматы, сегодня включительно) под фильтром
    платформы и источника. Администраторы и тестовые аккаунты не считаются."""
    if section not in _SECTIONS:
        raise ApiError(404, "not_found", "Нет такого раздела аналитики")
    return await analytics.section(
        repo,
        section,
        now=utc_now(),
        period=period,
        platform=platform,
        source=source,
        basis=basis,
        compare=compare,
        language=admin.language,
    )


@router.post("/segments", response_model=SegmentInfo, status_code=201)
async def create_segment(
    payload: SegmentCreate,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> SegmentInfo:
    """Люди за цифрой аналитики — группой: её показывает список пользователей с фильтром
    «segment:<id>», ей же можно сделать рассылку."""
    return await analytics.create_segment(repo, admin, payload, utc_now())


@router.get("/segments/{segment_id}", response_model=SegmentInfo)
async def read_segment(
    segment_id: int = _SegmentId, repo: Repository = RepositoryDep
) -> SegmentInfo:
    return await analytics.get_segment(repo, segment_id)


@router.get("/analytics-config", response_model=AnalyticsConfig)
async def read_analytics_config(
    request: Request, repo: Repository = RepositoryDep
) -> AnalyticsConfig:
    """Пороги активации и то, из чего собираются ссылки с меткой (бот, адрес веб-версии)."""
    try:
        username: str | None = await bot_username(request)
    except ApiError:
        username = None
    return await analytics.read_config(
        repo, username or None, get_settings(request).web_base_url, utc_now()
    )


@router.put("/analytics-config", response_model=AnalyticsConfig)
async def write_analytics_config(
    payload: AnalyticsConfigUpdate, request: Request, repo: Repository = RepositoryDep
) -> AnalyticsConfig:
    """Изменить пороги активации («в первые N дней отметил хотя бы в M разных дней»)."""
    await analytics.update_config(repo, payload)
    return await read_analytics_config(request, repo)


# Longest funnel period, days.
_FUNNEL_MAX_DAYS = 366


@router.get("/funnel", response_model=FunnelResponse)
async def read_funnel(
    since: date | None = Query(None, description="First day (UTC); default — 30 days ago"),
    until: date | None = Query(None, description="Last day (UTC), inclusive; default — today"),
    repo: Repository = RepositoryDep,
) -> FunnelResponse:
    """Web app funnel: each step's count in total, by platform and by install source."""
    last = until or utc_now().date()
    first = since or last - timedelta(days=29)
    if first > last or (last - first).days >= _FUNNEL_MAX_DAYS:
        raise ApiError(422, "invalid_period", "Некорректный период")
    return await funnel_report(repo, first, last)


# --------------------------------------------------------------------------- #
#  Пользователи
# --------------------------------------------------------------------------- #


@router.get("/users", response_model=AdminUsersPage)
async def read_users(
    q: str | None = _Search,
    filter: str | None = _Filter,  # noqa: A002 — имя параметра запроса
    cursor: str | None = _Cursor,
    limit: int = _PageSize,
    repo: Repository = RepositoryDep,
) -> AdminUsersPage:
    """Пользователи, новые сначала; `next_cursor` ответа — для следующей страницы."""
    return await service.list_users(repo, q, filter, cursor, limit)


# Объявлен раньше /users/{telegram_id}: иначе «count» разбирался бы как id.
@router.get("/users/count", response_model=AdminUsersCount)
async def count_users(
    q: str | None = _Search,
    filter: str | None = _Filter,  # noqa: A002 — имя параметра запроса
    repo: Repository = RepositoryDep,
) -> AdminUsersCount:
    """Сколько пользователей под поиском и фильтром (фильтр ещё настраивается)."""
    return await service.count_users(repo, q, filter)


@router.get("/users/{telegram_id}", response_model=AdminUserResponse)
async def read_user(
    telegram_id: int = _TelegramId,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminUserResponse:
    """Профиль пользователя с его отзывами (пояс — на языке администратора)."""
    profile = await service.user_profile(repo, telegram_id, admin.language)
    return AdminUserResponse(user=profile)


@router.get("/users/{telegram_id}/habits", response_model=AdminUserHabits)
async def read_user_habits(
    telegram_id: int = _TelegramId,
    repo: Repository = RepositoryDep,
) -> AdminUserHabits:
    """Привычки пользователя — те же данные, что отдаёт ему `GET /tasks`: история,
    серии и день отметки считаются в его поясе. Только чтение."""
    return await service.user_habits(repo, telegram_id)


@router.get("/users/{telegram_id}/timeline", response_model=TimelinePage)
async def read_user_timeline(
    telegram_id: int = _TelegramId,
    offset: int = Query(0, ge=0, le=1_000_000),
    repo: Repository = RepositoryDep,
) -> TimelinePage:
    """Лента действий пользователя, новые сначала (страницами)."""
    user = await repo.get_user(telegram_id)
    if user is None:
        raise ApiError(404, "user_not_found", "Пользователь не найден")
    return await timeline(repo, user, offset)


@router.put("/users/{telegram_id}/test", response_model=AdminUserResponse)
async def mark_test_user(
    payload: AdminTestUpdate,
    telegram_id: int = _TelegramId,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> AdminUserResponse:
    """Отметить тестовый аккаунт: он не входит в аналитику."""
    return AdminUserResponse(
        user=await service.set_user_test(repo, telegram_id, payload.is_test, admin.language)
    )


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
    review_id: int = _ReviewId, repo: Repository = RepositoryDep
) -> AdminReviewResponse:
    return AdminReviewResponse(review=await service.get_review(repo, review_id))


@router.post("/reviews/{review_id}/reply", response_model=ReviewReplyResponse)
async def reply_to_review(
    payload: AdminMessage,
    review_id: int = _ReviewId,
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


@router.get("/broadcasts/recipients", response_model=BroadcastRecipients)
async def read_recipients(
    audience: str | None = _Audience,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
) -> BroadcastRecipients:
    """Сколько получателей у рассылки с фильтром `audience` сейчас."""
    return await service.broadcast_recipients(repo, admin, audience)


@router.post("/broadcasts", response_model=BroadcastResponse, status_code=201)
async def create_broadcast(
    request: Request,
    admin: User = Depends(get_admin_user),
    repo: Repository = RepositoryDep,
    bot: Bot = Depends(get_bot),
) -> BroadcastResponse:
    """Рассылка: форма multipart с полями `audience` (фильтр получателей, пустой — все),
    `text`, `button` (кнопка под сообщением, пустое — без неё) и необязательным файлом
    `media` (фото или видео). Копия приходит автору сразу, остальным — от бота.

    Форма разбирается здесь, уже после проверки прав, а не объявленными параметрами
    `Form`/`File`: их FastAPI читает до зависимостей, и анонимный запрос успевал бы
    загрузить файл до 50 МБ (путь рассылки — единственный с таким пределом тела).
    """
    async with request.form(max_files=1, max_fields=4) as form:
        media = form.get("media")
        if media is not None and not isinstance(media, UploadFile):
            raise ApiError(422, "invalid_media", "Поле media — файл")
        broadcast = await service.create_broadcast(
            repo,
            bot,
            admin,
            audience=str(form.get("audience") or ""),
            text=str(form.get("text") or ""),
            button=str(form.get("button") or ""),
            media=media,
            tma_url=get_settings(request).tma_url,
        )
    return BroadcastResponse(broadcast=broadcast)


@router.get("/broadcasts/{broadcast_id}", response_model=BroadcastResponse)
async def read_broadcast(
    broadcast_id: int = _BroadcastId, repo: Repository = RepositoryDep
) -> BroadcastResponse:
    return BroadcastResponse(broadcast=await service.get_broadcast(repo, broadcast_id))
