"""Прикладная логика API поверх репозитория.

Доступ к данным идёт только через `Repository` — SQL здесь не пишется. Этот слой
собирает из задач и их логов форму ответа (`Habit`) вместе со статистикой серий,
создаёт и изменяет привычки, применяет переключение отметки за сегодня, работает с
настройками пользователя, принимает отзывы и определяет, чьи напоминания пора прислать
(для бота). Логика админ-панели — в admin.py и analytics.py.
"""

from __future__ import annotations

from collections.abc import Callable, Collection
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import pytz

from backend import validation
from backend.constants import (
    DEFAULT_LANGUAGE,
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    MAX_HABITS_PER_USER,
    MAX_REVIEWS_PER_DAY,
    REMINDER_TIME_FORMAT,
    TIMEZONE_SEARCH_LIMIT,
    WEEKDAYS,
)
from backend.errors import ApiError
from backend.models import FrequencyType, Task, TaskStatus, User
from backend.repository import Repository, utc_now
from backend.schedule import due_check, is_due_on, task_days
from backend.schemas import (
    Habit,
    HabitCreate,
    MetaResponse,
    ReviewCreate,
    ReviewCreated,
    SettingsResponse,
    SettingsUpdate,
    SyncCreate,
    SyncDelete,
    SyncError,
    SyncFreeze,
    SyncMark,
    SyncOperation,
    SyncResult,
    SyncUpdate,
    TimezoneEntry,
    TimezonesResponse,
)
from backend.timezones import (
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


def frozen_check(
    task: Task, freezes: Collection[tuple[date, date]], today: date
) -> Callable[[date], bool]:
    """Проверка «заморожена ли привычка в этот день»: прошедшие заморозки `freezes`
    (первый день, день разморозки — уже обычный) и текущая — с `task.frozen_since` по
    `today` включительно."""
    periods = list(freezes)
    if task.frozen_since is not None:
        periods.append((task.frozen_since, today + timedelta(days=1)))
    return lambda day: any(start <= day < end for start, end in periods)


def compute_streaks(
    task: Task,
    done_dates: set[date],
    today: date,
    is_frozen: Callable[[date], bool] = lambda day: False,
) -> tuple[int, int]:
    """Текущая и лучшая серии выполнения (в днях).

    Серия — подряд идущие выполненные дни. Прерывает её только пропущенный
    запланированный день: незапланированные дни (у привычек «по дням недели» и «через
    день») и дни заморозки серию не рвут, а выполнение в такой день её продолжает.
    Сегодняшний день ещё не закончился, поэтому пока он не отмечен, текущая серия тянется
    со вчерашнего.
    """
    if not done_dates:
        return 0, 0
    is_due = due_check(task)
    current = best = 0
    day = min(done_dates)
    while day <= today:
        if day in done_dates:
            current += 1
            best = max(best, current)
        elif day < today and is_due(day) and not is_frozen(day):
            current = 0
        day += timedelta(days=1)
    return current, best


def build_habit(
    task: Task,
    done_dates: set[date],
    today: date,
    freezes: Collection[tuple[date, date]] = (),
) -> Habit:
    """Собрать схему `Habit`: расписание, отметка за сегодня, история и статистика серий.

    `done_dates` — даты выполнения по `today` включительно (Repository.get_done_dates):
    отметки «из будущего» (возможны после смены часового пояса на более западный) не
    учитываются ни в сетке, ни в сериях, ни в общем счётчике. `freezes` — прошедшие
    заморозки (Repository.get_freezes).
    """
    is_frozen = frozen_check(task, freezes, today)
    current_streak, best_streak = compute_streaks(task, done_dates, today, is_frozen)
    history_start = today - timedelta(days=HISTORY_DAYS - 1)
    return Habit(
        id=task.id,
        name=task.name,
        done_today=today in done_dates,
        scheduled_today=is_due_on(task, today),
        frequency_type=task.frequency_type.value,
        days=task_days(task),
        start_date=task.start_date,
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
        frozen_since=task.frozen_since,
        frozen_history=[
            is_frozen(history_start + timedelta(days=offset)) for offset in range(HISTORY_DAYS)
        ],
    )


async def _built_habit(repo: Repository, task: Task, today: date) -> Habit:
    """Привычка с отметками из базы (после изменения или отметки)."""
    done = await repo.get_done_dates([task.id], today)
    freezes = await repo.get_freezes([task.id])
    return build_habit(task, done[task.id], today, freezes[task.id])


async def list_habits(repo: Repository, user: User) -> list[Habit]:
    """Все активные привычки пользователя с историей и статистикой (для `GET /tasks`).

    Отметки всех привычек читаются одним запросом, а не по запросу на привычку.
    """
    today = user_today(user)
    tasks = await repo.get_active_tasks(user.telegram_id)
    task_ids = [task.id for task in tasks]
    done = await repo.get_done_dates(task_ids, today)
    freezes = await repo.get_freezes(task_ids)
    return [build_habit(task, done[task.id], today, freezes[task.id]) for task in tasks]


async def _record_mark(repo: Repository, user: User, task: Task, done: bool) -> None:
    """Отметка поставлена или снята: в ленту действий и, если поставлена, — день отметки
    (аналитика: отмечающие за день, активация, удержание)."""
    await repo.log_action(user.telegram_id, "checkin" if done else "uncheck", ref_id=task.id)
    if done:
        await repo.record_checkin_day(user.telegram_id, utc_now())


async def toggle_today(repo: Repository, user: User, task: Task) -> Habit:
    """Переключить отметку выполнения задачи за сегодня и вернуть обновлённую привычку.

    Отметка применяется относительно статуса в БД: `done` ↔ `pending`. Лог за
    сегодня создаётся при необходимости.
    """
    today = user_today(user)
    log = await repo.get_or_create_log(task.id, user.telegram_id, today)
    target = TaskStatus.pending if log.status == TaskStatus.done else TaskStatus.done
    await repo.set_log_status(log, target)
    await _record_mark(repo, user, task, target == TaskStatus.done)
    return await _built_habit(repo, task, today)


@dataclass(frozen=True)
class HabitFields:
    """Проверенные поля формы привычки — в том виде, в каком их хранит `Task`."""

    name: str
    frequency_type: FrequencyType
    days: str | None
    start_date: date | None
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
    frequency_type, days, start_date = validation.validate_frequency(
        payload.frequency_type, payload.days, payload.start_date, user_today(user)
    )
    reminder_time = validation.validate_reminder_time(payload.reminder_time)
    color = validation.validate_color(payload.color)

    if await repo.task_name_exists(user.telegram_id, name, exclude_task_id=task_id):
        raise ApiError(409, "duplicate_name", "Привычка с таким названием уже есть")

    return HabitFields(
        name=name,
        frequency_type=frequency_type,
        days=days,
        start_date=start_date,
        reminder_time=reminder_time,
        color=color,
    )


async def _create_task(
    repo: Repository, user: User, payload: HabitCreate, client_ref: str | None = None
) -> Task:
    """Создать задачу по форме привычки (не больше `MAX_HABITS_PER_USER`)."""
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
        start_date=fields.start_date,
        reminder_time=fields.reminder_time,
        color=fields.color,
        client_ref=client_ref,
    )
    await repo.log_action(user.telegram_id, "habit_created", ref_id=task.id)
    return task


async def create_habit(repo: Repository, user: User, payload: HabitCreate) -> Habit:
    """Создать привычку и вернуть её в форме `Habit` (не больше `MAX_HABITS_PER_USER`)."""
    task = await _create_task(repo, user, payload)
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
        start_date=fields.start_date,
        reminder_time=fields.reminder_time,
        color=fields.color,
    )
    await repo.log_action(user.telegram_id, "habit_updated", ref_id=task.id)
    return await _built_habit(repo, task, user_today(user))


async def delete_habit(repo: Repository, user: User, task: Task) -> None:
    """Удалить привычку (мягко) и записать это в ленту."""
    await repo.soft_delete_task(task)
    await repo.log_action(user.telegram_id, "habit_deleted", ref_id=task.id)


@dataclass
class SyncOutcome:
    """Итог `apply_sync`: результат каждой операции и что из воронки случилось."""

    results: list[SyncResult]
    # Создана первая привычка аккаунта (удалённые тоже считаются).
    first_habit: bool = False
    # Поставлена хотя бы одна отметка выполнения.
    checked_in: bool = False


async def _task_by_ref(repo: Repository, user: User, ref: int | str) -> Task | None:
    """Активная привычка пользователя по id на сервере или по id устройства."""
    if isinstance(ref, int):
        return await repo.get_active_task(ref, user.telegram_id)
    task = await repo.get_task_by_ref(user.telegram_id, ref)
    return task if task is not None and task.is_active else None


async def _active_task(repo: Repository, user: User, ref: int | str) -> Task:
    task = await _task_by_ref(repo, user, ref)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    return task


async def _apply_sync_op(
    repo: Repository, user: User, op: SyncOperation, outcome: SyncOutcome
) -> SyncResult:
    """Применить одну операцию /sync (ошибка — ApiError)."""
    if isinstance(op, SyncMark):
        task = await _active_task(repo, user, op.task)
        # День — в пределах истории, которую видит устройство: не позже дня отметки (на
        # устройстве с неверными часами отметка «из будущего» не появится) и не раньше
        # первого дня сетки.
        today = user_today(user)
        if not today - timedelta(days=HISTORY_DAYS) < op.date <= today:
            raise ApiError(422, "invalid_date", "День вне истории привычки")
        log = await repo.get_or_create_log(task.id, user.telegram_id, op.date)
        target = TaskStatus.done if op.done else TaskStatus.pending
        if log.status != target:
            await repo.set_log_status(log, target)
            await _record_mark(repo, user, task, op.done)
        outcome.checked_in = outcome.checked_in or op.done
        return SyncResult(ok=True)
    if isinstance(op, SyncFreeze):
        task = await _active_task(repo, user, op.task)
        # День — как у отметки: устройство замораживает с дня отметки, который видит.
        today = user_today(user)
        if not today - timedelta(days=HISTORY_DAYS) < op.date <= today:
            raise ApiError(422, "invalid_date", "День вне истории привычки")
        if op.frozen and task.frozen_since is None:
            await repo.freeze_task(task, op.date)
            await repo.log_action(user.telegram_id, "habit_frozen", ref_id=task.id)
        elif not op.frozen and task.frozen_since is not None:
            await repo.unfreeze_task(task, op.date)
            await repo.log_action(user.telegram_id, "habit_unfrozen", ref_id=task.id)
        return SyncResult(ok=True)
    if isinstance(op, SyncCreate):
        # Повтор уже применённого создания (ответ на прошлый запрос не дошёл) — та же
        # привычка, а не вторая.
        existing = await repo.get_task_by_ref(user.telegram_id, op.ref)
        if existing is not None:
            return SyncResult(ok=True, id=existing.id)
        first = not await repo.has_any_task(user.telegram_id)
        task = await _create_task(repo, user, op.habit, client_ref=op.ref)
        outcome.first_habit = outcome.first_habit or first
        return SyncResult(ok=True, id=task.id)
    if isinstance(op, SyncUpdate):
        await update_habit(repo, user, await _active_task(repo, user, op.task), op.habit)
        return SyncResult(ok=True)
    if isinstance(op, SyncDelete):
        # Уже удалённая (или так и не созданная) привычка — цель достигнута.
        task = await _task_by_ref(repo, user, op.task)
        if task is not None:
            await delete_habit(repo, user, task)
        return SyncResult(ok=True)
    await update_settings(repo, user, op.patch)
    return SyncResult(ok=True)


async def apply_sync(repo: Repository, user: User, ops: list[SyncOperation]) -> SyncOutcome:
    """Применить изменения, сделанные на устройстве (`POST /sync`), по порядку.

    Каждая операция — в своей вложенной транзакции: отвергнутая (дубликат названия,
    привычка удалена с другого устройства…) откатывается одна и получает в ответе свою
    ошибку, остальные применяются. Состояние после всех операций устройство берёт из
    того же ответа, поэтому отвергнутое изменение с экрана просто исчезает.
    """
    outcome = SyncOutcome(results=[])
    for op in ops:
        try:
            async with repo.savepoint():
                result = await _apply_sync_op(repo, user, op, outcome)
        except ApiError as exc:
            result = SyncResult(ok=False, error=SyncError(code=exc.code, message=exc.message))
        outcome.results.append(result)
    return outcome


@dataclass(frozen=True)
class DueReminder:
    """Напоминание, которое пора прислать: кому, о какой привычке и на каком языке.

    Без привычки (`task_id` и `habit_name` — None) — напоминание «Пора отметить
    привычки» из настроек (см. `due_checkin_reminders`).
    """

    task_id: int | None
    user_id: int
    habit_name: str | None
    language: str
    # Бот может прислать его в Telegram («Уведомления» в Mini App включены).
    telegram: bool = True


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
    запланирована, и только пока она за этот день не отмечена выполненной. Замороженной
    привычке и пользователю, заблокированному администратором, напоминания не приходят.

    «Этот день» — всегда сегодняшний по календарю пользователя: режим «Отмечать за вчера»
    на напоминания о привычках не влияет (сегодня по расписанию — сегодня и напомнит).

    Из базы читаются только привычки, время напоминания которых где-то на Земле
    наступило сейчас (по индексу, см. `_clock_times`), — а не все привычки с
    напоминанием; отметки за день проверяются одним запросом на всех.
    """
    candidates: list[tuple[Task, date]] = []
    for task in await repo.get_active_tasks_with_reminder_at(_clock_times(moment)):
        if task.user.blocked_at is not None or task.frozen_since is not None:
            continue
        local = moment.astimezone(resolve_timezone(task.user.timezone))
        reminder = task.reminder_time
        if reminder is None or (reminder.hour, reminder.minute) != (local.hour, local.minute):
            continue
        day = local.date()
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
            telegram=task.user.telegram_notifications,
        )
        for task, day in candidates
        if (task.id, day) not in done
    ]


def _reminder_day(user: User, local: datetime) -> date:
    """День отметки, о котором напоминание в момент `local` (время в поясе пользователя):
    в режиме «Отмечать за вчера» — вчерашний (см. `due_checkin_reminders`)."""
    return local.date() - timedelta(days=1) if user.mark_yesterday else local.date()


async def due_checkin_reminders(repo: Repository, moment: datetime) -> list[DueReminder]:
    """Напоминания «Пора отметить привычки» на минуту `moment` (как `due_reminders`).

    Наступило, если в поясе пользователя `moment` — ровно время напоминания, а сегодня
    (по его календарю) — один из выбранных дней недели. Приходит, только если на день
    отметки запланирована хотя бы одна незамороженная привычка и не все такие уже
    отмечены: иначе отмечать нечего.
    """
    candidates: dict[int, tuple[User, date]] = {}
    for user in await repo.get_users_with_checkin_reminder_at(_clock_times(moment)):
        local = moment.astimezone(resolve_timezone(user.timezone))
        reminder = user.checkin_reminder_time
        if reminder is None or (reminder.hour, reminder.minute) != (local.hour, local.minute):
            continue
        days = (user.checkin_reminder_days or "").split(",")
        if WEEKDAYS[local.weekday()] in days:
            candidates[user.telegram_id] = (user, _reminder_day(user, local))
    if not candidates:
        return []
    pending = [
        (task.id, candidates[task.user_id][1], task.user_id)
        for task in await repo.get_active_tasks_of(candidates)
        if task.frozen_since is None and is_due_on(task, candidates[task.user_id][1])
    ]
    done = await repo.get_done_task_days({(task_id, day) for task_id, day, _ in pending})
    waiting = {user_id for task_id, day, user_id in pending if (task_id, day) not in done}
    return [
        DueReminder(
            task_id=None,
            user_id=user_id,
            habit_name=None,
            language=user.language,
            telegram=user.telegram_notifications,
        )
        for user_id, (user, _) in candidates.items()
        if user_id in waiting
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
        telegram_notifications=user.telegram_notifications,
        checkin_reminder_time=(
            user.checkin_reminder_time.strftime(REMINDER_TIME_FORMAT)
            if user.checkin_reminder_time is not None
            else None
        ),
        checkin_reminder_days=[
            code for code in (user.checkin_reminder_days or "").split(",") if code
        ],
        is_admin=is_admin,
    )


async def read_settings(
    repo: Repository, user: User, *, via_telegram: bool
) -> SettingsResponse:
    """Настройки пользователя (для `GET /settings`). Вход в админ-панель виден только в
    Mini App (`via_telegram`): веб-сессия админку не открывает (см. get_admin_user)."""
    is_admin = via_telegram and await repo.is_admin(user.telegram_id)
    return serialize_settings(user, is_admin)


async def update_settings(repo: Repository, user: User, payload: SettingsUpdate) -> None:
    """Обновить переданные настройки (ответ собирает read_settings).

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
        checkin_reminder=(
            (
                validation.validate_reminder_time(payload.checkin_reminder.time),
                validation.validate_days(payload.checkin_reminder.days),
            )
            if payload.checkin_reminder is not None
            else None
        ),
        telegram_notifications=payload.telegram_notifications,
    )
    changed = sorted(payload.model_dump(exclude_none=True))
    if changed:
        await repo.log_action(user.telegram_id, "settings", detail=",".join(changed))


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
    await repo.log_action(user.telegram_id, "review", ref_id=review.id)
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
