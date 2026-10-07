"""Pydantic-схемы ответов API (контракт с фронтендом).

Схемы намеренно отделены от ORM-моделей: модели описывают хранение, схемы —
форму ответа. Так контракт API не зависит от внутренней структуры таблиц.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field

from backend.constants import (
    ACTIVATION_WINDOW_MAX_DAYS,
    CLIENT_REF_MAX_LENGTH,
    DEFAULT_HABIT_COLOR,
    HISTORY_DAYS,
    MAX_DB_INT,
    MAX_TIMES_PER_DAY,
    SEGMENT_TITLE_MAX_LENGTH,
    SYNC_MAX_OPS,
)


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
    frequency_type: Literal["daily", "specific_days", "every_other_day"] = Field(
        ..., description="Каждый день, конкретные дни недели или через день"
    )
    days: list[str] = Field(
        ...,
        description="Коды дней недели (mon..sun) для specific_days; для остальных — пустой список",
    )
    start_date: date | None = Field(
        None,
        description="Первый день привычки every_other_day (дальше — каждый второй); иначе null",
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
    frozen_since: date | None = Field(
        None,
        description=(
            "С какого дня привычка заморожена; null — не заморожена. Замороженную нельзя "
            "отмечать, пропуски не прерывают её серию"
        ),
    )
    frozen_history: list[bool] = Field(
        default_factory=list,
        description=(
            "Дни заморозки за те же дни, что `history` (текущая заморозка и прошедшие): "
            "True — привычка в этот день была заморожена"
        ),
    )
    times_per_day: int = Field(
        1, description="Сколько раз в день нужно выполнить привычку (1 — обычная привычка)"
    )
    today_count: int = Field(
        0,
        description=(
            "Сколько раз привычка выполнена в день отметки (у привычек «несколько раз в "
            "день»; день выполнен, когда набрано times_per_day)"
        ),
    )
    auto_mark: bool = Field(
        False,
        description=(
            "«Автоотметка»: без напоминания — выполнена с началом дня, с "
            "напоминанием — сразу после него (только при times_per_day = 1)"
        ),
    )


class HabitsResponse(BaseModel):
    """Ответ `GET /tasks` — список привычек пользователя."""

    habits: list[Habit]


class HabitResponse(BaseModel):
    """Ответ с одной привычкой (создание, изменение, переключение отметки)."""

    habit: Habit


class HabitCreate(BaseModel):
    """Запрос `POST /tasks` — создание привычки."""

    name: str = Field(..., description="Название привычки")
    frequency_type: Literal["daily", "specific_days", "every_other_day"] = Field(
        ..., description="Каждый день, конкретные дни недели или через день"
    )
    days: list[str] = Field(
        default_factory=list,
        description="Коды дней недели (mon..sun) для specific_days; для остальных игнорируется",
    )
    start_date: date | None = Field(
        None,
        description="Первый день привычки every_other_day (ГГГГ-ММ-ДД); для остальных игнорируется",
    )
    reminder_time: str | None = Field(
        None, description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания"
    )
    color: str = Field(DEFAULT_HABIT_COLOR, description="Цвет (тема) привычки — ключ палитры")
    times_per_day: int = Field(
        1, description=f"Сколько раз в день нужно выполнить привычку: 1–{MAX_TIMES_PER_DAY}"
    )
    auto_mark: bool = Field(
        False,
        description="«Автоотметка» (экран привычки); при times_per_day > 1 не действует",
    )


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
    checkin_reminder_time: str | None = Field(
        None,
        description="Напоминание «Пора отметить привычки»: «ЧЧ:ММ» в поясе пользователя; "
        "null — выключено",
    )
    checkin_reminder_days: list[str] = Field(
        default_factory=list,
        description="Дни недели напоминания (mon..sun); помнятся и при выключенном",
    )
    telegram_notifications: bool = Field(
        True,
        description="«Уведомления» в Mini App: бот присылает напоминания и рассылки в Telegram",
    )
    is_admin: bool = Field(
        False, description="Администратор: в настройках виден вход в админ-панель"
    )


class CheckinReminderUpdate(BaseModel):
    """Напоминание «Пора отметить привычки» в `PUT /settings`."""

    time: str | None = Field(..., description="«ЧЧ:ММ» в поясе пользователя; null — выключить")
    days: list[str] = Field(..., description="Дни недели (mon..sun), хотя бы один")


class SettingsUpdate(BaseModel):
    """Запрос `PUT /settings` — частичное обновление (передаются только меняемые поля)."""

    timezone: str | None = Field(None, description="Новый пояс: имя IANA или «UTC±N»")
    timezone_city: int | None = Field(
        None, description="Новый пояс городом — id в справочнике (вместо `timezone`)"
    )
    language: str | None = Field(None, description="Язык интерфейса: ru, en")
    theme: str | None = Field(None, description="Тема оформления: light, dark, system")
    mark_yesterday: bool | None = Field(None, description="Отмечать за вчера")
    checkin_reminder: CheckinReminderUpdate | None = Field(
        None, description="Напоминание «Пора отметить привычки» — время и дни целиком"
    )
    telegram_notifications: bool | None = Field(
        None, description="Напоминания и рассылки от бота в Telegram"
    )


# --------------------------------------------------------------------------- #
#  Синхронизация изменений с устройства (POST /sync)
# --------------------------------------------------------------------------- #

# Id устройства для привычки, которую оно создало само (см. SyncCreate).
ClientRef = Annotated[str, Field(min_length=1, max_length=CLIENT_REF_MAX_LENGTH)]
# Привычка в операции: id на сервере или id, который дало ей устройство при создании.
TaskRef = Annotated[int, Field(ge=1, le=MAX_DB_INT)] | ClientRef


class SyncMark(BaseModel):
    """Отметить (`done: true`) или снять отметку выполнения привычки за день `date`.

    У привычки «несколько раз в день» `count` — сколько раз она выполнена за день (`done`
    — набрано ли `times_per_day`); без `count` — обычная отметка."""

    type: Literal["mark"]
    task: TaskRef
    date: date
    done: bool
    count: int | None = Field(None, ge=0, le=MAX_TIMES_PER_DAY)


class SyncFreeze(BaseModel):
    """Заморозить (`frozen: true`) привычку с дня `date` или разморозить — `date` уже
    обычный день. Повтор (уже заморожена / не заморожена) ничего не меняет."""

    type: Literal["freeze"]
    task: TaskRef
    date: date
    frozen: bool


class SyncCreate(BaseModel):
    """Создать привычку; `ref` — её id на устройстве (повтор с тем же `ref` — не дубль)."""

    type: Literal["create"]
    ref: ClientRef
    habit: HabitCreate


class SyncUpdate(BaseModel):
    """Изменить привычку — все поля формы, как `PUT /tasks/{id}`."""

    type: Literal["update"]
    task: TaskRef
    habit: HabitCreate


class SyncDelete(BaseModel):
    """Удалить привычку (уже удалённая — не ошибка)."""

    type: Literal["delete"]
    task: TaskRef


class SyncSettings(BaseModel):
    """Изменить настройки — как `PUT /settings`."""

    type: Literal["settings"]
    patch: SettingsUpdate


SyncOperation = Annotated[
    SyncMark | SyncFreeze | SyncCreate | SyncUpdate | SyncDelete | SyncSettings,
    Field(discriminator="type"),
]


class SyncRequest(BaseModel):
    """Запрос `POST /sync`: изменения, сделанные на устройстве, по порядку (может быть
    пустым — тогда это просто загрузка актуального состояния)."""

    ops: list[SyncOperation] = Field(default_factory=list, max_length=SYNC_MAX_OPS)


class SyncError(BaseModel):
    code: str
    message: str


class SyncResult(BaseModel):
    """Итог одной операции: применена (`ok`) или нет (`error` — почему)."""

    ok: bool
    # Созданная привычка — её id на сервере.
    id: int | None = None
    error: SyncError | None = None


class SyncResponse(BaseModel):
    """Ответ `POST /sync`: итог каждой операции (в том же порядке) и состояние после них."""

    results: list[SyncResult]
    habits: list[Habit]
    settings: SettingsResponse
    today: date = Field(
        ..., description="День отметки — последний день `history` каждой привычки"
    )


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


class UserReview(BaseModel):
    """Отзыв пользователя в его истории отзывов и последний ответ администратора."""

    id: int
    text: str
    created_at: UtcDateTime
    reply_text: str | None = None
    replied_at: UtcDateTime | None = None


class ReviewsResponse(BaseModel):
    """Ответ `GET /reviews`: отзывы пользователя, новые сначала."""

    reviews: list[UserReview]


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
    is_test: bool = Field(False, description="Тестовый аккаунт")


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
    telegram_notifications: bool = Field(
        True, description="Получает от бота напоминания и рассылки («Уведомления» в Mini App)"
    )
    is_admin: bool
    habits: int = Field(..., description="Активных привычек")
    reviews: list[AdminReview]
    # --- Сводка аналитики ---
    source: str = Field("direct", description="Откуда пришёл; direct — без метки")
    source_tag: str | None = Field(None, description="Подпись ссылки (номер поста)")
    platform: Literal["telegram", "web"] = "telegram"
    device: str | None = Field(None, description="ios / android / desktop")
    is_test: bool = Field(False, description="Тестовый аккаунт — не входит в аналитику")
    status: Literal["active", "not_opened", "churned", "bot_blocked", "uninstalled"] = "active"
    activated: bool | None = Field(None, description="Активирован; null — окно ещё идёт")
    live: bool = False
    current_streak: int = 0
    best_streak: int = 0
    checkin_days: int = Field(0, description="Сколько разных дней отмечал привычки")
    completion_30d: float | None = Field(None, description="Доля выполнения за 30 дней")
    last_checkin: date | None = None


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


# --------------------------------------------------------------------------- #
#  Аналитика админ-панели (/admin/analytics/*, backend/analytics/)
# --------------------------------------------------------------------------- #
#
# Доли — от 0 до 1 (null — делить не на что), дни — «ГГГГ-ММ-ДД» по Алматы. У цифр с
# изменением к прошлому периоду `previous` — значение за такой же период до этого (null —
# у «всего времени» его нет).


class Metric(BaseModel):
    """Цифра и она же за прошлый такой же период."""

    value: float | None
    previous: float | None = None


class DayValue(BaseModel):
    date: date
    value: float | None


class AnalyticsMeta(BaseModel):
    """Общее у всех разделов: период, фильтр, источники для фильтра и с какого момента
    собираются новые данные (null — с самого начала)."""

    period: str
    start: date | None
    end: date
    generated_at: UtcDateTime
    tracking_since: UtcDateTime | None
    sources: list[str]
    activation_window_days: int
    activation_min_days: int


class SummaryToday(BaseModel):
    opened: int
    checked_in: int
    online: int
    opened_yesterday: int
    checked_in_yesterday: int


class ChangeItem(BaseModel):
    """Заметное изменение для блока «Что изменилось» (текст собирает фронтенд)."""

    kind: Literal["new_users", "activation", "blocked", "live", "d7", "inactive"]
    current: float
    previous: float
    source: str | None = Field(None, description="Источник, который дал больше всего изменения")


class AnalyticsSummary(BaseModel):
    """`GET /admin/analytics/summary` — главный экран."""

    meta: AnalyticsMeta
    live: Metric
    live_weeks: list[DayValue] = Field(..., description="«Живые» в конце каждой из 8 недель")
    new_users: Metric
    activation: Metric
    activation_pending: int = Field(..., description="Новые, у кого окно активации ещё идёт")
    d7: Metric
    d7_cohort: int
    today: SummaryToday
    blocked_bot: Metric
    became_inactive: Metric
    uninstalled: Metric
    changes: list[ChangeItem]


class FunnelStep(BaseModel):
    key: str
    users: int
    from_previous: float | None
    from_start: float | None
    # Обычно проходит до следующего шага (медиана), минут; null — не считается.
    median_minutes_to_next: float | None = None
    # Можно ли открыть людей шага (у шагов страницы установки людей ещё нет).
    people: bool = True


class FunnelSourceRow(BaseModel):
    source: str
    steps: list[int]


class FunnelReport(BaseModel):
    platform: Literal["telegram", "web"]
    steps: list[FunnelStep]
    by_source: list[FunnelSourceRow]


class AnalyticsFunnelResponse(BaseModel):
    """`GET /admin/analytics/funnel`."""

    meta: AnalyticsMeta
    funnels: list[FunnelReport]


class RetentionWeek(BaseModel):
    start: date
    size: int
    cells: list[float | None] = Field(..., description="Доля активных на неделе 0, 1, …")


class RetentionCurve(BaseModel):
    key: str
    size: int
    points: list[float | None] = Field(..., description="Доля активных на день 0…30")


class LeaveBucket(BaseModel):
    key: str
    users: int


class AnalyticsRetentionResponse(BaseModel):
    """`GET /admin/analytics/retention`."""

    meta: AnalyticsMeta
    basis: Literal["open", "checkin"]
    weeks: list[RetentionWeek]
    curves: list[RetentionCurve]
    d1: Metric
    d7: Metric
    d30: Metric
    leave: list[LeaveBucket]
    still_active: int


class ReturnReason(BaseModel):
    key: str
    users: int


class AnalyticsChurnResponse(BaseModel):
    """`GET /admin/analytics/churn`."""

    meta: AnalyticsMeta
    blocked: Metric
    blocked_days: list[DayValue]
    blocked_had_habit: int
    blocked_activated: int
    inactive_total: int
    became_inactive: Metric
    inactive_buckets: list[LeaveBucket]
    uninstalled_total: int
    uninstalled: Metric
    returned: Metric
    return_reasons: list[ReturnReason]
    groups: list[LeaveBucket]


class NamedCount(BaseModel):
    key: str
    name: str
    users: int
    habits: int = 0


class AnalyticsHabitsResponse(BaseModel):
    """`GET /admin/analytics/habits`."""

    meta: AnalyticsMeta
    average: float | None
    with_habits: int
    without_habits: int
    per_user: list[LeaveBucket]
    top_names: list[NamedCount]
    frequency: list[LeaveBucket]
    total_habits: int
    with_reminder: int
    reminder_hours: list[int]
    deleted: Metric
    deleted_median_days: float | None
    deleted_first_week: float | None
    deleted_top: list[NamedCount]
    streaks_current: list[LeaveBucket]
    streaks_best: list[LeaveBucket]
    streak_7: int
    streak_30: int
    streak_100: int
    longest_streak: int
    completion: Metric
    completion_days: list[DayValue]
    completion_weekdays: list[float | None] = Field(..., description="Пн…Вс")
    checkin_hours: list[int] = Field(..., description="Отметок по часам (время пользователя)")
    features: list[NamedCount]
    app_users: int


class SourceRow(BaseModel):
    source: str
    tag: str | None
    new_users: int
    opened_rate: float | None
    activated_rate: float | None
    d7_rate: float | None
    live: int


class AnalyticsSourcesResponse(BaseModel):
    """`GET /admin/analytics/sources`."""

    meta: AnalyticsMeta
    rows: list[SourceRow]
    platforms: list[LeaveBucket]
    devices: list[LeaveBucket]
    languages: list[LeaveBucket]
    timezones: list[NamedCount]
    web_users: int
    web_linked: int
    cohort: int


class BroadcastStats(BaseModel):
    id: int
    created_at: UtcDateTime
    text: str | None
    media_type: str | None
    audience: str
    button: str | None
    total: int
    sent: int
    failed: int
    tracked: bool = Field(..., description="Есть данные о получателях (рассылка после начала сбора)")
    opened_24h: int
    opened_72h: int
    checked_72h: int
    blocked_24h: int
    button_opens: int


class AnalyticsMessagingResponse(BaseModel):
    """`GET /admin/analytics/messaging` — напоминания, рассылки, предложение установки."""

    meta: AnalyticsMeta
    reminders_telegram: int
    reminders_push: int
    reminders_failed: int
    reminders_followed: float | None
    reminder_opens: int
    reminder_open_users: int
    push_opens: int
    with_reminders: int
    without_reminders: int
    live_with: float | None
    live_without: float | None
    d7_with: float | None
    d7_without: float | None
    broadcasts: list[BroadcastStats]
    offer_shown: int
    offer_clicked: int
    offer_installed: int
    prompt_shown: int
    prompt_accepted: int
    prompt_installed: int


class SegmentCreate(BaseModel):
    """`POST /admin/segments` — люди за цифрой аналитики (metric — см. analytics/people.py)."""

    metric: str = Field(..., max_length=64)
    arg: str | None = Field(None, max_length=64)
    period: str = Field("30", max_length=8)
    platform: str | None = Field(None, max_length=16)
    source: str | None = Field(None, max_length=32)
    basis: str | None = Field(None, max_length=16)
    title: str = Field(..., max_length=SEGMENT_TITLE_MAX_LENGTH)


class SegmentInfo(BaseModel):
    id: int
    title: str
    count: int


class AnalyticsConfig(BaseModel):
    """Пороги активации (настройки панели) и данные для генератора ссылок."""

    activation_window_days: int
    activation_min_days: int
    bot_username: str | None
    web_url: str
    sources: list[str]


class AnalyticsConfigUpdate(BaseModel):
    activation_window_days: int = Field(..., ge=1, le=ACTIVATION_WINDOW_MAX_DAYS)
    activation_min_days: int = Field(..., ge=1, le=ACTIVATION_WINDOW_MAX_DAYS)


class TimelineItem(BaseModel):
    at: UtcDateTime
    kind: str
    detail: str | None = None
    habit: str | None = Field(None, description="Название привычки, если действие о ней")


class TimelinePage(BaseModel):
    items: list[TimelineItem]
    next_offset: int | None


class AdminTestUpdate(BaseModel):
    """Запрос `PUT /admin/users/{id}/test`."""

    is_test: bool


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

    provider: Literal["telegram"]
    linked: bool
    # What it is linked as: @username or name; null — not linked.
    label: str | None = None


class AccountResponse(BaseModel):
    """Settings → Account: logins, whether the account is still a guest, when it was
    created and on how many devices the web app is logged in to it."""

    user_id: int
    is_guest: bool
    has_habits: bool
    logins: list[AccountLogin]
    # Registration time.
    created_at: UtcDateTime
    # Live web app sessions of the account (the current one included).
    devices: int


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
    """A one-time token or code from a link."""

    token: str = Field(..., min_length=1, max_length=256)


class HandoffRedeem(TokenRequest):
    """`POST /auth/handoff/redeem`: the handoff token; `merge` — the user agreed to move
    this device's guest habits into the link's account (asked after 409 `handoff_merge`)."""

    merge: bool = False


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


class WebConfig(BaseModel):
    """Public settings the web app needs."""

    vapid_public_key: str | None
    telegram_bot_username: str | None
    # Numeric bot id for Telegram's web login (public: it is the bot's user id).
    telegram_bot_id: int | None


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
    everywhere: bool = Field(
        default=False, description="Log out on every device: all web sessions, all push"
    )


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
