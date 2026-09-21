"""Прикладная логика API поверх репозитория.

Доступ к данным идёт только через `Repository` — SQL здесь не пишется. Этот слой
собирает из задач и их логов форму ответа (`Habit`) вместе со статистикой серий,
создаёт и изменяет привычки, применяет переключение отметки за сегодня, работает с
настройками пользователя и определяет, чьи напоминания пора прислать (для бота).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import pytz

from tma.backend import validation
from tma.backend.constants import (
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    REMINDER_TIME_FORMAT,
    WEEKDAYS,
)
from tma.backend.errors import ApiError
from tma.backend.models import FrequencyType, Task, TaskStatus, User
from tma.backend.repository import Repository
from tma.backend.schedule import due_weekdays, is_due_on, task_days
from tma.backend.schemas import (
    Habit,
    HabitCreate,
    MetaResponse,
    SettingsResponse,
    SettingsUpdate,
    TimezoneOption,
    Weekday,
)
from tma.backend.timezones import format_timezone_display, utc_label


def resolve_timezone(timezone_name: str | None) -> pytz.BaseTzInfo:
    """Часовой пояс пользователя (UTC как фолбэк при пустом/неизвестном значении).

    «Сегодня» считается в личном поясе пользователя.
    """
    try:
        return pytz.timezone(timezone_name) if timezone_name else pytz.utc
    except Exception:  # noqa: BLE001 — неизвестная зона не должна ронять запрос
        return pytz.utc


def user_today(user: User) -> date:
    """Текущая дата в часовом поясе пользователя."""
    return datetime.now(resolve_timezone(user.timezone)).date()


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


async def build_habit(repo: Repository, task: Task, today: date) -> Habit:
    """Собрать схему `Habit`: расписание, отметка за сегодня, история и статистика серий."""
    logs = await repo.get_logs_for_task(task.id)
    # Отметки «из будущего» (возможны после смены часового пояса на более западный)
    # не учитываются: ни в сетке, ни в сериях, ни в общем счётчике.
    done_dates = {
        log.scheduled_date
        for log in logs
        if log.status == TaskStatus.done and log.scheduled_date <= today
    }
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


async def list_habits(repo: Repository, user: User) -> list[Habit]:
    """Все активные привычки пользователя с историей и статистикой (для `GET /tasks`)."""
    today = user_today(user)
    tasks = await repo.get_active_tasks(user.telegram_id)
    return [await build_habit(repo, task, today) for task in tasks]


async def toggle_today(repo: Repository, user: User, task: Task) -> Habit:
    """Переключить отметку выполнения задачи за сегодня и вернуть обновлённую привычку.

    Отметка применяется относительно статуса в БД: `done` ↔ `pending`. Лог за
    сегодня создаётся при необходимости.
    """
    today = user_today(user)
    log = await repo.get_or_create_log(task.id, user.telegram_id, today)
    target = TaskStatus.pending if log.status == TaskStatus.done else TaskStatus.done
    await repo.set_log_status(log, target)
    return await build_habit(repo, task, today)


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
    """Создать привычку и вернуть её в форме `Habit`."""
    fields = await _validate_habit_fields(repo, user, payload)
    task = await repo.create_task(
        user_id=user.telegram_id,
        name=fields.name,
        frequency_type=fields.frequency_type,
        days=fields.days,
        reminder_time=fields.reminder_time,
        color=fields.color,
    )
    return await build_habit(repo, task, user_today(user))


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
    return await build_habit(repo, task, user_today(user))


@dataclass(frozen=True)
class DueReminder:
    """Напоминание, которое пора прислать: кому и о какой привычке."""

    task_id: int
    user_id: int
    habit_name: str


async def due_reminders(repo: Repository, moment: datetime) -> list[DueReminder]:
    """Напоминания на минуту `moment` (datetime с поясом, обычно UTC).

    Напоминание привычки наступило, если в поясе её владельца `moment` приходится
    ровно на время напоминания. Приходит оно только в дни, на которые привычка
    запланирована, и только пока она за этот день не отмечена выполненной.
    """
    due: list[DueReminder] = []
    for task in await repo.get_active_tasks_with_reminders():
        local = moment.astimezone(resolve_timezone(task.user.timezone))
        reminder = task.reminder_time
        if reminder is None or (reminder.hour, reminder.minute) != (local.hour, local.minute):
            continue
        day = local.date()
        if not is_due_on(task, day):
            continue
        log = await repo.get_log(task.id, day)
        if log is not None and log.status == TaskStatus.done:
            continue
        due.append(DueReminder(task_id=task.id, user_id=task.user_id, habit_name=task.name))
    return due


def serialize_settings(user: User) -> SettingsResponse:
    """Собрать ответ настроек: часовой пояс (с подписями)."""
    has_timezone = bool(user.timezone)
    return SettingsResponse(
        timezone=user.timezone,
        timezone_display=format_timezone_display(user.timezone) if has_timezone else None,
        timezone_offset=utc_label(user.timezone) if has_timezone else None,
    )


async def update_settings(
    repo: Repository, user: User, payload: SettingsUpdate
) -> SettingsResponse:
    """Обновить переданные настройки и вернуть актуальное состояние.

    Меняются только непустые поля.
    """
    if payload.timezone is not None:
        await repo.set_timezone(user, validation.resolve_timezone(payload.timezone))
    return serialize_settings(user)


def build_meta() -> MetaResponse:
    """Справочные данные для форм: дни недели, лимит названия, варианты поясов.

    Часовые пояса — целочисленные смещения UTC-12…UTC+14.
    """
    weekdays = [Weekday(code=code, short=short, full=full) for code, short, full in WEEKDAYS]
    offsets: list[TimezoneOption] = []
    for hours in range(-12, 15):
        label = f"UTC{'+' if hours >= 0 else '-'}{abs(hours)}"
        offsets.append(TimezoneOption(value=label, label=label))
    return MetaResponse(
        weekdays=weekdays,
        name_max_length=HABIT_NAME_MAX_LENGTH,
        timezone_offsets=offsets,
    )
