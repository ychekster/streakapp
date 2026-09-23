"""Прикладная логика API поверх репозитория.

Доступ к данным идёт только через `Repository` — SQL здесь не пишется. Этот слой
собирает из задач и их логов форму ответа (`Habit`) вместе со статистикой серий,
создаёт и изменяет привычки, применяет переключение отметки за сегодня, работает с
настройками пользователя, принимает отзывы и определяет, чьи напоминания пора прислать
(для бота). Логика админ-панели — в admin.py и analytics.py.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import pytz

from tma.backend import validation
from tma.backend.constants import (
    DEFAULT_LANGUAGE,
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    MAX_HABITS_PER_USER,
    MAX_REVIEWS_PER_DAY,
    REMINDER_TIME_FORMAT,
    TIMEZONE_SEARCH_LIMIT,
)
from tma.backend.errors import ApiError
from tma.backend.models import FrequencyType, Task, TaskStatus, User
from tma.backend.repository import Repository, utc_now
from tma.backend.schedule import due_weekdays, is_due_on, task_days
from tma.backend.schemas import (
    Habit,
    HabitCreate,
    MetaResponse,
    ReviewCreate,
    ReviewCreated,
    SettingsResponse,
    SettingsUpdate,
    TimezoneEntry,
    TimezonesResponse,
)
from tma.backend.timezones import (
    ZoneEntry,
    search_timezones,
    selected_city,
    timezone_catalog,
    timezone_display,
    utc_label,
)


def resolve_timezone(timezone_name: str | None) -> pytz.BaseTzInfo:
    """Часовой пояс пользователя (UTC как фолбэк при пустом/неизвестном значении).

    «Сегодня» считается в личном поясе пользователя.
    """
    try:
        return pytz.timezone(timezone_name) if timezone_name else pytz.utc
    except Exception:  # noqa: BLE001 — неизвестная зона не должна ронять запрос
        return pytz.utc


def user_today(user: User) -> date:
    """День отметки — «сегодня» приложения: текущая дата в поясе пользователя, а в
    режиме «Отмечать за вчера» — вчерашняя.

    От него считается всё: какой день отмечает кнопка, запланирована ли на него
    привычка, где кончаются история и серии. Отметки за настоящее «сегодня» в режиме
    «за вчера» не видны до завтра — тогда они станут вчерашними.
    """
    today = datetime.now(resolve_timezone(user.timezone)).date()
    return today - timedelta(days=1) if user.mark_yesterday else today


def language_from_telegram(language_code: str | None) -> str:
    """Язык интерфейса нового пользователя по языку его Telegram: русский, если
    Telegram на русском, иначе английский (нет данных — язык по умолчанию)."""
    if not language_code:
        return DEFAULT_LANGUAGE
    return "ru" if language_code.lower().startswith("ru") else "en"


def build_history(done_dates: set[date], today: date) -> list[bool]:
    """История выполнения за последние `HISTORY_DAYS` дней (старое → сегодня).

    True — день есть среди выполненных, иначе False.
    """
    start = today - timedelta(days=HISTORY_DAYS - 1)
    return [(start + timedelta(days=offset)) in done_dates for offset in range(HISTORY_DAYS)]


def compute_streaks(task: Task, done_dates: set[date], today: date) -> tuple[int, int]:
    """Текущая и лучшая серии выполнения (в днях).

    Серия — подряд идущие выполненные дни. Прерывает её только пропущенный
    запланированный день: незапланированные дни (у привычек «по дням недели») серию
    не рвут, а выполнение в такой день её продолжает. Сегодняшний день ещё не
    закончился, поэтому пока он не отмечен, текущая серия тянется со вчерашнего.
    """
    if not done_dates:
        return 0, 0
    due = due_weekdays(task)
    current = best = 0
    day = min(done_dates)
    while day <= today:
        if day in done_dates:
            current += 1
            best = max(best, current)
        elif day < today and day.weekday() in due:
            current = 0
        day += timedelta(days=1)
    return current, best


def build_habit(task: Task, done_dates: set[date], today: date) -> Habit:
    """Собрать схему `Habit`: расписание, отметка за сегодня, история и статистика серий.

    `done_dates` — даты выполнения по `today` включительно (Repository.get_done_dates):
    отметки «из будущего» (возможны после смены часового пояса на более западный) не
    учитываются ни в сетке, ни в сериях, ни в общем счётчике.
    """
    current_streak, best_streak = compute_streaks(task, done_dates, today)
    return Habit(
        id=task.id,
        name=task.name,
        done_today=today in done_dates,
        scheduled_today=is_due_on(task, today),
        frequency_type=task.frequency_type.value,
        days=task_days(task),
        history=build_history(done_dates, today),
        current_streak=current_streak,
        best_streak=best_streak,
        total_done=len(done_dates),
        reminder_time=(
            task.reminder_time.strftime(REMINDER_TIME_FORMAT)
            if task.reminder_time is not None
            else None
        ),
        color=task.color,
    )


async def _built_habit(repo: Repository, task: Task, today: date) -> Habit:
    """Привычка с отметками из базы (после изменения или отметки)."""
    done = await repo.get_done_dates([task.id], today)
    return build_habit(task, done[task.id], today)


async def list_habits(repo: Repository, user: User) -> list[Habit]:
    """Все активные привычки пользователя с историей и статистикой (для `GET /tasks`).

    Отметки всех привычек читаются одним запросом, а не по запросу на привычку.
    """
    today = user_today(user)
    tasks = await repo.get_active_tasks(user.telegram_id)
    done = await repo.get_done_dates([task.id for task in tasks], today)
    return [build_habit(task, done[task.id], today) for task in tasks]


async def toggle_today(repo: Repository, user: User, task: Task) -> Habit:
    """Переключить отметку выполнения задачи за сегодня и вернуть обновлённую привычку.

    Отметка применяется относительно статуса в БД: `done` ↔ `pending`. Лог за
    сегодня создаётся при необходимости.
    """
    today = user_today(user)
    log = await repo.get_or_create_log(task.id, user.telegram_id, today)
    target = TaskStatus.pending if log.status == TaskStatus.done else TaskStatus.done
    await repo.set_log_status(log, target)
    return await _built_habit(repo, task, today)


@dataclass(frozen=True)
class HabitFields:
    """Проверенные поля формы привычки — в том виде, в каком их хранит `Task`."""

    name: str
    frequency_type: FrequencyType
    days: str | None
    reminder_time: time | None
    color: str


async def _validate_habit_fields(
    repo: Repository, user: User, payload: HabitCreate, task_id: int | None = None
) -> HabitFields:
    """Проверить поля формы привычки (создание и изменение).

    Имя не должно дублировать другую активную привычку пользователя (без учёта
    регистра); `task_id` — изменяемая привычка, сама себе она не дубликат.
    """
    name = validation.validate_name(payload.name)
    frequency_type, days = validation.validate_frequency(
        payload.frequency_type, payload.days
    )
    reminder_time = validation.validate_reminder_time(payload.reminder_time)
    color = validation.validate_color(payload.color)

    if await repo.task_name_exists(user.telegram_id, name, exclude_task_id=task_id):
        raise ApiError(409, "duplicate_name", "Привычка с таким названием уже есть")

    return HabitFields(
        name=name,
        frequency_type=frequency_type,
        days=days,
        reminder_time=reminder_time,
        color=color,
    )


async def create_habit(repo: Repository, user: User, payload: HabitCreate) -> Habit:
    """Создать привычку и вернуть её в форме `Habit` (не больше `MAX_HABITS_PER_USER`)."""
    if await repo.count_active_tasks(user.telegram_id) >= MAX_HABITS_PER_USER:
        raise ApiError(
            409, "habit_limit", f"Можно завести не больше {MAX_HABITS_PER_USER} привычек"
        )
    fields = await _validate_habit_fields(repo, user, payload)
    task = await repo.create_task(
        user_id=user.telegram_id,
        name=fields.name,
        frequency_type=fields.frequency_type,
        days=fields.days,
        reminder_time=fields.reminder_time,
        color=fields.color,
    )
    # У новой привычки ещё нет отметок.
    return build_habit(task, set(), user_today(user))


async def update_habit(
    repo: Repository, user: User, task: Task, payload: HabitCreate
) -> Habit:
    """Изменить привычку (все поля формы) и вернуть её в форме `Habit`.

    История отметок не трогается: серии пересчитываются по новому расписанию.
    """
    fields = await _validate_habit_fields(repo, user, payload, task_id=task.id)
    await repo.update_task(
        task,
        name=fields.name,
        frequency_type=fields.frequency_type,
        days=fields.days,
        reminder_time=fields.reminder_time,
        color=fields.color,
    )
    return await _built_habit(repo, task, user_today(user))


@dataclass(frozen=True)
class DueReminder:
    """Напоминание, которое пора прислать: кому, о какой привычке и на каком языке."""

    task_id: int
    user_id: int
    habit_name: str
    language: str


def _clock_times(moment: datetime) -> set[time]:
    """Время на часах («ЧЧ:ММ») во всех поясах мира в момент `moment` — несколько
    десятков значений: у многих поясов смещение одинаковое."""
    return {
        moment.astimezone(pytz.timezone(zone)).time().replace(second=0, microsecond=0)
        for zone in pytz.all_timezones
    }


async def due_reminders(repo: Repository, moment: datetime) -> list[DueReminder]:
    """Напоминания на минуту `moment` (datetime с поясом, обычно UTC).

    Напоминание привычки наступило, если в поясе её владельца `moment` приходится
    ровно на время напоминания. Приходит оно только в дни, на которые привычка
    запланирована, и только пока она за этот день не отмечена выполненной.
    Пользователю, заблокированному администратором, напоминания не приходят.

    «Этот день» — день отметки приложения (`user_today`): в режиме «Отмечать за вчера»
    кнопка в приложении отмечает вчерашний день, поэтому и напоминание — о нём. Иначе
    отметка, сделанная пользователем, напоминание бы не отменяла.

    Из базы читаются только привычки, время напоминания которых где-то на Земле
    наступило сейчас (по индексу, см. `_clock_times`), — а не все привычки с
    напоминанием; отметки за день проверяются одним запросом на всех.
    """
    candidates: list[tuple[Task, date]] = []
    for task in await repo.get_active_tasks_with_reminder_at(_clock_times(moment)):
        if task.user.blocked_at is not None:
            continue
        local = moment.astimezone(resolve_timezone(task.user.timezone))
        reminder = task.reminder_time
        if reminder is None or (reminder.hour, reminder.minute) != (local.hour, local.minute):
            continue
        day = local.date() - timedelta(days=1) if task.user.mark_yesterday else local.date()
        if is_due_on(task, day):
            candidates.append((task, day))
    if not candidates:
        return []
    done = await repo.get_done_task_days({(task.id, day) for task, day in candidates})
    return [
        DueReminder(
            task_id=task.id,
            user_id=task.user_id,
            habit_name=task.name,
            language=task.user.language,
        )
        for task, day in candidates
        if (task.id, day) not in done
    ]


def serialize_settings(user: User, is_admin: bool) -> SettingsResponse:
    """Собрать ответ настроек; пояс подписан на языке пользователя."""
    has_timezone = bool(user.timezone)
    city = selected_city(user.timezone, user.timezone_city)
    return SettingsResponse(
        timezone=user.timezone,
        timezone_city=city.id if city is not None else None,
        timezone_display=(
            timezone_display(user.timezone, user.language, city) if has_timezone else None
        ),
        timezone_offset=utc_label(user.timezone) if has_timezone else None,
        language=user.language,
        theme=user.theme,
        mark_yesterday=user.mark_yesterday,
        is_admin=is_admin,
    )


async def read_settings(repo: Repository, user: User) -> SettingsResponse:
    """Настройки пользователя (для `GET /settings`)."""
    return serialize_settings(user, await repo.is_admin(user.telegram_id))


async def update_settings(
    repo: Repository, user: User, payload: SettingsUpdate
) -> SettingsResponse:
    """Обновить переданные настройки и вернуть актуальное состояние.

    Меняются только непустые поля. Пояс задаётся городом (`timezone_city` — пояс
    города) или зоной либо смещением (`timezone` — пояс без города).
    """
    timezone, timezone_city = None, None
    if payload.timezone_city is not None:
        city = validation.resolve_city(payload.timezone_city)
        timezone, timezone_city = city.zone, city.id
    elif payload.timezone is not None:
        timezone = validation.resolve_timezone(payload.timezone)
    await repo.update_settings(
        user,
        timezone=timezone,
        timezone_city=timezone_city,
        language=(
            validation.validate_language(payload.language)
            if payload.language is not None
            else None
        ),
        theme=validation.validate_theme(payload.theme) if payload.theme is not None else None,
        mark_yesterday=payload.mark_yesterday,
    )
    return await read_settings(repo, user)


async def create_review(repo: Repository, user: User, payload: ReviewCreate) -> ReviewCreated:
    """Сохранить отзыв из настроек — он появится в админ-панели.

    Не больше MAX_REVIEWS_PER_DAY за сутки: иначе раздел отзывов можно завалить
    одинаковыми сообщениями.
    """
    text = validation.validate_review(payload.text)
    since = utc_now() - timedelta(days=1)
    if await repo.count_reviews_since(user.telegram_id, since) >= MAX_REVIEWS_PER_DAY:
        raise ApiError(429, "review_limit", "Слишком много отзывов за сутки")
    review = await repo.create_review(user.telegram_id, text)
    return ReviewCreated(id=review.id, created_at=review.created_at)


def build_meta() -> MetaResponse:
    """Справочные данные для форм: лимит длины названия привычки."""
    return MetaResponse(name_max_length=HABIT_NAME_MAX_LENGTH)


def build_timezones(language: str, query: str | None) -> TimezonesResponse:
    """Пояса для выбора в настройках на языке интерфейса: без запроса — каталог, с
    запросом — найденные города (см. timezones.search_timezones)."""
    entries: list[ZoneEntry] = (
        search_timezones(query, language, TIMEZONE_SEARCH_LIMIT)
        if query and query.strip()
        else timezone_catalog(language)
    )
    return TimezonesResponse(
        timezones=[
            TimezoneEntry(
                zone=entry.zone,
                city_id=entry.city_id,
                city=entry.city,
                region=entry.region,
                country=entry.country,
                offset=entry.offset,
            )
            for entry in entries
        ]
    )
