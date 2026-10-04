"""Pydantic-схемы ответов API (контракт с фронтендом).

Схемы намеренно отделены от ORM-моделей: модели описывают хранение, схемы —
форму ответа. Так контракт API не зависит от внутренней структуры таблиц.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from tma.backend.constants import DEFAULT_HABIT_COLOR, HISTORY_DAYS, MAX_DB_INT


def _assume_utc(value: datetime) -> datetime:
    """Время из базы — UTC без пояса; в ответе у него явный пояс («…Z»), иначе браузер
    прочитает его как местное."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# Момент времени в ответе API — всегда с поясом UTC.
UtcDateTime = Annotated[datetime, AfterValidator(_assume_utc)]


class Habit(BaseModel):
    """Привычка пользователя: расписание, история выполнения и статистика серий."""

    id: int = Field(..., description="Идентификатор задачи")
    name: str = Field(..., description="Название привычки")
    done_today: bool = Field(
        ...,
        description=(
            "Отмечена ли задача выполненной «сегодня» — в день отметки: сегодня, а в "
            "режиме «Отмечать за вчера» — вчера"
        ),
    )
    scheduled_today: bool = Field(
        ...,
        description=(
            "Запланирована ли задача на день отметки (по частоте/дням недели). "
            "True — задачу можно отмечать; False — только просмотр прогресса."
        ),
    )
    frequency_type: Literal["daily", "specific_days"] = Field(
        ..., description="Каждый день или конкретные дни недели"
    )
    days: list[str] = Field(
        ...,
        description="Коды дней недели (mon..sun) для specific_days; для daily — пустой список",
    )
    history: list[bool] = Field(
        ...,
        description=(
            f"Выполнение за последние {HISTORY_DAYS} дней (старое → день отметки). "
            "True — день выполнен (статус done), False — пропущен или нет данных. "
            "Индекс 0 — самый старый день, последний — день отметки."
        ),
    )
    current_streak: int = Field(
        ...,
        description=(
            "Текущая серия: подряд выполненные дни по сегодня включительно. "
            "Неотмеченный сегодняшний день серию не прерывает — день ещё не закончился."
        ),
    )
    best_streak: int = Field(..., description="Лучшая серия за всё время")
    total_done: int = Field(..., description="Сколько раз привычка выполнена за всё время")
    reminder_time: str | None = Field(
        ...,
        description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания",
    )
    color: str = Field(..., description="Цвет (тема) привычки — ключ палитры: blue, green, …")


class HabitsResponse(BaseModel):
    """Ответ `GET /tasks` — список привычек пользователя."""

    habits: list[Habit]


class HabitResponse(BaseModel):
    """Ответ с одной привычкой (создание, изменение, переключение отметки)."""

    habit: Habit


class HabitCreate(BaseModel):
    """Запрос `POST /tasks` — создание привычки."""

    name: str = Field(..., description="Название привычки")
    frequency_type: Literal["daily", "specific_days"] = Field(
        ..., description="Каждый день или конкретные дни недели"
    )
    days: list[str] = Field(
        default_factory=list,
        description="Коды дней недели (mon..sun) для specific_days; для daily игнорируется",
    )
    reminder_time: str | None = Field(
        None, description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания"
    )
    color: str = Field(DEFAULT_HABIT_COLOR, description="Цвет (тема) привычки — ключ палитры")


class HabitUpdate(HabitCreate):
    """Запрос `PUT /tasks/{task_id}` — изменение привычки (все поля формы, как при создании)."""


class SettingsResponse(BaseModel):
    """Текущие настройки пользователя (для `GET/PUT /settings`)."""

    timezone: str | None = Field(None, description="Часовой пояс (IANA)")
    timezone_city: int | None = Field(
        None, description="Город пояса — id в справочнике городов (нет у «UTC±N»)"
    )
    timezone_display: str | None = Field(
        None,
        description="Пояс на языке интерфейса: город («Санкт-Петербург») или смещение («UTC+3»)",
    )
    timezone_offset: str | None = Field(None, description="Смещение пояса, напр. «UTC+3»")
    language: str = Field(..., description="Язык интерфейса: ru, en")
    theme: str = Field(..., description="Тема оформления: light, dark или system (как в системе)")
    mark_yesterday: bool = Field(
        ..., description="«Отмечать за вчера»: отметки ставятся за вчерашний день"
    )
    is_admin: bool = Field(
        False, description="Администратор: в настройках виден вход в админ-панель"
    )


class SettingsUpdate(BaseModel):
    """Запрос `PUT /settings` — частичное обновление (передаются только меняемые поля)."""

    timezone: str | None = Field(None, description="Новый пояс: имя IANA или «UTC±N»")
    timezone_city: int | None = Field(
        None, description="Новый пояс городом — id в справочнике (вместо `timezone`)"
    )
    language: str | None = Field(None, description="Язык интерфейса: ru, en")
    theme: str | None = Field(None, description="Тема оформления: light, dark, system")
    mark_yesterday: bool | None = Field(None, description="Отмечать за вчера")


class TimezoneEntry(BaseModel):
    """Часовой пояс для выбора в настройках — город и его зона."""

    zone: str = Field(..., description="Зона IANA, напр. «Europe/Moscow»")
    city_id: int | None = Field(
        None, description="Город в справочнике (нет у зон без города в справочнике)"
    )
    city: str = Field(..., description="Город на языке интерфейса")
    region: str | None = Field(
        None, description="Регион — только если в стране есть одноимённый город"
    )
    country: str = Field(..., description="Страна на языке интерфейса")
    offset: str = Field(..., description="Текущее смещение, напр. «UTC+3»")


class TimezonesResponse(BaseModel):
    """Ответ `GET /meta/timezones`: каталог поясов с запада на восток или результаты
    поиска."""

    timezones: list[TimezoneEntry]


class MetaResponse(BaseModel):
    """Справочные данные для форм: лимит длины названия привычки."""

    name_max_length: int


class ReviewCreate(BaseModel):
    """Запрос `POST /reviews` — отзыв из настроек («Написать отзыв»)."""

    text: str = Field(..., description="Текст отзыва")


class ReviewCreated(BaseModel):
    """Ответ `POST /reviews`: отзыв сохранён."""

    id: int
    created_at: UtcDateTime


# --------------------------------------------------------------------------- #
#  Админ-панель (/admin/*)
# --------------------------------------------------------------------------- #


class AdminUserRef(BaseModel):
    """Пользователь в строке списка: имя, @username и id Telegram."""

    telegram_id: int
    first_name: str | None
    username: str | None


class AdminUserSummary(AdminUserRef):
    """Строка списка пользователей."""

    created_at: UtcDateTime
    last_seen_at: UtcDateTime | None
    blocked: bool = Field(..., description="Заблокирован администратором")


class AdminUsersPage(BaseModel):
    """Страница списка пользователей; `next_cursor` — для следующей (null — последняя)."""

    users: list[AdminUserSummary]
    next_cursor: str | None
    total: int | None = Field(
        None, description="Всего под поиском и фильтром — только на первой странице"
    )


class AdminUsersCount(BaseModel):
    """Ответ `GET /admin/users/count`."""

    count: int


class AdminReview(BaseModel):
    """Отзыв с автором и последним ответом администратора."""

    id: int
    user: AdminUserRef
    text: str
    created_at: UtcDateTime
    reply_text: str | None
    replied_at: UtcDateTime | None


class AdminReviewsPage(BaseModel):
    """Страница отзывов (новые сначала); `next_cursor` — для следующей."""

    reviews: list[AdminReview]
    next_cursor: str | None


class AdminReviewResponse(BaseModel):
    review: AdminReview


class AdminUserProfile(AdminUserRef):
    """Профиль пользователя в админ-панели."""

    language: str
    timezone: str | None = Field(None, description="Пояс на английском: город или UTC±N")
    created_at: UtcDateTime
    app_opened_at: UtcDateTime | None = Field(None, description="Впервые открыл приложение")
    last_seen_at: UtcDateTime | None
    blocked_at: UtcDateTime | None = Field(None, description="Заблокирован администратором")
    bot_blocked_at: UtcDateTime | None = Field(None, description="Заблокировал бота")
    is_admin: bool
    habits: int = Field(..., description="Активных привычек")
    reviews: list[AdminReview]


class AdminUserResponse(BaseModel):
    user: AdminUserProfile


class AdminUserHabits(BaseModel):
    """Ответ `GET /admin/users/{id}/habits` — привычки пользователя в том же виде, в
    каком их видит он сам в приложении."""

    habits: list[Habit]
    mark_yesterday: bool = Field(
        ...,
        description=(
            "«Отмечать за вчера» у этого пользователя: день отметки — вчерашний "
            "(от него зависит подпись секции «не запланированы»)"
        ),
    )


class AdminBlockUpdate(BaseModel):
    """Запрос `PUT /admin/users/{id}/block`."""

    blocked: bool


class AdminMessage(BaseModel):
    """Текст личного сообщения или ответа на отзыв."""

    text: str


class AdminEntry(AdminUserRef):
    """Администратор в списке."""

    added_at: UtcDateTime
    is_self: bool = Field(..., description="Это вы — себя убрать нельзя")


class AdminsResponse(BaseModel):
    admins: list[AdminEntry]


class AdminCreate(BaseModel):
    """Запрос `POST /admin/admins`."""

    telegram_id: int = Field(
        ..., ge=1, le=MAX_DB_INT, description="id Telegram нового администратора"
    )


class BroadcastRecipients(BaseModel):
    """Ответ `GET /admin/broadcasts/recipients`: сколько получателей у фильтра сейчас."""

    recipients: int


class BroadcastInfo(BaseModel):
    """Рассылка и ход её доставки."""

    id: int
    audience: str = Field(..., description="Фильтр получателей; пустой — все")
    button: Literal["open_app", "review", "new_habit"] | None
    status: Literal["pending", "sending", "done"]
    total: int = Field(..., description="Получателей на момент создания")
    sent: int
    failed: int
    created_at: UtcDateTime
    finished_at: UtcDateTime | None


class BroadcastResponse(BaseModel):
    broadcast: BroadcastInfo


class AnalyticsUsers(BaseModel):
    """Пользователи: всего, открывшие приложение, заблокировавшие бота и т.д."""

    total: int
    opened_app: int = Field(..., description="Открывали приложение")
    never_opened: int = Field(..., description="Только запустили бота")
    blocked_bot: int = Field(..., description="Заблокировали бота")
    blocked: int = Field(..., description="Заблокированы администратором")
    active_now: int = Field(..., description="Были в приложении последние минуты")


class AnalyticsFunnel(BaseModel):
    """Новые пользователи за период: запустили бота → из них открыли приложение → из них
    добавили хотя бы одну привычку (удалённые тоже считаются)."""

    started_bot: int
    opened_app: int
    added_habit: int


class AnalyticsAudience(BaseModel):
    """Все пользователи без пересечений: пользуются приложением, ещё не открывали его,
    заблокировали бота (открывали приложение или нет)."""

    uses_app: int
    never_opened: int
    blocked_bot: int


class AnalyticsActivity(BaseModel):
    """Разные пользователи, открывавшие приложение: сегодня, за 7 и за 30 дней (UTC)."""

    dau: int
    wau: int
    mau: int


class HabitsBucket(BaseModel):
    """Сколько пользователей приложения завели столько привычек (`open_ended` — «и больше»)."""

    habits: int
    users: int
    open_ended: bool


class AnalyticsHabits(BaseModel):
    """Привычки тех, кто пользуется приложением (открывал его и не заблокировал бота): в
    среднем на такого пользователя, всего и распределение — в сумме оно равно
    `audience.uses_app`."""

    average: float
    total: int
    distribution: list[HabitsBucket]


class AnalyticsDay(BaseModel):
    """День графиков (UTC)."""

    date: date
    new_users: int
    total_users: int = Field(..., description="Пользователей к концу дня")
    active_users: int = Field(..., description="DAU")
    scheduled: int = Field(..., description="Запланированных на день выполнений привычек")
    completed: int = Field(..., description="Из них выполнено")
    completion_rate: float | None = Field(
        ..., description="completed / scheduled; null — ничего не запланировано"
    )


class AnalyticsResponse(BaseModel):
    """Ответ `GET /admin/analytics`."""

    period_days: int
    generated_at: UtcDateTime
    users: AnalyticsUsers
    funnel: AnalyticsFunnel
    audience: AnalyticsAudience
    activity: AnalyticsActivity
    habits: AnalyticsHabits
    completion_rate: float | None = Field(..., description="Доля выполнения за период")
    days: list[AnalyticsDay]


class DeliveryResponse(BaseModel):
    """Результат отправки сообщения ботом. Не доставлено — `reason`: пользователь
    заблокировал бота (`bot_blocked`) или ни разу его не запускал (`chat_not_found`)."""

    delivered: bool
    reason: Literal["bot_blocked", "chat_not_found"] | None = None


class ReviewReplyResponse(DeliveryResponse):
    """Ответ на отзыв: результат доставки и отзыв (с ответом, если он дошёл)."""

    review: AdminReview


# --------------------------------------------------------------------------- #
#  Web app (PWA): accounts, logins, push, funnel events
# --------------------------------------------------------------------------- #


class WebSessionResponse(BaseModel):
    """A web session for the installed app: the token goes into `Authorization: Bearer`."""

    token: str
    user_id: int


class AccountLogin(BaseModel):
    """A login method of the account and its state."""

    provider: Literal["telegram", "google"]
    linked: bool
    # What it is linked as: @username, name or e-mail; null — not linked.
    label: str | None = None


class AccountResponse(BaseModel):
    """Settings → Account: logins and whether the account is still a guest."""

    user_id: int
    is_guest: bool
    has_habits: bool
    logins: list[AccountLogin]
    # Google login is configured on the server (GOOGLE_CLIENT_ID).
    google_available: bool


class LinkResult(BaseModel):
    """Result of linking a login: the account to continue in and, for the web app, a new
    session (the account may have switched or merged)."""

    account: AccountResponse
    session: WebSessionResponse | None = None


class HandoffCreate(BaseModel):
    """`POST /auth/handoff` — where the install link is opened from (analytics `src`)."""

    src: str = Field("settings", max_length=32)


class HandoffResponse(BaseModel):
    """A single-use link that opens the install flow logged into the same account."""

    token: str
    url: str
    expires_in: int


class TokenRequest(BaseModel):
    """A one-time token or code from a link or a redirect."""

    token: str = Field(..., min_length=1, max_length=256)


class TelegramLoginStart(BaseModel):
    """`POST /auth/telegram/start` — "log in via Telegram" through the bot."""

    code: str
    # Opens the bot in the Telegram app (tg://) and its web fallback (https://t.me/…).
    app_url: str
    web_url: str
    expires_in: int


class TelegramLoginPoll(BaseModel):
    """Whether the bot login was confirmed; `result` — when it was."""

    status: Literal["pending", "done"]
    result: LinkResult | None = None


class TelegramWidgetLogin(BaseModel):
    """Data returned by Telegram's web login (oauth.telegram.org), checked by its hash."""

    id: int
    first_name: str | None = None
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str = Field(..., max_length=128)


class GoogleStart(BaseModel):
    """`POST /auth/google/start`: `web` — the installed app (redirects back into it),
    `telegram` — from the Mini App (finishes in the browser)."""

    mode: Literal["web", "telegram"] = "web"


class RedirectUrl(BaseModel):
    """Where to send the browser."""

    url: str


class WebConfig(BaseModel):
    """Public settings the web app needs."""

    vapid_public_key: str | None
    telegram_bot_username: str | None
    # Numeric bot id for Telegram's web login (public: it is the bot's user id).
    telegram_bot_id: int | None
    google_available: bool


class PushKeys(BaseModel):
    p256dh: str = Field(..., max_length=255)
    auth: str = Field(..., max_length=255)


class PushSubscriptionIn(BaseModel):
    """A browser PushSubscription (`subscription.toJSON()`)."""

    endpoint: str = Field(..., max_length=1024)
    keys: PushKeys


class LogoutRequest(BaseModel):
    """This device's push subscription, to detach from the account (none — no push)."""

    endpoint: str | None = Field(default=None, max_length=1024)


class PushUnsubscribe(BaseModel):
    endpoint: str = Field(..., max_length=1024)


class PushStatus(BaseModel):
    """Whether the account gets reminders as push notifications."""

    subscribed: bool


class EventIn(BaseModel):
    """A funnel event from the landing or the app (see constants.FUNNEL_EVENTS)."""

    event: str = Field(..., max_length=48)
    anon_id: str | None = Field(None, max_length=64)
    platform: str | None = Field(None, max_length=16)
    browser_context: str | None = Field(None, max_length=16)
    src: str | None = Field(None, max_length=32)
    props: dict[str, object] | None = None


class FunnelRow(BaseModel):
    """Funnel step counts: total and by platform and by `src`."""

    event: str
    total: int
    unique: int
    by_platform: dict[str, int]
    by_src: dict[str, int]


class FunnelResponse(BaseModel):
    """`GET /admin/funnel` — web app funnel for a period."""

    since: date
    until: date
    steps: list[FunnelRow]
