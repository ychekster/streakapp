"""«Экспорт данных» / «Импорт данных» (настройки): всё, что известно о пользователе, —
одним JSON-файлом (schemas.DataExport), и загрузка такого файла обратно.

Экспорт: аккаунт, настройки, привычки (в том числе архивные и замороженные) со всей
историей — отметки за всё время, заметки, заморозки, прежние расписания, напоминания —,
папки и отзывы. Не входят служебные данные: сессии входа, push-подписки, аналитика.

Импорт добавляет привычки из файла к текущим (ничего не удаляет): название, которое уже
есть, получает « (2)». Совместная привычка становится обычной — с отметками самого
пользователя (участники — чужие аккаунты). Папки добавляются, пока не кончится лимит;
рекомендуемую, которая уже есть, второй раз не заводят. Настройки из файла заменяют
текущие. Привычек не должно стать больше MAX_HABITS_PER_USER — иначе не добавляется
ничего. Файл, который не читается, — `422 invalid_import_file`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from pydantic import ValidationError

from backend import validation
from backend.constants import (
    DEFAULT_LANGUAGE,
    EXPORT_FORMAT,
    EXPORT_VERSION,
    FOLDER_HABIT_TYPES,
    FOLDER_KINDS,
    HABIT_NAME_MAX_LENGTH,
    MAX_FOLDERS_PER_USER,
    MAX_HABITS_PER_USER,
    REMINDER_TIME_FORMAT,
    WEEKDAYS,
)
from backend.errors import ApiError
from backend.models import FrequencyType, Task, TaskLog, TaskStatus, User
from backend.repository import Repository, utc_now
from backend.schemas import (
    DataExport,
    ExportAccount,
    ExportFolder,
    ExportFreeze,
    ExportHabit,
    ExportMark,
    ExportNote,
    ExportReview,
    ExportSettings,
    ExportShared,
    ImportResult,
    SchedulePeriod,
)
from backend.services import user_today

# Подпись под файлом, который присылает бот (POST /export/telegram), — на языке пользователя.
EXPORT_CAPTIONS: dict[str, str] = {
    "ru": "Все ваши данные Knot. Чтобы перенести их, откройте Knot на другом аккаунте или "
    "устройстве: Настройки → «Импорт данных».",
    "en": "All your Knot data. To move it, open Knot on another account or device: "
    "Settings → “Import Data”.",
}
# Отметки не раньше этого дня и не позже завтрашнего (пояса) — остальное в файле не настоящее.
_FIRST_MARK_DAY = date(2000, 1, 1)


def file_name(today: date) -> str:
    return f"knot-export-{today.isoformat()}.json"


def _naive_utc(moment: datetime | None) -> datetime | None:
    """Момент из файла — как в базе: UTC без пояса."""
    if moment is None or moment.tzinfo is None:
        return moment
    return moment.astimezone(timezone.utc).replace(tzinfo=None)


def _days(value: str | None) -> list[str]:
    return [code for code in (value or "").split(",") if code]


def _clock(value: Any) -> str | None:
    return value.strftime(REMINDER_TIME_FORMAT) if value is not None else None


# --------------------------------------------------------------------------- #
#  Экспорт
# --------------------------------------------------------------------------- #


def _mark(log: TaskLog) -> ExportMark | None:
    done = log.status == TaskStatus.done
    if not done and not log.count:
        return None
    return ExportMark(date=log.scheduled_date, done=done, count=log.count, marked_at=log.marked_at)


async def build_export(repo: Repository, user: User) -> DataExport:
    """Всё о пользователе одним файлом."""
    tasks = await repo.get_active_tasks(user.telegram_id)
    ids = [task.id for task in tasks]
    logs = await repo.get_task_logs(ids)
    freezes = await repo.get_freezes(ids)
    notes = await repo.get_notes(ids, date.min, date.max)
    periods = await repo.get_schedule_periods(ids)
    members = await repo.members_of_tasks(ids)
    shared: dict[int, ExportShared] = {}
    for task_id, member in members.items():
        group = await repo.get_group(member.group_id)
        shared[task_id] = ExportShared(
            is_owner=group is not None and group.owner_id == user.telegram_id,
            members=await repo.count_active_members(member.group_id),
        )

    habits = [
        ExportHabit(
            id=task.id,
            name=task.name,
            description=task.description,
            color=task.color,
            frequency_type=task.frequency_type.value,
            days=_days(task.days),
            start_date=task.start_date,
            period=task.period,
            period_times=task.period_times,
            times_per_day=task.times_per_day,
            goal_unit=task.goal_unit,
            auto_mark=task.auto_mark,
            overtime=task.overtime,
            reminder_times=[_clock(value) for value in task.reminder_times],
            created_at=task.created_at,
            frozen_since=task.frozen_since,
            archived_at=task.archived_at,
            freezes=[ExportFreeze(start=start, end=end) for start, end in freezes[task.id]],
            schedule_history=[
                SchedulePeriod(
                    until=period.until,
                    frequency_type=period.frequency_type.value,
                    days=_days(period.days),
                    start_date=period.start_date,
                    period=period.period,
                    period_times=period.period_times,
                    times_per_day=period.times_per_day,
                    overtime=period.overtime,
                    goal_unit=period.goal_unit,
                )
                for period in periods[task.id]
            ],
            marks=[mark for log in logs[task.id] if (mark := _mark(log)) is not None],
            notes=[ExportNote(date=day, text=text) for day, text in sorted(notes[task.id].items())],
            shared=shared.get(task.id),
        )
        for task in tasks
    ]
    exported = set(ids)
    folders = [
        ExportFolder(
            name=folder.name,
            kind=folder.kind,
            habit_types=list(folder.habit_types or []),
            habits=[task_id for task_id in folder.task_ids if task_id in exported],
        )
        for folder in await repo.get_folders(user.telegram_id)
    ]
    reviews = [
        ExportReview(
            text=review.text,
            created_at=review.created_at,
            reply_text=review.reply_text,
            replied_at=review.replied_at,
        )
        for review in await repo.user_reviews(user.telegram_id)
    ]
    await repo.log_action(user.telegram_id, "data_export")
    return DataExport(
        format=EXPORT_FORMAT,
        version=EXPORT_VERSION,
        exported_at=utc_now(),
        account=ExportAccount(
            id=user.telegram_id,
            username=user.username,
            first_name=user.first_name,
            created_at=user.created_at,
            first_checkin_at=user.first_checkin_at,
            signup_platform=user.signup_platform,
        ),
        settings=ExportSettings(
            timezone=user.timezone,
            timezone_city=user.timezone_city,
            language=user.language,
            theme=user.theme,
            grid_layout=user.grid_layout,
            mark_yesterday=user.mark_yesterday,
            checkin_reminder_time=_clock(user.checkin_reminder_time),
            checkin_reminder_days=_days(user.checkin_reminder_days),
            telegram_notifications=user.telegram_notifications,
            folder_swipe=user.folder_swipe,
        ),
        habits=habits,
        folders=folders,
        all_habits_position=user.all_habits_position,
        reviews=reviews,
    )


def caption(user: User) -> str:
    return EXPORT_CAPTIONS.get(user.language, EXPORT_CAPTIONS[DEFAULT_LANGUAGE])


# --------------------------------------------------------------------------- #
#  Импорт
# --------------------------------------------------------------------------- #


def _bad_file(message: str = "Файл не подходит для импорта") -> ApiError:
    return ApiError(422, "invalid_import_file", message)


def parse_import(body: object) -> DataExport:
    """Файл импорта из тела запроса; не тот файл или более новой версии — invalid_import_file."""
    try:
        data = DataExport.model_validate(body)
    except ValidationError as exc:
        raise _bad_file() from exc
    if data.version > EXPORT_VERSION:
        raise _bad_file("Файл из более новой версии приложения — обновите приложение")
    return data


def _free_name(name: str, taken: set[str]) -> str:
    """Название, которого ещё нет (без учёта регистра): занятое — с « (2)», « (3)»…"""
    candidate, number = name, 1
    while candidate.casefold() in taken:
        number += 1
        suffix = f" ({number})"
        candidate = name[: HABIT_NAME_MAX_LENGTH - len(suffix)].rstrip() + suffix
    taken.add(candidate.casefold())
    return candidate


def _schedule_rows(habit: ExportHabit, today: date) -> list[dict[str, Any]]:
    """Прежние расписания: проверенные, по возрастанию `until`, без повторов дня;
    непрочитанное пропускается (прошлые дни тогда судятся по текущему)."""
    rows: dict[date, dict[str, Any]] = {}
    for period in sorted(habit.schedule_history, key=lambda item: item.until):
        try:
            frequency, days, start = validation.validate_frequency(
                period.frequency_type, period.days, period.start_date, today
            )
            kind, times = validation.validate_period(frequency, period.period, period.period_times)
            unit = validation.validate_goal_unit(period.goal_unit)
            goal = validation.validate_times_per_day(period.times_per_day, unit)
        except ApiError:
            continue
        rows.setdefault(
            period.until,
            {
                "until": period.until,
                "frequency_type": frequency,
                "days": days,
                "start_date": start,
                "period": kind,
                "period_times": times,
                "times_per_day": goal,
                "overtime": period.overtime and goal > 1,
                "goal_unit": unit,
            },
        )
    return list(rows.values())


async def _import_habit(
    repo: Repository, user: User, habit: ExportHabit, taken: set[str], today: date, now: datetime
) -> Task:
    try:
        name = _free_name(validation.validate_name(habit.name), taken)
        description = (
            validation.validate_description(habit.description) if habit.description else None
        )
        frequency, days, start = validation.validate_frequency(
            habit.frequency_type, habit.days, habit.start_date, today
        )
        period, period_times = validation.validate_period(
            frequency, habit.period, habit.period_times
        )
        reminders = validation.validate_reminder_times(None, habit.reminder_times)
        color = validation.validate_color(habit.color)
        unit = validation.validate_goal_unit(habit.goal_unit)
        goal = validation.validate_times_per_day(habit.times_per_day, unit)
    except ApiError as exc:
        raise _bad_file(f"Привычка «{habit.name[:40]}»: {exc.message}") from exc

    task = await repo.create_task(
        user_id=user.telegram_id,
        name=name,
        description=description,
        frequency_type=frequency,
        days=days,
        start_date=start,
        period=period,
        period_times=period_times,
        reminder_time=reminders[0] if reminders else None,
        extra_reminder_times=reminders[1:],
        color=color,
        times_per_day=goal,
        auto_mark=habit.auto_mark and goal == 1 and unit == "times",
        overtime=habit.overtime and goal > 1,
        goal_unit=unit,
    )

    last_day = today + timedelta(days=1)
    marks: dict[date, tuple[date, TaskStatus, int | None, datetime | None]] = {}
    for mark in habit.marks:
        if _FIRST_MARK_DAY <= mark.date <= last_day and (mark.done or mark.count):
            status = TaskStatus.done if mark.done else TaskStatus.pending
            marks[mark.date] = (mark.date, status, mark.count, _naive_utc(mark.marked_at))
    notes: dict[date, str] = {}
    for note in habit.notes:
        try:
            text = validation.validate_note(note.text)
        except ApiError:
            continue
        if text and _FIRST_MARK_DAY <= note.date <= last_day:
            notes[note.date] = text
    freezes = sorted(
        {
            (item.start, item.end)
            for item in habit.freezes
            if _FIRST_MARK_DAY <= item.start < item.end <= last_day
        }
    )
    frozen_since = habit.frozen_since if habit.frozen_since and habit.frozen_since <= last_day else None
    created_at = _naive_utc(habit.created_at)
    await repo.add_task_history(
        task,
        created_at=created_at if created_at is not None and created_at <= now else None,
        frozen_since=frozen_since,
        archived_at=_naive_utc(habit.archived_at) if habit.archived_at else None,
        logs=sorted(marks.values()),
        freezes=freezes,
        notes=sorted(notes.items()),
        periods=_schedule_rows(habit, today),
        now=now,
    )
    return task


async def _import_settings(repo: Repository, user: User, settings: ExportSettings) -> None:
    """Настройки из файла; значение, которое не читается, остаётся прежним."""

    def checked(check: Any, value: Any) -> Any:
        if value is None:
            return None
        try:
            return check(value)
        except ApiError:
            return None

    zone, city_id = None, None
    city = checked(validation.resolve_city, settings.timezone_city)
    if city is not None:
        zone, city_id = city.zone, city.id
    else:
        zone = checked(validation.resolve_timezone, settings.timezone)
    reminder = None
    if settings.checkin_reminder_time is not None or settings.checkin_reminder_days:
        days = (
            checked(validation.validate_days, settings.checkin_reminder_days or None)
            or user.checkin_reminder_days
            or ",".join(WEEKDAYS)
        )
        reminder = (checked(validation.validate_reminder_time, settings.checkin_reminder_time), days)
    await repo.update_settings(
        user,
        timezone=zone,
        timezone_city=city_id,
        language=checked(validation.validate_language, settings.language),
        theme=checked(validation.validate_theme, settings.theme),
        grid_layout=checked(validation.validate_grid_layout, settings.grid_layout),
        mark_yesterday=settings.mark_yesterday,
        checkin_reminder=reminder,
        telegram_notifications=settings.telegram_notifications,
        folder_swipe=settings.folder_swipe,
    )


async def import_data(repo: Repository, user: User, data: DataExport) -> ImportResult:
    """Добавить привычки и папки из файла к текущим и взять из него настройки."""
    current = await repo.get_active_tasks(user.telegram_id)
    if len(current) + len(data.habits) > MAX_HABITS_PER_USER:
        raise ApiError(
            409,
            "habit_limit",
            f"Можно завести не больше {MAX_HABITS_PER_USER} привычек: "
            f"удалите лишние или импортируйте файл с меньшим числом",
        )
    if data.settings is not None:
        await _import_settings(repo, user, data.settings)
    today, now = user_today(user), utc_now()
    taken = {task.name.casefold() for task in current}
    created: dict[int, Task] = {}
    for habit in data.habits:
        if habit.id not in created:
            created[habit.id] = await _import_habit(repo, user, habit, taken, today, now)

    folders = await repo.get_folders(user.telegram_id)
    kinds = {folder.kind for folder in folders if folder.kind}
    added_folders = 0
    for folder in data.folders:
        if len(folders) + added_folders >= MAX_FOLDERS_PER_USER:
            break
        kind = folder.kind if folder.kind in FOLDER_KINDS else None
        if kind is not None and kind in kinds:
            continue
        try:
            name = validation.validate_folder_name(folder.name)
        except ApiError:
            continue
        await repo.create_folder(
            user.telegram_id,
            name,
            [] if kind else [created[ref].id for ref in folder.habits if ref in created],
            [] if kind else [item for item in folder.habit_types if item in FOLDER_HABIT_TYPES],
            None,
            kind=kind,
        )
        if kind is not None:
            kinds.add(kind)
        added_folders += 1
    await repo.log_action(
        user.telegram_id, "data_import", detail=f"{len(created)} habits, {added_folders} folders"
    )
    return ImportResult(habits=len(created), folders=added_folders)
