"""Логика админ-панели поверх репозитория: пользователи, отзывы, администраторы и
рассылки (аналитика — в analytics.py).

Правила, общие для всех действий:
- администратора нельзя заблокировать или удалить — сначала у него забирают права;
- себя нельзя убрать из администраторов — это делает другой администратор (так в
  списке всегда остаётся хотя бы один);
- личные сообщения и ответы на отзывы отправляются сразу (messaging.py); если
  пользователь заблокировал бота, это отмечается в базе и возвращается как «не
  доставлено», а не ошибкой;
- рассылку API только ставит в очередь (копия — автору, по ней медиа загружается в
  Telegram), а рассылает бот (bot/broadcasts.py).
"""

from __future__ import annotations

from aiogram import Bot
from starlette.datastructures import UploadFile

from tma.backend import messaging, validation
from tma.backend.constants import (
    BROADCAST_PHOTO_MAX_BYTES,
    BROADCAST_PHOTO_TYPES,
    BROADCAST_SEGMENTS,
    BROADCAST_VIDEO_MAX_BYTES,
    BROADCAST_VIDEO_TYPES,
    CAPTION_MAX_LENGTH,
    MESSAGE_MAX_LENGTH,
)
from tma.backend.errors import ApiError
from tma.backend.models import Broadcast, Review, User
from tma.backend.repository import Repository, utc_now
from tma.backend.schemas import (
    AdminEntry,
    AdminReview,
    AdminReviewsPage,
    AdminsResponse,
    AdminUserProfile,
    AdminUserRef,
    AdminUsersPage,
    AdminUserSummary,
    BroadcastInfo,
    BroadcastSegment,
    BroadcastSegmentsResponse,
    DeliveryResponse,
    ReviewReplyResponse,
)
from tma.backend.timezones import selected_city, timezone_display


# --------------------------------------------------------------------------- #
#  Сериализация
# --------------------------------------------------------------------------- #


def _user_ref(user: User) -> AdminUserRef:
    return AdminUserRef(
        telegram_id=user.telegram_id, first_name=user.first_name, username=user.username
    )


def _review(review: Review) -> AdminReview:
    return AdminReview(
        id=review.id,
        user=_user_ref(review.user),
        text=review.text,
        created_at=review.created_at,
        reply_text=review.reply_text,
        replied_at=review.replied_at,
    )


def _broadcast(broadcast: Broadcast) -> BroadcastInfo:
    return BroadcastInfo(
        id=broadcast.id,
        segment=broadcast.segment,
        status=broadcast.status.value,
        total=broadcast.total,
        sent=broadcast.sent,
        failed=broadcast.failed,
        created_at=broadcast.created_at,
        finished_at=broadcast.finished_at,
    )


def _parse_cursor(cursor: str | None) -> int | None:
    """Курсор страницы — неотрицательное целое (смещение или id); нет — первая страница."""
    if cursor is None or cursor == "":
        return None
    if not cursor.isdigit():
        raise ApiError(422, "invalid_cursor", "Некорректный курсор страницы")
    return int(cursor)


# --------------------------------------------------------------------------- #
#  Пользователи
# --------------------------------------------------------------------------- #


async def list_users(
    repo: Repository, query: str | None, cursor: str | None, limit: int
) -> AdminUsersPage:
    """Страница пользователей (новые сначала), с поиском по имени, @username и id."""
    offset = _parse_cursor(cursor) or 0
    users = await repo.search_users(query, offset, limit + 1)
    more = len(users) > limit
    return AdminUsersPage(
        users=[
            AdminUserSummary(
                telegram_id=user.telegram_id,
                first_name=user.first_name,
                username=user.username,
                created_at=user.created_at,
                last_seen_at=user.last_seen_at,
                blocked=user.blocked_at is not None,
            )
            for user in users[:limit]
        ],
        next_cursor=str(offset + limit) if more else None,
    )


async def _get_user(repo: Repository, telegram_id: int) -> User:
    user = await repo.get_user(telegram_id)
    if user is None:
        raise ApiError(404, "user_not_found", "Пользователь не найден")
    return user


async def user_profile(repo: Repository, telegram_id: int, language: str) -> AdminUserProfile:
    """Профиль пользователя: данные, статус, число привычек и его отзывы. Пояс подписан на
    языке интерфейса администратора (`language`)."""
    user = await _get_user(repo, telegram_id)
    reviews = await repo.user_reviews(telegram_id)
    city = selected_city(user.timezone, user.timezone_city)
    return AdminUserProfile(
        telegram_id=user.telegram_id,
        first_name=user.first_name,
        username=user.username,
        language=user.language,
        timezone=(
            timezone_display(user.timezone, language, city) if user.timezone else None
        ),
        created_at=user.created_at,
        app_opened_at=user.app_opened_at,
        last_seen_at=user.last_seen_at,
        blocked_at=user.blocked_at,
        bot_blocked_at=user.bot_blocked_at,
        is_admin=await repo.is_admin(telegram_id),
        habits=await repo.count_active_tasks(telegram_id),
        reviews=[_review(review) for review in reviews],
    )


async def _get_manageable_user(repo: Repository, telegram_id: int) -> User:
    """Пользователь, которого можно заблокировать или удалить: не администратор (в том
    числе не вы сами)."""
    user = await _get_user(repo, telegram_id)
    if await repo.is_admin(telegram_id):
        raise ApiError(
            409, "user_is_admin", "Администратора нельзя заблокировать или удалить"
        )
    return user


async def set_user_blocked(
    repo: Repository, telegram_id: int, blocked: bool, language: str
) -> AdminUserProfile:
    """Заблокировать пользователя (API отвечает ему 403, напоминания и рассылки не
    приходят) или снять блокировку; вернуть профиль (пояс — на языке `language`)."""
    user = await _get_manageable_user(repo, telegram_id)
    await repo.set_blocked(user, blocked)
    return await user_profile(repo, telegram_id, language)


async def delete_user(repo: Repository, telegram_id: int) -> None:
    """Удалить пользователя со всеми данными. Если он снова откроет приложение или
    запустит бота, появится заново — как новый."""
    await _get_manageable_user(repo, telegram_id)
    await repo.delete_user(telegram_id)


async def message_user(
    repo: Repository, bot: Bot, telegram_id: int, text: str
) -> DeliveryResponse:
    """Личное сообщение пользователю от бота."""
    user = await _get_user(repo, telegram_id)
    body = validation.validate_message(text, MESSAGE_MAX_LENGTH)
    reason = await messaging.send_text(bot, user.telegram_id, body)
    if reason == "bot_blocked":
        await repo.set_bot_blocked([user.telegram_id], blocked=True)
    return DeliveryResponse(delivered=reason is None, reason=reason)


# --------------------------------------------------------------------------- #
#  Отзывы
# --------------------------------------------------------------------------- #


async def list_reviews(repo: Repository, cursor: str | None, limit: int) -> AdminReviewsPage:
    """Страница отзывов всех пользователей, новые сначала."""
    reviews = await repo.list_reviews(_parse_cursor(cursor), limit + 1)
    more = len(reviews) > limit
    page = reviews[:limit]
    return AdminReviewsPage(
        reviews=[_review(review) for review in page],
        next_cursor=str(page[-1].id) if more else None,
    )


async def _get_review(repo: Repository, review_id: int) -> Review:
    review = await repo.get_review(review_id)
    if review is None:
        raise ApiError(404, "review_not_found", "Отзыв не найден")
    return review


async def get_review(repo: Repository, review_id: int) -> AdminReview:
    return _review(await _get_review(repo, review_id))


async def reply_to_review(
    repo: Repository, bot: Bot, admin: User, review_id: int, text: str
) -> ReviewReplyResponse:
    """Ответить на отзыв сообщением бота; дошедший ответ запоминается у отзыва."""
    review = await _get_review(repo, review_id)
    body = validation.validate_message(text, MESSAGE_MAX_LENGTH)
    reason = await messaging.send_review_reply(
        bot, review.user_id, review.user.language, review.text, body
    )
    if reason is None:
        await repo.set_review_reply(review, body, admin.telegram_id)
    elif reason == "bot_blocked":
        await repo.set_bot_blocked([review.user_id], blocked=True)
    return ReviewReplyResponse(delivered=reason is None, reason=reason, review=_review(review))


# --------------------------------------------------------------------------- #
#  Администраторы
# --------------------------------------------------------------------------- #


async def list_admins(repo: Repository, viewer: User) -> AdminsResponse:
    """Все администраторы; имя — у тех, кто уже есть среди пользователей."""
    return AdminsResponse(
        admins=[
            AdminEntry(
                telegram_id=admin.telegram_id,
                first_name=user.first_name if user else None,
                username=user.username if user else None,
                added_at=admin.created_at,
                is_self=admin.telegram_id == viewer.telegram_id,
            )
            for admin, user in await repo.list_admins()
        ]
    )


async def add_admin(repo: Repository, viewer: User, telegram_id: int) -> AdminsResponse:
    """Сделать администратором по id Telegram (пользователь может ещё не открывать
    приложение — вход в панель появится у него в настройках)."""
    if await repo.is_admin(telegram_id):
        raise ApiError(409, "admin_exists", "Он уже администратор")
    await repo.add_admin(telegram_id, added_by=viewer.telegram_id)
    return await list_admins(repo, viewer)


async def remove_admin(repo: Repository, viewer: User, telegram_id: int) -> AdminsResponse:
    """Забрать права администратора (не у себя)."""
    if telegram_id == viewer.telegram_id:
        raise ApiError(409, "cannot_remove_self", "Себя убрать нельзя")
    if not await repo.remove_admin(telegram_id):
        raise ApiError(404, "admin_not_found", "Такого администратора нет")
    return await list_admins(repo, viewer)


# --------------------------------------------------------------------------- #
#  Рассылки
# --------------------------------------------------------------------------- #


async def broadcast_segments(repo: Repository, viewer: User) -> BroadcastSegmentsResponse:
    """Сегменты рассылки и сколько в каждом получателей сейчас (без автора: ему приходит
    копия)."""
    moment = utc_now()
    return BroadcastSegmentsResponse(
        segments=[
            BroadcastSegment(
                key=segment,
                recipients=await repo.count_recipients(segment, moment, viewer.telegram_id),
            )
            for segment in BROADCAST_SEGMENTS
        ]
    )


def _media_type(media: UploadFile) -> str:
    """Вид сообщения по типу файла («photo» / «video») с проверкой размера — в пределах
    загрузки Bot API."""
    content_type = (media.content_type or "").lower()
    if content_type in BROADCAST_PHOTO_TYPES:
        kind, limit = "photo", BROADCAST_PHOTO_MAX_BYTES
    elif content_type in BROADCAST_VIDEO_TYPES:
        kind, limit = "video", BROADCAST_VIDEO_MAX_BYTES
    else:
        raise ApiError(
            422, "invalid_media", "Можно приложить фото (JPEG, PNG, WebP) или видео (MP4)"
        )
    if media.size is not None and media.size > limit:
        raise ApiError(413, "media_too_large", "Файл слишком большой")
    return kind


async def create_broadcast(
    repo: Repository,
    bot: Bot,
    admin: User,
    segment: str,
    text: str,
    media: UploadFile | None,
) -> BroadcastInfo:
    """Поставить рассылку в очередь бота: текст, фото или видео (с подписью или без)."""
    segment = validation.validate_segment(segment)
    media_type = _media_type(media) if media is not None else None
    body = (
        validation.validate_caption(text, CAPTION_MAX_LENGTH)
        if media_type
        else validation.validate_message(text, MESSAGE_MAX_LENGTH)
    )
    total = await repo.count_recipients(segment, utc_now(), admin.telegram_id)
    if total == 0:
        raise ApiError(409, "no_recipients", "В этом сегменте нет получателей")
    file_id = await messaging.send_broadcast_copy(bot, admin.telegram_id, body, media, media_type)
    broadcast = await repo.create_broadcast(
        created_by=admin.telegram_id,
        segment=segment,
        text=body,
        media_type=media_type,
        media_file_id=file_id,
        total=total,
    )
    return _broadcast(broadcast)


async def get_broadcast(repo: Repository, broadcast_id: int) -> BroadcastInfo:
    """Рассылка и ход её доставки."""
    broadcast = await repo.get_broadcast(broadcast_id)
    if broadcast is None:
        raise ApiError(404, "broadcast_not_found", "Рассылка не найдена")
    return _broadcast(broadcast)
