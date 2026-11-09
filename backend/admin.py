"""Логика админ-панели поверх репозитория: пользователи, отзывы, администраторы и
рассылки (аналитика — в пакете analytics/).

Правила, общие для всех действий:
- администратора нельзя заблокировать или удалить — сначала у него забирают права;
- себя нельзя убрать из администраторов — это делает другой администратор (так в
  списке всегда остаётся хотя бы один);
- личные сообщения и ответы на отзывы отправляются сразу (messaging.py); если
  пользователь заблокировал бота, это отмечается в базе и возвращается как «не
  доставлено», а не ошибкой;
- рассылку API только ставит в очередь (копия — автору, по ней медиа загружается в
  Telegram), а рассылает бот (bot/broadcasts.py);
- кого показать в списке пользователей и кому отправить рассылку, задаёт фильтр
  (audience.py).
"""

from __future__ import annotations

from aiogram import Bot
from starlette.datastructures import UploadFile

from backend import messaging, validation
from backend.analytics.profile import user_insights, uses_telegram, uses_web
from backend.audience import audience_key, parse_audience, resolve_audience
from backend.constants import (
    BROADCAST_CHANNELS,
    BROADCAST_PHOTO_MAX_BYTES,
    BROADCAST_PHOTO_TYPES,
    BROADCAST_VIDEO_MAX_BYTES,
    BROADCAST_VIDEO_TYPES,
    CAPTION_MAX_LENGTH,
    DEFAULT_LANGUAGE,
    MESSAGE_MAX_LENGTH,
    PUSH_TEXT_MAX_LENGTH,
    PUSH_TITLE_MAX_LENGTH,
)
from backend.errors import ApiError
from backend.models import Broadcast, Review, User
from backend.repository import Repository, utc_now
from backend.webpush import PushTarget, VapidKeys, notification, push_to_devices
from backend.schemas import (
    AdminEntry,
    AdminReview,
    AdminReviewsPage,
    AdminsResponse,
    AdminUserHabits,
    AdminUserProfile,
    AdminUserRef,
    AdminUsersCount,
    AdminUsersPage,
    AdminUserSummary,
    BroadcastInfo,
    BroadcastRecipients,
    DeliveryResponse,
    ReviewReplyResponse,
)
from backend.services import list_habits
from backend.timezones import selected_city, timezone_display


# --------------------------------------------------------------------------- #
#  Сериализация
# --------------------------------------------------------------------------- #


# Заголовок push с ответом на отзыв (текст под ним — сам ответ); на языке автора отзыва.
REVIEW_REPLY_PUSH_TITLES: dict[str, str] = {
    "ru": "Ответ на ваш отзыв",
    "en": "Reply to your review",
}

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
        audience=broadcast.audience,
        channel=broadcast.channel,
        button=broadcast.button,
        status=broadcast.status.value,
        total=broadcast.total,
        sent=broadcast.sent,
        failed=broadcast.failed,
        created_at=broadcast.created_at,
        finished_at=broadcast.finished_at,
    )


def _parse_cursor(cursor: str | None) -> int | None:
    """Курсор страницы — неотрицательное целое (смещение или id); нет — первая страница.

    Курсор приходит из прошлого ответа, но в запросе может оказаться любым: слишком
    большое число колонка базы не принимает, поэтому оно отвергается здесь — как и
    нечисловое, ошибкой о некорректном курсоре, а не ошибкой драйвера.
    """
    if cursor is None or cursor == "":
        return None
    value = validation.parse_db_int(cursor)
    if value is None:
        raise ApiError(422, "invalid_cursor", "Некорректный курсор страницы")
    return value


# --------------------------------------------------------------------------- #
#  Пользователи
# --------------------------------------------------------------------------- #


async def list_users(
    repo: Repository, query: str | None, audience: str | None, cursor: str | None, limit: int
) -> AdminUsersPage:
    """Страница пользователей (новые сначала), с поиском по имени, @username и id и с
    фильтром (audience.py). На первой странице — ещё и сколько их всего."""
    offset = _parse_cursor(cursor) or 0
    filters = parse_audience(audience)
    moment = utc_now()
    ids = await resolve_audience(repo, filters, moment)
    users = await repo.search_users(query, filters, moment, offset, limit + 1, ids)
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
                is_test=user.is_test,
                uses_telegram=uses_telegram(user),
                uses_web=uses_web(user),
            )
            for user in users[:limit]
        ],
        next_cursor=str(offset + limit) if more else None,
        total=await repo.count_users(query, filters, moment, ids) if offset == 0 else None,
    )


async def count_users(repo: Repository, query: str | None, audience: str | None) -> AdminUsersCount:
    """Сколько пользователей под поиском и фильтром."""
    filters = parse_audience(audience)
    moment = utc_now()
    ids = await resolve_audience(repo, filters, moment)
    return AdminUsersCount(count=await repo.count_users(query, filters, moment, ids))


async def _get_user(repo: Repository, telegram_id: int) -> User:
    user = await repo.get_user(telegram_id)
    if user is None:
        raise ApiError(404, "user_not_found", "Пользователь не найден")
    return user


async def user_profile(repo: Repository, telegram_id: int, language: str) -> AdminUserProfile:
    """Профиль пользователя: данные, статус, число привычек, его отзывы и сводка
    аналитики (откуда пришёл, активирован ли, серия, выполнение). Пояс подписан на языке
    интерфейса администратора (`language`)."""
    user = await _get_user(repo, telegram_id)
    reviews = await repo.user_reviews(telegram_id)
    city = selected_city(user.timezone, user.timezone_city)
    is_admin = await repo.is_admin(telegram_id)
    insights = await user_insights(repo, user, is_admin, utc_now())
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
        telegram_notifications=user.telegram_notifications,
        is_admin=is_admin,
        habits=await repo.count_active_tasks(telegram_id),
        reviews=[_review(review) for review in reviews],
        **insights,
    )


async def set_user_test(
    repo: Repository, telegram_id: int, is_test: bool, language: str
) -> AdminUserProfile:
    """Отметить тестовый аккаунт (он не входит в аналитику) или снять отметку."""
    user = await _get_user(repo, telegram_id)
    await repo.set_test(user, is_test)
    return await user_profile(repo, telegram_id, language)


async def user_habits(repo: Repository, telegram_id: int) -> AdminUserHabits:
    """Привычки пользователя — ровно те, что он видит у себя в приложении: день отметки
    считается в его поясе и с его режимом «Отмечать за вчера» (services.list_habits).
    Панель их только показывает, поэтому отмечать и менять их здесь нечем."""
    user = await _get_user(repo, telegram_id)
    return AdminUserHabits(
        habits=await list_habits(repo, user), mark_yesterday=user.mark_yesterday
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
    await repo.commit()  # не держать транзакцию БД, пока идёт отправка (см. Repository.commit)
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
    repo: Repository,
    bot: Bot,
    admin: User,
    review_id: int,
    text: str,
    push: tuple[VapidKeys, str] | None = None,
) -> ReviewReplyResponse:
    """Ответить на отзыв. Ответ запоминается у отзыва всегда: автор видит его в приложении
    на экране отзыва. Уведомление — как у напоминаний: push на устройства веб-приложения,
    если там включены уведомления (`push` — ключи VAPID и адрес приложения), иначе (или
    если ни одно устройство не приняло) — сообщение бота с цитатой отзыва."""
    review = await _get_review(repo, review_id)
    body = validation.validate_message(text, MESSAGE_MAX_LENGTH)
    user_id, language, quoted = review.user_id, review.user.language, review.text
    await repo.set_review_reply(review, body, admin.telegram_id)
    subscriptions = (
        (await repo.push_subscriptions_for([user_id])).get(user_id, []) if push else []
    )
    await repo.commit()  # не держать транзакцию БД, пока идёт отправка (см. Repository.commit)
    delivered: list[str] = []
    gone: list[str] = []
    if push is not None and subscriptions:
        keys, base_url = push
        title = REVIEW_REPLY_PUSH_TITLES.get(language, REVIEW_REPLY_PUSH_TITLES[DEFAULT_LANGUAGE])
        delivered, gone = await push_to_devices(
            [PushTarget(item.endpoint, item.p256dh, item.auth) for item in subscriptions],
            notification(
                title,
                body,
                f"{base_url}/app?pwa=1&from=push&open=review",
                tag=f"review-{review_id}",
            ),
            keys,
        )
    reason = None
    if not delivered:
        reason = await messaging.send_review_reply(bot, user_id, language, quoted, body)
        if reason == "bot_blocked":
            await repo.set_bot_blocked([user_id], blocked=True)
    await repo.delete_push_subscriptions(gone)
    if delivered:
        await repo.mark_push_delivered(delivered, utc_now())
    review = await _get_review(repo, review_id)
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


def _channel(value: str | None) -> str:
    """Канал рассылки (constants.BROADCAST_CHANNELS); пусто — Telegram."""
    channel = value or "telegram"
    if channel not in BROADCAST_CHANNELS:
        raise ApiError(422, "invalid_channel", "Неизвестный канал рассылки")
    return channel


def _exclude(channel: str, admin: User) -> int | None:
    """Кого не считать получателем: в Telegram автору приходит копия, у push копии нет."""
    return admin.telegram_id if channel == "telegram" else None


async def broadcast_recipients(
    repo: Repository, viewer: User, audience: str | None, channel: str | None = None
) -> BroadcastRecipients:
    """Сколько получателей у рассылки с фильтром сейчас по каналу (в Telegram — без
    автора: ему приходит копия; push — у кого включены уведомления веб-приложения)."""
    filters = parse_audience(audience, broadcast=True)
    kind = _channel(channel)
    moment = utc_now()
    ids = await resolve_audience(repo, filters, moment)
    return BroadcastRecipients(
        recipients=await repo.count_recipients(
            filters, moment, _exclude(kind, viewer), ids, kind
        )
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
    audience: str,
    text: str,
    button: str,
    media: UploadFile | None,
    tma_url: str | None,
    channel: str | None = None,
    title: str = "",
    push_enabled: bool = False,
) -> BroadcastInfo:
    """Поставить рассылку в очередь бота: текст, фото или видео (с подписью или без),
    под ним — необязательная кнопка. `audience` — фильтр получателей (audience.py).

    Push (`channel` "push"): заголовок и текст без медиа тем, у кого включены уведомления
    веб-приложения; кнопка — куда ведёт нажатие (без неё — в приложение). Копии автору
    нет; без ключей VAPID (`push_enabled` False) — 503."""
    filters = parse_audience(audience, broadcast=True)
    if _channel(channel) == "push":
        return await _create_push_broadcast(
            repo, admin, filters, title, text, button, media, push_enabled
        )
    button_key = validation.validate_broadcast_button(button)
    if button_key is not None and not tma_url:
        raise ApiError(503, "app_url_missing", "Не задан адрес приложения (TMA_URL)")
    media_type = _media_type(media) if media is not None else None
    body = (
        validation.validate_caption(text, CAPTION_MAX_LENGTH)
        if media_type
        else validation.validate_message(text, MESSAGE_MAX_LENGTH)
    )
    moment = utc_now()
    ids = await resolve_audience(repo, filters, moment)
    total = await repo.count_recipients(filters, moment, admin.telegram_id, ids)
    if total == 0:
        raise ApiError(409, "no_recipients", "Под этот фильтр не попал ни один получатель")
    # Загрузка видео в Telegram идёт минутами — транзакцию БД на это время не держим,
    # иначе отметки привычек остальных пользователей ждут блокировки (см. Repository.commit).
    await repo.commit()
    file_id = await messaging.send_broadcast_copy(
        bot,
        admin.telegram_id,
        body,
        media,
        media_type,
        # Кнопка на копии — на языке автора; получатели видят её каждый на своём.
        lambda icon: messaging.broadcast_keyboard(
            button_key, admin.language, tma_url or "", icon=icon
        ),
    )
    broadcast = await repo.create_broadcast(
        created_by=admin.telegram_id,
        audience=audience_key(filters),
        text=body,
        media_type=media_type,
        media_file_id=file_id,
        button=button_key,
        total=total,
    )
    return _broadcast(broadcast)


async def _create_push_broadcast(
    repo: Repository,
    admin: User,
    filters: dict[str, str],
    title: str,
    text: str,
    button: str,
    media: UploadFile | None,
    push_enabled: bool,
) -> BroadcastInfo:
    """Push-рассылка: проверить заголовок и текст, посчитать получателей и поставить в
    очередь бота (он и рассылает уведомления, bot/broadcasts.py)."""
    if not push_enabled:
        raise ApiError(503, "push_unavailable", "Push-уведомления не настроены (VAPID)")
    if media is not None:
        raise ApiError(422, "invalid_media", "К push нельзя приложить фото или видео")
    heading = validation.validate_caption(title, PUSH_TITLE_MAX_LENGTH)
    if heading is None:
        raise ApiError(422, "invalid_title", "Введите заголовок уведомления")
    body = validation.validate_message(text, PUSH_TEXT_MAX_LENGTH)
    button_key = validation.validate_broadcast_button(button)
    moment = utc_now()
    ids = await resolve_audience(repo, filters, moment)
    total = await repo.count_recipients(filters, moment, None, ids, "push")
    if total == 0:
        raise ApiError(409, "no_recipients", "Под этот фильтр не попал ни один получатель")
    broadcast = await repo.create_broadcast(
        created_by=admin.telegram_id,
        audience=audience_key(filters),
        text=body,
        media_type=None,
        media_file_id=None,
        button=button_key,
        total=total,
        channel="push",
        title=heading,
    )
    return _broadcast(broadcast)


async def get_broadcast(repo: Repository, broadcast_id: int) -> BroadcastInfo:
    """Рассылка и ход её доставки."""
    broadcast = await repo.get_broadcast(broadcast_id)
    if broadcast is None:
        raise ApiError(404, "broadcast_not_found", "Рассылка не найдена")
    return _broadcast(broadcast)
