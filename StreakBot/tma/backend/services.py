"""Прикладная логика API поверх репозитория бота.

Доступ к данным идёт только через `Repository` — SQL здесь не пишется, логика
бота не дублируется. Этот слой лишь собирает из задач и их логов форму ответа
(`Habit`) и применяет переключение отметки за сегодня.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytz

from bot.constants import EVENING_RANGE, MORNING_RANGE, WEEKDAYS
from bot.database.models import Task, TaskStatus, User
from bot.database.repository import Repository
from bot.utils.validators import format_timezone_display, utc_label
from tma.backend import validation
from tma.backend.constants import GRID_DAYS, HABIT_NAME_MAX_LENGTH
from tma.backend.errors import ApiError
from tma.backend.schemas import (
    Habit,
    HabitCreate,
    MetaResponse,
    SettingsResponse,
    SettingsUpdate,
    TimezoneOption,
    Weekday,
)


def resolve_timezone(timezone_name: str | None) -> pytz.BaseTzInfo:
    """Часовой пояс пользователя (UTC как фолбэк при пустом/неизвестном значении).

    Повторяет поведение бота: «сегодня» считается в личном поясе пользователя.
    """
    try:
        return pytz.timezone(timezone_name) if timezone_name else pytz.utc
    except Exception:  # noqa: BLE001 — неизвестная зона не должна ронять запрос
        return pytz.utc


def user_today(user: User) -> date:
    """Текущая дата в часовом поясе пользователя (как у бота)."""
    return datetime.now(resolve_timezone(user.timezone)).date()


async def build_history(repo: Repository, task_id: int, today: date) -> list[bool]:
    """История выполнения задачи за последние `GRID_DAYS` дней (старое → сегодня).

    True — в этот день есть лог со статусом `done`, иначе False. Та же логика
    «закрашен = done», что и в PNG-баннерах бота, но окно — полгода (182 дня) вместо 30.
    """
    logs = await repo.get_logs_for_task(task_id)
    done_dates = {log.scheduled_date for log in logs if log.status == TaskStatus.done}
    start = today - timedelta(days=GRID_DAYS - 1)
    return [(start + timedelta(days=offset)) in done_dates for offset in range(GRID_DAYS)]


async def build_habit(
    repo: Repository, task: Task, today: date, scheduled_today: bool
) -> Habit:
    """Собрать схему `Habit`: название, отметка за сегодня, признак расписания и история."""
    history = await build_history(repo, task.id, today)
    # Последний элемент истории — сегодняшний день, поэтому он же определяет done_today.
    return Habit(
        id=task.id,
        name=task.name,
        done_today=history[-1],
        scheduled_today=scheduled_today,
        history=history,
    )


async def _due_today_ids(repo: Repository, user: User, today: date) -> set[int]:
    """Id задач, запланированных на сегодня (по частоте/дням недели) — через репозиторий."""
    due = await repo.get_tasks_due_on(user.telegram_id, today)
    return {task.id for task in due}


async def list_habits(repo: Repository, user: User) -> list[Habit]:
    """Все активные привычки пользователя с историей и признаком расписания (для `GET /tasks`)."""
    today = user_today(user)
    tasks = await repo.get_active_tasks(user.telegram_id)
    due_ids = await _due_today_ids(repo, user, today)
    return [await build_habit(repo, task, today, task.id in due_ids) for task in tasks]


async def toggle_today(repo: Repository, user: User, task: Task) -> Habit:
    """Переключить отметку выполнения задачи за сегодня и вернуть обновлённую привычку.

    Отметка применяется относительно статуса в БД: `done` ↔ `pending`. Лог за
    сегодня создаётся при необходимости.
    """
    today = user_today(user)
    log = await repo.get_or_create_log(task.id, user.telegram_id, today)
    target = TaskStatus.pending if log.status == TaskStatus.done else TaskStatus.done
    await repo.set_log_status(log, target)
    due_ids = await _due_today_ids(repo, user, today)
    return await build_habit(repo, task, today, task.id in due_ids)


async def create_habit(repo: Repository, user: User, payload: HabitCreate) -> Habit:
    """Создать привычку (как /add в боте) и вернуть её в форме `Habit`.

    Параметры валидируются теми же правилами, что и в боте; имя не должно дублировать
    существующую активную привычку. Время напоминания сохраняется в БД; джоба
    напоминания подхватится планировщиком бота при следующем перезапуске
    (планировщик живёт в процессе бота и восстанавливает джобы из БД).
    """
    name = validation.validate_name(payload.name)
    frequency_type, days = validation.validate_frequency(
        payload.frequency_type, payload.days
    )
    reminder_time = validation.validate_reminder(payload.reminder_time)

    if await repo.task_name_exists(user.telegram_id, name):
        raise ApiError(409, "duplicate_name", "Привычка с таким названием уже есть")

    task = await repo.create_task(
        user_id=user.telegram_id,
        name=name,
        frequency_type=frequency_type,
        days=days,
        reminder_time=reminder_time,
    )
    today = user_today(user)
    due_ids = await _due_today_ids(repo, user, today)
    return await build_habit(repo, task, today, task.id in due_ids)


def serialize_settings(user: User) -> SettingsResponse:
    """Собрать ответ настроек: время уведомлений и часовой пояс (с подписями)."""
    has_timezone = bool(user.timezone)
    return SettingsResponse(
        morning_time=user.morning_time.strftime("%H:%M") if user.morning_time else None,
        evening_time=user.evening_time.strftime("%H:%M") if user.evening_time else None,
        timezone=user.timezone,
        timezone_display=format_timezone_display(user.timezone) if has_timezone else None,
        timezone_offset=utc_label(user.timezone) if has_timezone else None,
    )


async def update_settings(
    repo: Repository, user: User, payload: SettingsUpdate
) -> SettingsResponse:
    """Обновить переданные настройки (время/пояс) и вернуть актуальное состояние.

    Меняются только непустые поля. Значения валидируются правилами бота. Изменения
    сохраняются в БД; перепланирование уведомлений делает планировщик бота при
    следующем перезапуске (он пересоздаёт джобы из настроек в БД).
    """
    if payload.morning_time is not None:
        await repo.set_morning_time(user, validation.validate_morning_time(payload.morning_time))
    if payload.evening_time is not None:
        await repo.set_evening_time(user, validation.validate_evening_time(payload.evening_time))
    if payload.timezone is not None:
        await repo.set_timezone(user, validation.resolve_timezone(payload.timezone))
    return serialize_settings(user)


def build_meta() -> MetaResponse:
    """Справочные данные для форм: дни недели, диапазоны времени, варианты поясов.

    Берутся из констант бота, поэтому совпадают с правилами /add и /settings.
    Часовые пояса — целочисленные смещения UTC-12…UTC+14 (как принимает бот).
    """
    weekdays = [Weekday(code=code, short=short, full=full) for code, short, full in WEEKDAYS]
    offsets: list[TimezoneOption] = []
    for hours in range(-12, 15):
        label = f"UTC{'+' if hours >= 0 else '-'}{abs(hours)}"
        offsets.append(TimezoneOption(value=label, label=label))
    return MetaResponse(
        weekdays=weekdays,
        morning_range=list(MORNING_RANGE),
        evening_range=list(EVENING_RANGE),
        name_max_length=HABIT_NAME_MAX_LENGTH,
        timezone_offsets=offsets,
    )
