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
    HABIT_DESCRIPTION_MAX_LENGTH,
    HISTORY_DAYS,
    MAX_DB_INT,
    NOTE_MAX_LENGTH,
    MAX_HABITS_PER_USER,
    MAX_REMINDERS_PER_HABIT,
    MAX_TIMES_PER_DAY,
    OVERTIME_MAX_COUNT,
    SEGMENT_TITLE_MAX_LENGTH,
    SYNC_MAX_OPS,
)


def _assume_utc(value: datetime) -> datetime:
    """Время из базы — UTC без пояса; в ответе у него явный пояс («…Z»), иначе браузер
    прочитает его как местное."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# Момент времени в ответе API — всегда с поясом UTC.
UtcDateTime = Annotated[datetime, AfterValidator(_assume_utc)]


class SchedulePeriod(BaseModel):
    """Прежнее расписание привычки: действовало до дня `until` (не включая его)."""

    until: date = Field(..., description="Первый день следующего расписания")
    frequency_type: Literal["daily", "specific_days", "every_other_day", "monthly", "flexible"]
    days: list[str] = Field(default_factory=list, description="Дни недели для specific_days")
    start_date: date | None = None
    period: Literal["week", "month", "year"] | None = None
    period_times: int | None = None
    times_per_day: int = 1
    overtime: bool = Field(False, description="«Сверх плана» в дни этого расписания")


class GroupMember(BaseModel):
    """Участник совместной привычки — как он выглядит в списке «Участники»."""

    user_id: int
    name: str = Field(..., description="@username, если есть, иначе имя из Telegram")
    is_me: bool
    is_owner: bool
    done: bool = Field(..., description="Выполнил ли свою часть в день отметки")
    count: int = Field(0, description="Сколько раз выполнил в день отметки (до цели)")
    frozen: bool = Field(False, description="Заморожен в день отметки — не в счёт")
    period_done: int = Field(
        0,
        description=(
            "«Гибкий график»: сколько дней он выполнил в своём текущем периоде (иначе 0)"
        ),
    )
    photo: str | None = Field(
        None,
        description=(
            "Версия фото профиля в Telegram (меняется вместе с фото; картинка — "
            "GET /groups/{id}/members/{user_id}/photo); null — фото нет, рисуется буква"
        ),
    )


class BannedMember(BaseModel):
    """Исключённый участник в чёрном списке групповой привычки."""

    user_id: int
    name: str = Field(..., description="@username, если есть, иначе имя из Telegram")
    photo: str | None = Field(
        None, description="Версия фото профиля, как у GroupMember; null — рисуется буква"
    )


class HabitGroupView(BaseModel):
    """Совместная привычка с точки зрения участника (backend/groups.py)."""

    id: int
    is_owner: bool = Field(..., description="Я — владелец: меняю общие поля, исключаю")
    notify_marks: bool = Field(False, description="«Отметки участников» включены")
    members: list[GroupMember] = Field(
        default_factory=list, description="Активные участники по времени вступления"
    )
    banned: list[BannedMember] = Field(
        default_factory=list,
        description=(
            "Чёрный список (только владельцу, остальным пустой): исключённые — по ссылке "
            "не вступят, пока владелец их оттуда не уберёт"
        ),
    )
    others_history: list[bool] = Field(
        default_factory=list,
        description=(
            "За те же дни, что `history`: выполнили ли свою часть все остальные, кто тогда "
            "был в группе и не был заморожен (дни вне моего участия — true). День группы "
            "= моя отметка и это"
        ),
    )
    others_next_day: bool = Field(
        False, description="То же за день после дня отметки («Отмечать за вчера»)"
    )
    others_units: list[int] = Field(
        default_factory=list,
        description=(
            "За те же дни, что `history`: сколько раз выполнили остальные, кто тогда был в "
            "группе и не был заморожен (каждый — не больше цели)"
        ),
    )
    people: list[int] = Field(
        default_factory=list,
        description="За те же дни: сколько человек было в счёт вместе со мной (вне моего участия — 1)",
    )
    fill_history: list[float] = Field(
        default_factory=list,
        description=(
            "За те же дни: доля дня, выполненная всеми, 0…1 — (остальные + я) / (люди × цель); "
            "ей закрашиваются сетка и календарь"
        ),
    )
    open_from: date | None = Field(
        None,
        description=(
            "С этого дня дни ещё не закончились у кого-то из участников (пояса): не "
            "выполненные группой, они серию не рвут"
        ),
    )
    others_reached: bool = Field(
        True,
        description=(
            "«Гибкий график»: остальные участники (бывшие в группе весь мой текущий период) "
            "уже набрали в нём цель — тогда период засчитают, когда наберу я"
        ),
    )


class Habit(BaseModel):
    """Привычка пользователя: расписание, история выполнения и статистика серий."""

    id: int = Field(..., description="Идентификатор задачи")
    name: str = Field(..., description="Название привычки")
    description: str | None = Field(
        None, description="Описание привычки (серым под названием); null — без описания"
    )
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
    frequency_type: Literal["daily", "specific_days", "every_other_day", "monthly", "flexible"] = Field(
        ..., description="Каждый день, дни недели, через день, раз в месяц или «Гибкий график»"
    )
    days: list[str] = Field(
        ...,
        description="Коды дней недели (mon..sun) для specific_days; для остальных — пустой список",
    )
    start_date: date | None = Field(
        None,
        description="Первый день привычки every_other_day (дальше — каждый второй) или monthly (дальше — то же число каждого месяца); иначе null",
    )
    period: Literal["week", "month", "year"] | None = Field(
        None,
        description=(
            "«Гибкий график» (flexible): календарный период — неделя с понедельника, месяц с "
            "1-го, год с 1 января; иначе null"
        ),
    )
    period_times: int | None = Field(
        None,
        description=(
            "«Гибкий график»: сколько дней за период выполнить (в более коротком периоде — "
            "не больше его дней); иначе null"
        ),
    )
    period_done: int = Field(
        0,
        description=(
            "«Гибкий график»: сколько дней выполнено в текущем периоде (по день отметки), "
            "в совместной — мной; иначе 0"
        ),
    )
    prior_streak: int = Field(
        0,
        description=(
            "«Гибкий график»: серия (в периодах) по закончившимся периодам — без текущего; "
            "набрана цель текущего — серия на 1 больше"
        ),
    )
    prior_best: int = Field(
        0, description="«Гибкий график»: лучшая серия по закончившимся периодам"
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
        description="Первое (самое раннее) напоминание «ЧЧ:ММ» в поясе пользователя; null — без напоминания",
    )
    reminder_times: list[str] = Field(
        default_factory=list,
        description="Все напоминания «ЧЧ:ММ» по возрастанию; пустой список — без напоминания",
    )
    color: str = Field(
        ...,
        description="Цвет (тема) привычки — ключ палитры (blue, green, …) или свой «#rrggbb»",
    )
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
            "напоминаниями — сразу после последнего (только при times_per_day = 1)"
        ),
    )
    overtime: bool = Field(
        False,
        description=(
            "«Сверх плана»: счёт идёт вверх, после цели можно отмечать ещё (до "
            "OVERTIME_MAX_COUNT); только при times_per_day > 1"
        ),
    )
    history_counts: list[int] = Field(
        default_factory=list,
        description=(
            "Сколько раз привычка выполнена в каждый день `history` (у привычек «несколько "
            "раз в день»; у остальных — пустой список): неполный день сетка закрашивает "
            "долей цвета. Серии и счётчики считают только выполненные дни"
        ),
    )
    next_day_done: bool = Field(
        False,
        description=(
            "Выполнен ли день после `today` — в режиме «Отмечать за вчера» это календарный "
            "сегодня (иначе всегда false): выключили режим — приложение сразу видит "
            "сегодняшние отметки"
        ),
    )
    next_day_count: int = Field(
        0, description="Сколько раз выполнена в тот же день (привычка «несколько раз в день»)"
    )
    created_on: date | None = Field(
        None,
        description=(
            "День создания привычки в поясе пользователя: с него сетка в «Виде серий» "
            "fixed начинается с левого верхнего кружка"
        ),
    )
    started_on: date | None = Field(
        None,
        description=(
            "Первый день привычки: самая ранняя отметка или первый день заморозки — что "
            "раньше (может быть старше `history`); null — ни отметок, ни заморозок. С него "
            "начинается сетка «Вида сетки» fixed"
        ),
    )
    auto_mark_ahead: bool = Field(
        True,
        description=(
            "За календарный сегодня (в режиме «Отмечать за вчера» — день после `today`) "
            "записи ещё нет: ни отметки, ни снятой отметки. Приложение по нему само "
            "показывает автоотметку, когда ей пора, — не дожидаясь бота"
        ),
    )
    schedule_history: list[SchedulePeriod] = Field(
        default_factory=list,
        description=(
            "Прежние расписания по возрастанию `until`: каждое — с `until` предыдущего (первое"
            " — с самого начала). Прошлые дни оцениваются по расписанию того дня; после "
            "последнего — текущее"
        ),
    )
    notes: dict[date, str] = Field(
        default_factory=dict,
        description="Заметки к дням `history` (окно дня в календаре): день → текст",
    )
    group: HabitGroupView | None = Field(
        None,
        description=(
            "Совместная привычка; null — обычная. В совместной `history`, серии и "
            "`total_done` — по дням, выполненным всеми, а `done_today`, `today_count` и "
            "`history_counts` (при любой цели: выполненный день — цель) — моя часть"
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
    description: str | None = Field(
        None,
        description=(
            f"Описание привычки (до {HABIT_DESCRIPTION_MAX_LENGTH} символов); пустая строка "
            "— без описания. Не передано (null) — при изменении остаётся прежнее (старые "
            "клиенты не знают описания)"
        ),
    )
    frequency_type: Literal["daily", "specific_days", "every_other_day", "monthly", "flexible"] = Field(
        ..., description="Каждый день, дни недели, через день, раз в месяц или «Гибкий график»"
    )
    days: list[str] = Field(
        default_factory=list,
        description="Коды дней недели (mon..sun) для specific_days; для остальных игнорируется",
    )
    start_date: date | None = Field(
        None,
        description="Первый день привычки every_other_day или monthly (ГГГГ-ММ-ДД); для остальных игнорируется",
    )
    period: str | None = Field(
        None, description="«Гибкий график»: week / month / year; для остальных игнорируется"
    )
    period_times: int | None = Field(
        None,
        description=(
            "«Гибкий график»: сколько дней за период — неделя 1–7, месяц 1–31, год 1–366; "
            "для остальных игнорируется"
        ),
    )
    reminder_time: str | None = Field(
        None, description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания"
    )
    reminder_times: list[str] | None = Field(
        None,
        description=(
            f"Все напоминания «ЧЧ:ММ» (до {MAX_REMINDERS_PER_HABIT}); пустой список — без "
            "напоминания. Не передан — одно напоминание `reminder_time` (старые клиенты)"
        ),
    )
    color: str = Field(
        DEFAULT_HABIT_COLOR, description="Цвет (тема) привычки — ключ палитры или свой «#rrggbb»"
    )
    times_per_day: int = Field(
        1, description=f"Сколько раз в день нужно выполнить привычку: 1–{MAX_TIMES_PER_DAY}"
    )
    auto_mark: bool = Field(
        False,
        description="«Автоотметка» (экран привычки); при times_per_day > 1 не действует",
    )
    overtime: bool = Field(
        False,
        description="«Сверх плана»: после цели можно отмечать ещё; при times_per_day = 1 не действует",
    )
    shared: bool | None = Field(
        None,
        description=(
            "«Групповая привычка» (только с Telegram): true — групповая (владелец — "
            "пользователь, автоотметки нет), false — обычная (выключить можно, только пока в "
            "ней никого, кроме него, иначе group_has_members); null — при изменении как была"
        ),
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
    grid_layout: str = Field(
        "rolling",
        description=(
            "«Вид серий»: rolling — сегодня в правом нижнем кружке сетки, дни сдвигаются; "
            "fixed — с дня создания привычки от левого верхнего кружка, без сдвига; "
            "calendar — по месяцам, ряд — день недели, кружок — дата"
        ),
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
    folder_swipe: bool = Field(
        False, description="«Переключение свайпом»: свайп по списку привычек — соседняя папка"
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
    grid_layout: str | None = Field(None, description="Вид серий: rolling, fixed, calendar")
    checkin_reminder: CheckinReminderUpdate | None = Field(
        None, description="Напоминание «Пора отметить привычки» — время и дни целиком"
    )
    telegram_notifications: bool | None = Field(
        None, description="Напоминания и рассылки от бота в Telegram"
    )
    folder_swipe: bool | None = Field(None, description="Переключение папок свайпом")


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
    — набрано ли `times_per_day`; больше цели — только у «Сверх плана»); без `count` —
    обычная отметка."""

    type: Literal["mark"]
    task: TaskRef
    date: date
    done: bool
    count: int | None = Field(None, ge=0, le=OVERTIME_MAX_COUNT)


class SyncNote(BaseModel):
    """Заметка к дню `date` привычки; пустой `text` — удалить заметку."""

    type: Literal["note"]
    task: TaskRef
    date: date
    # С запасом на пробелы, которые проверка уберёт (validation.validate_note).
    text: str = Field(..., max_length=NOTE_MAX_LENGTH * 2)


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


# Папка в операции: id на сервере или id, который дало ей устройство при создании.
FolderRef = Annotated[int, Field(ge=1, le=MAX_DB_INT)] | ClientRef


class FolderInput(BaseModel):
    """Поля папки (форма папки): название и привычки в ней."""

    name: str = Field(..., description="Название папки")
    habits: list[TaskRef] = Field(
        default_factory=list,
        max_length=MAX_HABITS_PER_USER,
        description="Привычки в папке (id или id устройства); удалённые пропускаются",
    )
    types: list[Literal["group", "personal", "frozen", "unscheduled"]] = Field(
        default_factory=list,
        max_length=8,
        description="Типы привычек (constants.FOLDER_HABIT_TYPES): все привычки типа — "
        "в папке, и новые тоже",
    )
    kind: Literal["unfinished", "today"] | None = Field(
        None,
        description="Рекомендуемая папка (constants.FOLDER_KINDS): наполняется сама, "
        "`habits` и `types` не читаются; при изменении папки вид не меняется",
    )


class SyncFolderCreate(BaseModel):
    """Создать папку (последней); `ref` — её id на устройстве (повтор — не дубль)."""

    type: Literal["folder_create"]
    ref: ClientRef
    folder: FolderInput


class SyncFolderUpdate(BaseModel):
    """Изменить папку — название и привычки целиком."""

    type: Literal["folder_update"]
    key: FolderRef
    folder: FolderInput


class SyncFolderDelete(BaseModel):
    """Удалить папку (уже удалённая — не ошибка)."""

    type: Literal["folder_delete"]
    key: FolderRef


class SyncFolderOrder(BaseModel):
    """Порядок папок; null — место папки «Все привычки». Папки, которых нет в списке,
    встают в конец."""

    type: Literal["folder_order"]
    order: list[FolderRef | None] = Field(..., max_length=SYNC_MAX_OPS)


SyncOperation = Annotated[
    SyncMark
    | SyncNote
    | SyncFreeze
    | SyncCreate
    | SyncUpdate
    | SyncDelete
    | SyncSettings
    | SyncFolderCreate
    | SyncFolderUpdate
    | SyncFolderDelete
    | SyncFolderOrder,
    Field(discriminator="type"),
]


class GroupInviteResponse(BaseModel):
    """Ссылка-приглашение совместной привычки."""

    group_id: int
    invite_url: str = Field(..., description="t.me/<бот>?start=join_<код>")


class GroupMemberHabitResponse(BaseModel):
    """Ответ `GET /groups/{id}/members/{user_id}` — страница участника: его привычка по
    его отметкам, как обычная (без группы и без его напоминаний)."""

    habit: Habit
    day: date = Field(..., description="День отметки участника — последний день `history`")


class GroupKickRequest(BaseModel):
    """Запрос `POST /groups/{id}/kick` — исключить участника (только владелец)."""

    user_id: int = Field(..., ge=1, le=MAX_DB_INT)


class GroupUnbanRequest(BaseModel):
    """Запрос `POST /groups/{id}/unban` — убрать из чёрного списка (только владелец)."""

    user_id: int = Field(..., ge=1, le=MAX_DB_INT)


class GroupNotifyRequest(BaseModel):
    """Запрос `POST /groups/{id}/notify` — «Отметки участников»."""

    on: bool


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


class Folder(BaseModel):
    """Папка привычек."""

    id: int
    name: str
    habits: list[int] = Field(
        ...,
        description="Id привычек в папке — в порядке списка привычек; у рекомендуемой пуст",
    )
    types: list[str] = Field(
        default_factory=list,
        description="Типы привычек в папке (group, personal, frozen, unscheduled); их "
        "привычки считает устройство",
    )
    kind: str | None = Field(None, description="Рекомендуемая папка (unfinished, today) или null")


class SyncResponse(BaseModel):
    """Ответ `POST /sync`: итог каждой операции (в том же порядке) и состояние после них."""

    results: list[SyncResult]
    habits: list[Habit]
    settings: SettingsResponse
    folders: list[Folder] = Field(default_factory=list, description="Папки по порядку")
    all_habits_position: int = Field(
        0, description="Место папки «Все привычки» среди папок (сколько папок перед ней)"
    )
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
    uses_telegram: bool = Field(False, description="Открывал Mini App")
    uses_web: bool = Field(False, description="Заходил в веб-приложение")


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
    # --- Где пользуется ---
    uses_telegram: bool = Field(False, description="Открывал Mini App")
    uses_web: bool = Field(False, description="Заходил в веб-приложение")
    telegram_seen_at: UtcDateTime | None = Field(None, description="Последний раз в Mini App")
    web_seen_at: UtcDateTime | None = Field(None, description="Последний раз в веб-приложении")
    push: bool = Field(False, description="Включены push-уведомления веб-приложения")


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


class OverviewNewDay(BaseModel):
    """Пришли за день — по платформе, где появились."""

    date: date
    telegram: int
    web: int


class OverviewActivityDay(BaseModel):
    """Заходили и отмечали привычки за день."""

    date: date
    opened: int
    checked: int


class AnalyticsOverview(BaseModel):
    """`GET /admin/analytics/overview` — главный экран аналитики: только основное, без
    фильтров. `counts` — сколько людей в каждой группе (ключи и люди за ними —
    analytics/overview.py, OVERVIEW_GROUPS)."""

    generated_at: UtcDateTime
    counts: dict[str, int]
    habits: int = Field(..., description="Привычек сейчас (активных) у всех пользователей")
    alive_week_ago: int = Field(..., description="Живых неделю назад")
    alive_by_day: list[DayValue] = Field(..., description="Живых на каждый из 30 дней")
    new_by_day: list[OverviewNewDay] = Field(..., description="Последние 30 дней")
    activity_by_day: list[OverviewActivityDay] = Field(..., description="Последние 30 дней")


class OverviewGroupMoves(BaseModel):
    """Живые: кто за неделю стал живым и кто перестал (сейчас против недели назад)."""

    joined: int
    left: int


class AnalyticsOverviewGroup(BaseModel):
    """`GET /admin/analytics/overview/{group}` — подробности цифры «Обзора»: из чего
    складывается группа (analytics/overview.py, group_details)."""

    group: str
    users: int
    all_users: int
    trend_kind: str | None = Field(
        None, description="Что на графике: alive, new, total, opened, checked; нет — None"
    )
    trend: list[DayValue] = Field(default_factory=list, description="Последние 30 дней")
    moves: OverviewGroupMoves | None = None
    platforms: list[LeaveBucket] = Field(..., description="telegram, both, web, bot")
    sources: list[LeaveBucket] = Field(..., description="Источник → людей, по убыванию")
    joined: list[LeaveBucket] = Field(..., description="Давность прихода: week, month, quarter, older")
    habits: list[LeaveBucket] = Field(..., description="Привычек у человека: 0, 1, 2-3, 4+")
    last_seen: list[LeaveBucket] = Field(
        ..., description="Последний заход: today, week, month, older, never"
    )
    checked: list[LeaveBucket] = Field(
        ..., description="Дней с отметками за 7 прошедших дней: 0, 1-2, 3-5, 6-7"
    )


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
    """`GET /admin/analytics/messaging` — напоминания, рассылки, окно установки браузера."""

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
        default=False,
        description="Log out on every other device (from the Mini App — on all of them)",
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
