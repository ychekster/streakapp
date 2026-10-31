"""Прикладная логика API поверх репозитория.

Доступ к данным идёт только через `Repository` — SQL здесь не пишется. Этот слой
собирает из задач и их логов форму ответа (`Habit`) вместе со статистикой серий,
создаёт и изменяет привычки, применяет переключение отметки за сегодня, работает с
настройками пользователя, принимает отзывы и определяет, чьи напоминания пора прислать
(для бота). Логика админ-панели — в admin.py и пакете analytics/.
"""

from __future__ import annotations

from collections.abc import Callable, Collection, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

import pytz

from backend import groups, validation
from backend.constants import (
    DEFAULT_LANGUAGE,
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    FOLDER_HABIT_TYPES,
    MAX_DAY_SECONDS,
    MAX_FOLDERS_PER_USER,
    MAX_HABITS_PER_USER,
    MAX_REVIEWS_PER_DAY,
    REMINDER_TIME_FORMAT,
    TIMER_NOTICE_GRACE_SECONDS,
    TIMEZONE_SEARCH_LIMIT,
    WEEKDAYS,
)
from backend.errors import ApiError
from backend.models import (
    Folder,
    FrequencyType,
    Review,
    RunningTimer,
    Task,
    TaskSchedulePeriod,
    TaskStatus,
    User,
)
from backend.repository import Repository, utc_now
from backend.schedule import (
    due_check_with_history,
    is_due_on,
    period_bounds,
    period_quota,
    schedule_at,
    task_days,
)
from backend.schemas import Folder as FolderView
from backend.schemas import (
    FolderInput,
    Habit,
    HabitCreate,
    MetaResponse,
    SchedulePeriod,
    ReviewCreate,
    ReviewsResponse,
    RunningTimerView,
    UserReview,
    SettingsResponse,
    SettingsUpdate,
    SyncCreate,
    SyncDelete,
    SyncError,
    SyncFolderCreate,
    SyncFolderDelete,
    SyncFolderOrder,
    SyncFolderUpdate,
    SyncArchive,
    SyncFreeze,
    SyncMark,
    SyncNote,
    SyncOperation,
    SyncResult,
    SyncTimer,
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


def _history_start(today: date) -> date:
    """Первый (самый старый) день истории, которая кончается днём `today`."""
    return today - timedelta(days=HISTORY_DAYS - 1)


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


def counted_days(
    task: Task,
    done_dates: Collection[date],
    is_frozen: Callable[[date], bool] = lambda day: False,
    periods: Sequence[TaskSchedulePeriod] = (),
) -> set[date]:
    """Выполненные дни, которые идут в серии и счёт периода: по расписанию того дня
    (`periods`) привычка была запланирована и не заморожена. У «Гибкого графика» — первые
    дни периода по порядку, пока не набрана его цель. Остальные отметки — бонусные: они в
    сетке, календаре и «всего выполнено», но не в сериях и счёте периода.
    """
    is_due = due_check_with_history(task, periods)
    schedule_on = schedule_at(task, periods)
    taken: dict[tuple[str, date], int] = {}
    counted: set[date] = set()
    for day in sorted(done_dates):
        if is_frozen(day):
            continue
        schedule = schedule_on(day)
        if schedule.frequency_type == FrequencyType.flexible:
            kind = schedule.period or "week"
            start, end = period_bounds(kind, day)
            used = taken.get((kind, start), 0)
            if used < period_quota(schedule.period_times or 1, start, end):
                taken[(kind, start)] = used + 1
                counted.add(day)
        elif is_due(day):
            counted.add(day)
    return counted


def compute_streaks(
    task: Task,
    done_dates: set[date],
    today: date,
    is_frozen: Callable[[date], bool] = lambda day: False,
    periods: Sequence[TaskSchedulePeriod] = (),
    open_from: date | None = None,
    others_reached: OthersReached | None = None,
    counted: set[date] | None = None,
) -> tuple[int, int]:
    """Текущая и лучшая серии выполнения (в днях).

    Серия — подряд идущие выполненные дни. Прерывает её только пропущенный
    запланированный день: незапланированные дни (у привычек «по дням недели», «через
    день» и «каждый месяц») и дни заморозки серию не рвут. Отметка в такой день —
    бонусная (`counted_days`): серию она не продолжает и не рвёт.
    Сегодняшний день ещё не закончился, поэтому пока он не отмечен, текущая серия тянется
    со вчерашнего. Запланирован ли прошлый день — по расписанию того дня (`periods`).
    `open_from` — с этого дня дни ещё не закончились (у совместной привычки — у кого-то из
    участников): невыполненные, они тоже не рвут серию. `counted` — уже посчитанные
    `counted_days`.

    «Гибкий график» — серии в периодах (`flexible_streaks`; `others_reached` — у
    совместной).
    """
    if task.frequency_type == FrequencyType.flexible:
        streaks = flexible_streaks(
            task, done_dates, today, is_frozen, periods, open_from, others_reached, counted
        )
        return streaks.current, streaks.best
    if not done_dates:
        return 0, 0
    if counted is None:
        counted = counted_days(task, done_dates, is_frozen, periods)
    is_due = due_check_with_history(task, periods)
    open_day = min(today, open_from) if open_from is not None else today
    current = best = 0
    day = min(done_dates)
    while day <= today:
        if day in counted:
            current += 1
            best = max(best, current)
        elif day not in done_dates and day < open_day and is_due(day) and not is_frozen(day):
            current = 0
        day += timedelta(days=1)
    return current, best


# Совместная привычка с «Гибким графиком»: набрали ли цель (дней) за период с первого по
# последний день все остальные участники, бывшие в группе весь период (groups.viewer_part).
OthersReached = Callable[[date, date, int], bool]


@dataclass(frozen=True)
class FlexibleStreaks:
    """Серии привычки «Гибкий график» (в периодах) и счёт текущего периода."""

    current: int
    best: int
    # Серия и лучшая серия по закончившимся периодам — без текущего: к ним приложение
    # само прибавляет текущий, когда в нём набрана цель (data/derive.ts).
    prior: int
    prior_best: int
    # Сколько дней выполнено в текущем периоде (по `today`) и сколько нужно.
    period_done: int
    quota: int


def _flexible_period(schedule: object, kind: str) -> int | None:
    """Цель расписания на период `kind` («Гибкий график» с тем же периодом) или None."""
    if getattr(schedule, "frequency_type", None) != FrequencyType.flexible:
        return None
    if getattr(schedule, "period", None) != kind:
        return None
    return getattr(schedule, "period_times", None) or 1


def flexible_streaks(
    task: Task,
    done_dates: Collection[date],
    today: date,
    is_frozen: Callable[[date], bool] = lambda day: False,
    periods: Sequence[TaskSchedulePeriod] = (),
    open_from: date | None = None,
    others_reached: OthersReached | None = None,
    counted: set[date] | None = None,
) -> FlexibleStreaks:
    """Серии «Гибкого графика» — в периодах (неделях, месяцах, годах).

    Период, где цель набрана (у совместной — и всеми остальными, `others_reached`), —
    +1 к серии; закончившийся без цели обнуляет её, но только если он полный: весь под
    этим графиком, не раньше первой отметки и без заморозки. Неполный (привычку начали или
    сменили частоту посреди периода, была заморожена) серию не рвёт. Период ещё не
    закончился (текущий; у совместной — у кого-то из участников, `open_from`) — тоже.
    Дни сверх цели периода и дни заморозки — бонусные (`counted_days`): не в счёт.
    """
    kind = task.period or "week"
    current_start, current_end = period_bounds(kind, today)
    times = _flexible_period(task, kind) or 1
    quota = period_quota(times, current_start, current_end)
    marked = {day for day in done_dates if day <= today}
    if counted is None:
        counted = counted_days(task, marked, is_frozen, periods)
    done = {day for day in counted if day <= today}
    period_done = sum(1 for day in done if day >= current_start)
    if not marked:
        return FlexibleStreaks(0, 0, 0, 0, period_done, quota)
    schedule_on = schedule_at(task, periods)
    first = min(marked)
    open_day = min(today, open_from) if open_from is not None else today
    run = best = 0
    start = period_bounds(kind, first)[0]
    while start < current_start:
        end = period_bounds(kind, start)[1]
        days = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
        target = _flexible_period(schedule_on(end), kind)
        if target is not None:
            need = period_quota(target, start, end)
            reached = sum(1 for day in days if day in done) >= need and (
                others_reached is None or others_reached(start, end, need)
            )
            full = (
                start >= first
                and all(_flexible_period(schedule_on(day), kind) is not None for day in days)
                and not any(is_frozen(day) for day in days)
            )
            if reached:
                run += 1
                best = max(best, run)
            elif full and end < open_day:
                run = 0
        start = end + timedelta(days=1)
    reached_now = period_done >= quota and (
        others_reached is None or others_reached(current_start, current_end, quota)
    )
    current = run + 1 if reached_now else run
    return FlexibleStreaks(current, max(best, current), run, best, period_done, quota)


def build_habit(
    task: Task,
    done_dates: set[date],
    today: date,
    freezes: Collection[tuple[date, date]] = (),
    today_count: int = 0,
    auto_mark_ahead: bool = True,
    day_counts: Mapping[date, int] | None = None,
    next_day_done: bool = False,
    created_on: date | None = None,
    periods: Sequence[TaskSchedulePeriod] = (),
    group: groups.ViewerGroup | None = None,
    notes: Mapping[date, str] | None = None,
) -> Habit:
    """Собрать схему `Habit`: расписание, отметка за сегодня, история и статистика серий.

    `done_dates` — даты выполнения по `today` включительно (Repository.get_done_dates):
    отметки «из будущего» (возможны после смены часового пояса на более западный) не
    учитываются ни в сетке, ни в сериях, ни в общем счётчике. `freezes` — прошедшие
    заморозки (Repository.get_freezes). `today_count` — сколько раз привычка выполнена
    за `today`. `auto_mark_ahead` — за календарный сегодня записи ещё нет (см.
    `_auto_mark_ahead`). `day_counts` — сколько раз привычка выполнена по дням истории
    (Repository.get_history_counts): по ним приложение закрашивает неполные дни привычки
    «несколько раз в день»; в режиме «Отмечать за вчера» — и за следующий день.
    `next_day_done` — выполнен ли день после `today` (календарный сегодня в режиме
    «Отмечать за вчера»), см. `Habit.next_day_done`. `created_on` — день создания
    привычки в поясе пользователя (`created_day`). `periods` — прежние расписания
    (Repository.get_schedule_periods). `notes` — заметки к дням истории
    (Repository.get_notes).

    Совместная привычка (`group`): сетка, серии и `total_done` — по дням, выполненным
    всеми (мои отметки и `group.others_done`), а `done_today` и `today_count` — моя часть
    (её и переключает кнопка).
    """
    is_frozen = frozen_check(task, freezes, today)
    flexible = task.frequency_type == FrequencyType.flexible
    # «Гибкий график» в совместной: у каждого своя цель на период — дни мои, а период
    # группы засчитан, когда цель набрали все (others_reached).
    shown = (
        done_dates
        if group is None or flexible
        else {day for day in done_dates if group.others_done(day)}
    )
    # Дни в сериях и счёте периода: без бонусных (не по расписанию того дня, заморожены, сверх цели).
    counted = counted_days(task, shown, is_frozen, periods)
    streaks = (
        flexible_streaks(
            task,
            shown,
            today,
            is_frozen,
            periods,
            group.open_from if group else None,
            group.others_reached if group else None,
            counted,
        )
        if flexible
        else None
    )
    if streaks is not None:
        current_streak, best_streak = streaks.current, streaks.best
    else:
        current_streak, best_streak = compute_streaks(
            task,
            shown,
            today,
            is_frozen,
            periods,
            group.open_from if group else None,
            counted=counted,
        )
    done_today = today in done_dates
    history_start = _history_start(today)
    return Habit(
        id=task.id,
        name=task.name,
        description=task.description,
        done_today=done_today,
        # «Гибкий график» — пока цель периода не набрана; в день, когда набрана, — тоже.
        scheduled_today=(
            streaks.period_done - (today in counted) < streaks.quota
            if streaks is not None
            else is_due_on(task, today)
        ),
        frequency_type=task.frequency_type.value,
        days=task_days(task),
        start_date=task.start_date,
        period=task.period if flexible else None,
        period_times=task.period_times if flexible else None,
        period_done=streaks.period_done if streaks is not None else 0,
        prior_streak=streaks.prior if streaks is not None else 0,
        prior_best=streaks.prior_best if streaks is not None else 0,
        history=build_history(shown, today),
        current_streak=current_streak,
        best_streak=best_streak,
        # «Всего выполнено» — все отметки, и бонусные: сколько раз сделана, а не по плану.
        total_done=len(shown),
        reminder_time=(
            task.reminder_time.strftime(REMINDER_TIME_FORMAT)
            if task.reminder_time is not None
            else None
        ),
        reminder_times=[value.strftime(REMINDER_TIME_FORMAT) for value in task.reminder_times],
        color=task.color,
        frozen_since=task.frozen_since,
        archived=task.archived_at is not None,
        frozen_history=[
            is_frozen(history_start + timedelta(days=offset)) for offset in range(HISTORY_DAYS)
        ],
        times_per_day=task.times_per_day,
        goal_unit=task.goal_unit or "times",
        today_count=today_count,
        auto_mark=task.auto_mark,
        overtime=task.overtime,
        auto_mark_ahead=auto_mark_ahead,
        history_counts=(
            group.my_units
            if group is not None
            else [
                (day_counts or {}).get(history_start + timedelta(days=offset), 0)
                for offset in range(HISTORY_DAYS)
            ]
            if counts_by_day(task, periods)
            else []
        ),
        next_day_done=next_day_done and (group is None or group.view.others_next_day),
        # Совместная — моя часть (как history_counts): по ней приложение знает мою отметку
        # за календарный сегодня, когда режим выключили.
        next_day_count=(
            group.my_next_day
            if group is not None
            else (day_counts or {}).get(today + timedelta(days=1), 0)
        ),
        created_on=created_on,
        started_on=started_day(task, done_dates, freezes, today),
        schedule_history=[
            SchedulePeriod(
                until=period.until,
                frequency_type=period.frequency_type.value,
                days=task_days(period),
                start_date=period.start_date,
                period=period.period,
                period_times=period.period_times,
                times_per_day=period.times_per_day,
                overtime=period.overtime and period.times_per_day > 1,
                goal_unit=period.goal_unit or "times",
            )
            for period in periods
        ],
        notes=dict(notes or {}),
        group=group.view if group is not None else None,
    )


def started_day(
    task: Task, done_dates: Collection[date], freezes: Collection[tuple[date, date]], today: date
) -> date | None:
    """Первый день привычки — с него идёт её отсчёт: самая ранняя отметка или первый день
    заморозки (замороженный день считается как отмеченный), по `today` включительно.
    Пока нет ни того ни другого — None: привычка просто существует."""
    days = [day for day in done_dates if day <= today]
    days += [start for start, end in freezes if start < end and start <= today]
    if task.frozen_since is not None and task.frozen_since <= today:
        days.append(task.frozen_since)
    return min(days, default=None)


def created_day(task: Task, user: User) -> date:
    """День создания привычки — календарный день в поясе пользователя (created_at — UTC)."""
    return pytz.utc.localize(task.created_at).astimezone(resolve_timezone(user.timezone)).date()


def _calendar_day(user: User) -> date:
    """Календарный сегодня в поясе пользователя: в режиме «Отмечать за вчера» — день
    после дня отметки."""
    return user_today(user) + timedelta(days=1 if user.mark_yesterday else 0)


async def _auto_mark_ahead(repo: Repository, user: User, task_ids: list[int]) -> set[int]:
    """Привычки, у которых за календарный сегодня (в поясе пользователя; в режиме
    «Отмечать за вчера» — день после дня отметки) записи ещё нет: ни отметки, ни снятой
    отметки. По этому приложение само показывает автоотметку, когда ей пора, не дожидаясь
    бота и связи; снятую пользователем — не трогает (как бот, `auto_mark_due`)."""
    if not task_ids:
        return set()
    day = _calendar_day(user)
    logged = await repo.get_logged_task_days({(task_id, day) for task_id in task_ids})
    return {task_id for task_id in task_ids if (task_id, day) not in logged}


async def _built_habit(repo: Repository, user: User, task: Task) -> Habit:
    """Привычка с отметками из базы (после изменения или отметки)."""
    [habit] = await _build_habits(repo, user, [task])
    return habit


async def list_habits(repo: Repository, user: User) -> list[Habit]:
    """Все активные привычки пользователя с историей и статистикой (для `GET /tasks`)."""
    return await _build_habits(repo, user, await repo.get_active_tasks(user.telegram_id))


async def own_habit(repo: Repository, user: User, task: Task) -> Habit:
    """Привычка по отметкам одного пользователя, даже если она совместная: его сетка,
    серии и счёт (страница участника, groups.member_habit)."""
    [habit] = await _build_habits(repo, user, [task], with_groups=False)
    return habit


async def _build_habits(
    repo: Repository, user: User, tasks: list[Task], with_groups: bool = True
) -> list[Habit]:
    """Привычки пользователя с историей и статистикой. Отметки всех привычек читаются
    одним запросом, а не по запросу на привычку; совместные — вместе с участниками
    (`with_groups` False — как обычные, только по его отметкам)."""
    today, calendar = user_today(user), _calendar_day(user)
    task_ids = [task.id for task in tasks]
    # По календарный день: в режиме «Отмечать за вчера» приложение знает и следующий день
    # — выключили режим, и сегодняшние отметки видны сразу, без ответа сервера.
    done = await repo.get_done_dates(task_ids, calendar)
    freezes = await repo.get_freezes(task_ids)
    periods = await repo.get_schedule_periods(task_ids)
    # Счёт по дням нужен только привычкам «несколько раз в день» (сейчас или раньше).
    counts = await repo.get_history_counts(
        [task.id for task in tasks if counts_by_day(task, periods[task.id])],
        _history_start(today),
        calendar,
    )
    ahead = await _auto_mark_ahead(repo, user, task_ids)
    notes = await repo.get_notes(task_ids, _history_start(today), today)
    members = await repo.members_of_tasks(task_ids) if with_groups else {}
    states = await groups.load_groups(repo, {member.group_id for member in members.values()})

    def group_of(task: Task) -> groups.ViewerGroup | None:
        member = members.get(task.id)
        state = states.get(member.group_id) if member is not None else None
        return groups.viewer_part(state, task.id, today) if state is not None else None

    return [
        build_habit(
            task,
            {day for day in done[task.id] if day <= today},
            today,
            freezes[task.id],
            counts.get(task.id, {}).get(today, 0),
            task.id in ahead,
            counts.get(task.id),
            calendar > today and calendar in done[task.id],
            created_day(task, user),
            periods[task.id],
            group_of(task),
            notes[task.id],
        )
        for task in tasks
    ]


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
    return await _built_habit(repo, user, task)


async def _quota_open(repo: Repository, pairs: Collection[tuple[Task, date]]) -> set[int]:
    """Привычки «Гибкий график» из пар (привычка, день), у которых цель периода этого дня
    ещё не набрана другими днями, — их пора отмечать (напоминания, автоотметка)."""
    if not pairs:
        return set()
    done = await repo.get_done_dates(
        {task.id for task, _ in pairs}, max(day for _, day in pairs)
    )
    open_ids = set()
    for task, day in pairs:
        start, end = period_bounds(task.period or "week", day)
        others = sum(1 for other in done[task.id] if start <= other <= day and other != day)
        if others < period_quota(task.period_times or 1, start, end):
            open_ids.add(task.id)
    return open_ids


def _flexible(task: Task) -> bool:
    return task.frequency_type == FrequencyType.flexible


@dataclass(frozen=True)
class HabitFields:
    """Проверенные поля формы привычки — в том виде, в каком их хранит `Task`."""

    name: str
    # None — без описания (или, при изменении, `HabitCreate.description` не передано).
    description: str | None
    frequency_type: FrequencyType
    days: str | None
    start_date: date | None
    # «Гибкий график»: период и сколько дней за него (у остальных — None).
    period: str | None
    period_times: int | None
    # Все напоминания по возрастанию: первое — Task.reminder_time, остальные — TaskReminder.
    reminder_times: list[time]
    color: str
    times_per_day: int
    auto_mark: bool
    overtime: bool
    # «Цель по времени»: seconds — times_per_day в секундах.
    goal_unit: str = "times"

    @property
    def reminder_time(self) -> time | None:
        return self.reminder_times[0] if self.reminder_times else None

    @property
    def extra_reminder_times(self) -> list[time]:
        return self.reminder_times[1:]


async def _validate_habit_fields(
    repo: Repository, user: User, payload: HabitCreate, task_id: int | None = None
) -> HabitFields:
    """Проверить поля формы привычки (создание и изменение).

    Имя не должно дублировать другую активную привычку пользователя (без учёта
    регистра); `task_id` — изменяемая привычка, сама себе она не дубликат.
    """
    name = validation.validate_name(payload.name)
    description = (
        validation.validate_description(payload.description)
        if payload.description is not None
        else None
    )
    frequency_type, days, start_date = validation.validate_frequency(
        payload.frequency_type, payload.days, payload.start_date, user_today(user)
    )
    period, period_times = validation.validate_period(
        frequency_type, payload.period, payload.period_times
    )
    reminder_times = validation.validate_reminder_times(
        payload.reminder_time, payload.reminder_times
    )
    color = validation.validate_color(payload.color)
    goal_unit = validation.validate_goal_unit(payload.goal_unit)
    # «Цель по времени» — только у личных привычек: таймер у каждого свой.
    if goal_unit == "seconds" and payload.shared:
        raise ApiError(422, "invalid_goal_unit", "У групповой привычки нет цели по времени")
    times_per_day = validation.validate_times_per_day(payload.times_per_day, goal_unit)

    return HabitFields(
        name=name,
        description=description,
        frequency_type=frequency_type,
        days=days,
        start_date=start_date,
        period=period,
        period_times=period_times,
        reminder_times=reminder_times,
        color=color,
        times_per_day=times_per_day,
        # Автоотметка — только у привычек «раз в день».
        auto_mark=payload.auto_mark and times_per_day == 1 and goal_unit == "times",
        # «Сверх плана» — только у привычек «несколько раз в день» (и по времени).
        overtime=payload.overtime and times_per_day > 1,
        goal_unit=goal_unit,
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
        description=fields.description,
        frequency_type=fields.frequency_type,
        days=fields.days,
        start_date=fields.start_date,
        period=fields.period,
        period_times=fields.period_times,
        reminder_time=fields.reminder_time,
        extra_reminder_times=fields.extra_reminder_times,
        color=fields.color,
        times_per_day=fields.times_per_day,
        auto_mark=fields.auto_mark,
        overtime=fields.overtime,
        goal_unit=fields.goal_unit,
        client_ref=client_ref,
    )
    await repo.log_action(user.telegram_id, "habit_created", ref_id=task.id)
    return task


async def create_habit(repo: Repository, user: User, payload: HabitCreate) -> Habit:
    """Создать привычку и вернуть её в форме `Habit` (не больше `MAX_HABITS_PER_USER`)."""
    task = await _create_task(repo, user, payload)
    # У новой привычки ещё нет отметок; создана сегодня.
    return build_habit(task, set(), user_today(user), created_on=_calendar_day(user))


async def update_habit(
    repo: Repository, user: User, task: Task, payload: HabitCreate
) -> Habit:
    """Изменить привычку (все поля формы) и вернуть её в форме `Habit`.

    История отметок не трогается. Новое расписание действует с дня отметки: прежнее
    запоминается (TaskSchedulePeriod), и прошлые дни по-прежнему оцениваются по нему.

    Групповая привычка: общие поля (название, расписание, цель) меняет только владелец —
    и они меняются у всех участников; автоотметки в ней нет (groups.py). `shared`: true —
    привычка становится групповой, false — снова обычной (пока в ней никого, кроме него),
    не передано — как была.
    """
    if payload.shared is False:
        await groups.unshare(repo, user, task)
    elif payload.shared:
        payload = payload.model_copy(update={"auto_mark": False})
    payload = await groups.restrict_update(repo, user, task, payload)
    fields = await _validate_habit_fields(repo, user, payload, task_id=task.id)
    if (
        fields.goal_unit == "seconds"
        and payload.shared is None
        and task.id in await repo.members_of_tasks([task.id])
    ):
        raise ApiError(422, "invalid_goal_unit", "У групповой привычки нет цели по времени")
    auto_mark_turned_on = fields.auto_mark and not task.auto_mark
    await remember_schedule(
        repo, user, task, fields.frequency_type, fields.days, fields.start_date,
        fields.times_per_day, fields.period, fields.period_times, fields.overtime,
        fields.goal_unit,
    )
    await repo.update_task(
        task,
        name=fields.name,
        # Старые клиенты описания не присылают — оно остаётся прежним.
        description=(
            fields.description if payload.description is not None else task.description
        ),
        frequency_type=fields.frequency_type,
        days=fields.days,
        start_date=fields.start_date,
        period=fields.period,
        period_times=fields.period_times,
        reminder_time=fields.reminder_time,
        extra_reminder_times=fields.extra_reminder_times,
        color=fields.color,
        times_per_day=fields.times_per_day,
        auto_mark=fields.auto_mark,
        overtime=fields.overtime,
        goal_unit=fields.goal_unit,
    )
    # Цель могла смениться — «цель достигнута» придёт по новой; без цели по времени
    # таймер снимается.
    timer = await repo.get_timer(user.telegram_id)
    if timer is not None and timer.task_id == task.id:
        if fields.goal_unit == "seconds":
            await _refresh_timer_notice(repo, user, task, timer)
        else:
            await repo.delete_timer(user.telegram_id)
    await repo.log_action(user.telegram_id, "habit_updated", ref_id=task.id)
    await groups.share_owner_changes(repo, user, task)
    if payload.shared:
        await groups.create_group(repo, user, task)
    # Включили автоотметку — это «отмечай заново», даже если отметку за сегодня сняли
    # (бот сам снятую отметку не трогает). День, который уже пора отметить (без
    # напоминания — сегодняшний, с напоминаниями — если последнее сегодня уже было),
    # отмечается сразу, а не через минуту, когда до него дойдёт бот. Если напоминание
    # ещё впереди — снятая отметка за сегодня забывается: после него бот (и приложение)
    # отметят день как обычно.
    if auto_mark_turned_on:
        now = datetime.now(pytz.utc)
        day = _auto_mark_day(task, user, now)
        if day is not None and _flexible(task) and not await _quota_open(repo, [(task, day)]):
            day = None
        if day is not None:
            if not await repo.get_done_task_days([(task.id, day)]):
                await _auto_mark(repo, task, day)
        else:
            calendar_day = now.astimezone(resolve_timezone(user.timezone)).date()
            await repo.delete_undone_log(task.id, calendar_day)
    return await _built_habit(repo, user, task)


def goal_on(task: Task, periods: Sequence[TaskSchedulePeriod], day: date) -> tuple[int, bool]:
    """Цель «раз в день» и «Сверх плана», действовавшие в день `day` (прежнее расписание
    или текущее)."""
    goal, overtime = task.times_per_day, task.overtime
    for period in periods:
        if day < period.until:
            goal, overtime = period.times_per_day, period.overtime
            break
    return goal, overtime and goal > 1


def unit_on(task: Task, periods: Sequence[TaskSchedulePeriod], day: date) -> str:
    """В чём была цель в день `day`: times или seconds («Цель по времени»)."""
    for period in periods:
        if day < period.until:
            return period.goal_unit
    return task.goal_unit


def timer_day_end(user: User, started_at: datetime) -> datetime:
    """Когда кончается день таймера, запущенного в `started_at` (UTC без пояса): ближайшая
    полночь в поясе пользователя — дальше таймер не идёт (на устройстве он там
    останавливается, data/store.ts)."""
    zone = resolve_timezone(user.timezone)
    local = pytz.utc.localize(started_at).astimezone(zone)
    midnight = zone.localize(datetime.combine(local.date() + timedelta(days=1), time.min))
    return midnight.astimezone(pytz.utc).replace(tzinfo=None)


def _timer_notify_at(
    user: User,
    task: Task,
    periods: Sequence[TaskSchedulePeriod],
    day: date,
    started_at: datetime,
    done: int,
) -> datetime | None:
    """Когда таймер, идущий с `started_at`, наберёт цель дня `day` (уже набрано `done`
    секунд); None — уже набрал или не успеет до полуночи (там таймер останавливается)."""
    goal, _ = goal_on(task, periods, day)
    if done >= goal:
        return None
    reached = started_at + timedelta(seconds=goal - done)
    return reached if reached < timer_day_end(user, started_at) else None


async def _refresh_timer_notice(
    repo: Repository, user: User, task: Task, timer: RunningTimer
) -> None:
    """Пересчитать, когда идущий таймер наберёт цель (счёт дня или цель изменились)."""
    periods = (await repo.get_schedule_periods([task.id]))[task.id]
    log = await repo.get_log(task.id, timer.day)
    done = (log.count or 0) if log is not None else 0
    await repo.set_timer_notify_at(
        timer, _timer_notify_at(user, task, periods, timer.day, timer.started_at, done)
    )


async def running_timer(repo: Repository, user: User) -> RunningTimerView | None:
    """Идущий таймер пользователя (ответ /sync); у удалённой привычки — нет."""
    timer = await repo.get_timer(user.telegram_id)
    if timer is None or await repo.get_active_task(timer.task_id, user.telegram_id) is None:
        return None
    return RunningTimerView(task=timer.task_id, date=timer.day, started_at=timer.started_at)


@dataclass(frozen=True)
class TimerGoalNotice:
    """«Цель достигнута»: идущий таймер набрал цель дня (бот присылает уведомление)."""

    task_id: int
    user_id: int
    habit_name: str
    language: str
    telegram: bool
    # Цель дня, в секундах.
    goal: int


async def due_timer_goals(repo: Repository, moment: datetime) -> list[TimerGoalNotice]:
    """Таймеры, набравшие цель к `moment` (UTC без пояса) хотя бы TIMER_NOTICE_GRACE_SECONDS
    назад — за это время открытое приложение успевает само записать цель, и уведомления
    тогда нет. О каждом — одно, поэтому они сразу помечаются сообщёнными (зовёт бот раз в
    минуту, bot/reminders.py)."""
    notices: list[TimerGoalNotice] = []
    since = moment - timedelta(seconds=TIMER_NOTICE_GRACE_SECONDS)
    for timer, task in await repo.get_timers_to_notify(since):
        await repo.set_timer_notify_at(timer, None)
        if task.user.blocked_at is not None:
            continue
        periods = (await repo.get_schedule_periods([task.id]))[task.id]
        notices.append(
            TimerGoalNotice(
                task_id=task.id,
                user_id=task.user_id,
                habit_name=task.name,
                language=task.user.language,
                telegram=task.user.telegram_notifications,
                goal=goal_on(task, periods, timer.day)[0],
            )
        )
    return notices


def counts_by_day(task: Task, periods: Sequence[TaskSchedulePeriod]) -> bool:
    """Нужен ли счёт по дням: привычка «несколько раз в день» сейчас или в каком-то из
    прежних расписаний."""
    return task.times_per_day > 1 or any(period.times_per_day > 1 for period in periods)


async def remember_schedule(
    repo: Repository,
    user: User,
    task: Task,
    frequency_type: FrequencyType,
    days: str | None,
    start_date: date | None,
    times_per_day: int,
    period: str | None = None,
    period_times: int | None = None,
    overtime: bool = False,
    goal_unit: str = "times",
) -> None:
    """Расписание задачи меняется на это (повтор, дни, первый день, период «Гибкого
    графика», цель, «Сверх плана» или цель по времени) — запомнить прежнее как
    действовавшее до дня отметки. У привычки, созданной в этот же день, прошлого нет —
    запоминать нечего."""
    changed = (
        task.frequency_type != frequency_type
        or (task.days or None) != (days or None)
        or task.start_date != start_date
        or task.times_per_day != times_per_day
        or task.period != period
        or task.period_times != period_times
        or (task.overtime and task.times_per_day > 1) != (overtime and times_per_day > 1)
        or task.goal_unit != goal_unit
    )
    today = user_today(user)
    if changed and created_day(task, user) < today:
        await repo.add_schedule_period(task, today)


async def delete_habit(repo: Repository, user: User, task: Task) -> None:
    """Удалить привычку (мягко) и записать это в ленту. Групповая — сначала выход из
    группы (её дни в группе остаются в счёте)."""
    await groups.forget_task(repo, user, task)
    await repo.delete_timer(user.telegram_id, task.id)
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


async def list_folders(repo: Repository, user: User) -> list[FolderView]:
    """Папки пользователя по порядку; привычки в каждой — только активные, в порядке
    списка привычек. Рекомендуемую папку (`kind`) наполняет устройство — привычек в ней
    нет."""
    folders = await repo.get_folders(user.telegram_id)
    if not folders:
        return []
    active = [task.id for task in await repo.get_active_tasks(user.telegram_id)]
    views = []
    for folder in folders:
        inside = set(folder.task_ids or [])
        views.append(
            FolderView(
                id=folder.id,
                name=folder.name,
                habits=[task_id for task_id in active if task_id in inside],
                types=list(folder.habit_types or []),
                kind=folder.kind,
            )
        )
    return views


async def all_habits_position(repo: Repository, user: User) -> int:
    """Место папки «Все привычки» среди папок — не дальше последней."""
    return min(user.all_habits_position, len(await repo.get_folders(user.telegram_id)))


async def _folder_task_ids(repo: Repository, user: User, payload: FolderInput) -> list[int]:
    """Id привычек папки: каждая — по id или id устройства; удалённые (или так и не
    созданные) пропускаются — их и на устройстве больше нет."""
    task_ids: list[int] = []
    for ref in payload.habits:
        task = await _task_by_ref(repo, user, ref)
        if task is not None and task.id not in task_ids:
            task_ids.append(task.id)
    return task_ids


def _folder_types(payload: FolderInput) -> list[str]:
    """Типы привычек папки — без повторов, в порядке FOLDER_HABIT_TYPES."""
    return [kind for kind in FOLDER_HABIT_TYPES if kind in payload.types]


async def _folder_by_ref(repo: Repository, user: User, ref: int | str) -> Folder | None:
    """Папка пользователя по id на сервере или по id устройства."""
    if isinstance(ref, int):
        return await repo.get_folder(ref, user.telegram_id)
    return await repo.get_folder_by_ref(user.telegram_id, ref)


async def _apply_folder_op(
    repo: Repository,
    user: User,
    op: SyncFolderCreate | SyncFolderUpdate | SyncFolderDelete | SyncFolderOrder,
) -> SyncResult:
    """Применить операцию /sync с папками (ошибка — ApiError)."""
    if isinstance(op, SyncFolderCreate):
        existing = await repo.get_folder_by_ref(user.telegram_id, op.ref)
        if existing is not None:
            return SyncResult(ok=True, id=existing.id)
        if len(await repo.get_folders(user.telegram_id)) >= MAX_FOLDERS_PER_USER:
            raise ApiError(
                409, "folder_limit", f"Можно завести не больше {MAX_FOLDERS_PER_USER} папок"
            )
        name = validation.validate_folder_name(op.folder.name)
        task_ids = [] if op.folder.kind else await _folder_task_ids(repo, user, op.folder)
        types = [] if op.folder.kind else _folder_types(op.folder)
        folder = await repo.create_folder(
            user.telegram_id, name, task_ids, types, op.ref, kind=op.folder.kind
        )
        return SyncResult(ok=True, id=folder.id)
    if isinstance(op, SyncFolderUpdate):
        folder = await _folder_by_ref(repo, user, op.key)
        if folder is None:
            raise ApiError(404, "folder_not_found", "Папка не найдена")
        name = validation.validate_folder_name(op.folder.name)
        # Вид папки не меняется: у рекомендуемой меняется только название.
        task_ids = [] if folder.kind else await _folder_task_ids(repo, user, op.folder)
        types = [] if folder.kind else _folder_types(op.folder)
        await repo.update_folder(folder, name, task_ids, types)
        return SyncResult(ok=True)
    if isinstance(op, SyncFolderDelete):
        # Уже удалённая (или так и не созданная) папка — цель достигнута.
        folder = await _folder_by_ref(repo, user, op.key)
        if folder is not None:
            # Папка стояла перед «Все привычки» — та сдвигается на её место.
            folders = await repo.get_folders(user.telegram_id)
            if folders.index(folder) < user.all_habits_position:
                user.all_habits_position -= 1
            await repo.delete_folder(folder)
        return SyncResult(ok=True)
    # Порядок: названные папки — как названы, остальные (созданные на другом устройстве)
    # — за ними в прежнем порядке; «Все привычки» — на месте null (нет его — первой).
    folders = await repo.get_folders(user.telegram_id)
    ordered: list[Folder] = []
    all_habits_position = 0
    for ref in op.order:
        if ref is None:
            all_habits_position = len(ordered)
            continue
        folder = await _folder_by_ref(repo, user, ref)
        if folder is not None and folder not in ordered:
            ordered.append(folder)
    ordered += [folder for folder in folders if folder not in ordered]
    await repo.set_folder_order(user, ordered, all_habits_position)
    return SyncResult(ok=True)


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
        # День — по цели и «Сверх плана», которые действовали в тот день (прошлое не
        # переписывается сменой настроек).
        periods = (await repo.get_schedule_periods([task.id]))[task.id]
        goal, overtime = goal_on(task, periods, op.date)
        # Больше цели — только у «Сверх плана» (отметка могла ждать в очереди, пока
        # настройку выключили).
        if op.count is not None and not overtime:
            op = op.model_copy(update={"count": min(op.count, goal)})
        # Время за день — не больше 23:59:59.
        if op.count is not None and unit_on(task, periods, op.date) == "seconds":
            op = op.model_copy(update={"count": min(op.count, MAX_DAY_SECONDS)})
        # Привычка «несколько раз в день»: день выполнен, когда набрана цель того дня.
        done = op.done if op.count is None else op.count >= goal
        # Отметить можно любой день, и незапланированный тоже (и сверх цели «Гибкого
        # графика»): такая отметка — бонусная, в серии не идёт (counted_days).
        target = TaskStatus.done if done else TaskStatus.pending
        if log.count != op.count:
            await repo.set_log_count(log, op.count)
            timer = await repo.get_timer(user.telegram_id)
            if timer is not None and timer.task_id == task.id and timer.day == op.date:
                await _refresh_timer_notice(repo, user, task, timer)
        if log.status != target:
            await repo.set_log_status(log, target)
            await _record_mark(repo, user, task, done)
        outcome.checked_in = outcome.checked_in or done
        return SyncResult(ok=True)
    if isinstance(op, SyncTimer):
        return await _apply_timer(repo, user, op)
    if isinstance(op, SyncNote):
        task = await _active_task(repo, user, op.task)
        # День — как у отметки: в пределах истории, не позже дня отметки.
        today = user_today(user)
        if not today - timedelta(days=HISTORY_DAYS) < op.date <= today:
            raise ApiError(422, "invalid_date", "День вне истории привычки")
        await repo.set_note(task, op.date, validation.validate_note(op.text), utc_now())
        return SyncResult(ok=True)
    if isinstance(op, SyncFreeze):
        task = await _active_task(repo, user, op.task)
        # День — как у отметки: устройство замораживает с дня отметки, который видит.
        today = user_today(user)
        if not today - timedelta(days=HISTORY_DAYS) < op.date <= today:
            raise ApiError(422, "invalid_date", "День вне истории привычки")
        if op.frozen and task.frozen_since is None:
            # Замороженная не идёт: её таймер снимается (время устройство уже записало).
            await repo.delete_timer(user.telegram_id, task.id)
            await repo.freeze_task(task, op.date)
            await repo.log_action(user.telegram_id, "habit_frozen", ref_id=task.id)
        elif not op.frozen and task.frozen_since is not None:
            await repo.unfreeze_task(task, op.date)
            await repo.log_action(user.telegram_id, "habit_unfrozen", ref_id=task.id)
        return SyncResult(ok=True)
    if isinstance(op, SyncArchive):
        task = await _active_task(repo, user, op.task)
        if op.archived != (task.archived_at is not None):
            await repo.set_archived(task, utc_now() if op.archived else None)
            await repo.log_action(
                user.telegram_id,
                "habit_archived" if op.archived else "habit_unarchived",
                ref_id=task.id,
            )
        return SyncResult(ok=True)
    if isinstance(op, SyncCreate):
        # Повтор уже применённого создания (ответ на прошлый запрос не дошёл) — та же
        # привычка, а не вторая.
        existing = await repo.get_task_by_ref(user.telegram_id, op.ref)
        if existing is not None:
            return SyncResult(ok=True, id=existing.id)
        first = not await repo.has_any_task(user.telegram_id)
        task = await _create_task(repo, user, op.habit, client_ref=op.ref)
        if op.habit.shared:
            await groups.create_group(repo, user, task)
        outcome.first_habit = outcome.first_habit or first
        return SyncResult(ok=True, id=task.id)
    if isinstance(op, SyncUpdate):
        await update_habit(repo, user, await _active_task(repo, user, op.task), op.habit)
        return SyncResult(ok=True)
    if isinstance(op, (SyncFolderCreate, SyncFolderUpdate, SyncFolderDelete, SyncFolderOrder)):
        return await _apply_folder_op(repo, user, op)
    if isinstance(op, SyncDelete):
        # Уже удалённая (или так и не созданная) привычка — цель достигнута.
        task = await _task_by_ref(repo, user, op.task)
        if task is not None:
            await delete_habit(repo, user, task)
        return SyncResult(ok=True)
    await update_settings(repo, user, op.patch)
    return SyncResult(ok=True)


async def _apply_timer(repo: Repository, user: User, op: SyncTimer) -> SyncResult:
    """Запустить таймер привычки «Цель по времени» или снять (`task` null). Время
    остановленного таймера уже пришло отметкой перед этой операцией."""
    if op.task is None:
        await repo.delete_timer(user.telegram_id)
        return SyncResult(ok=True)
    task = await _active_task(repo, user, op.task)
    if task.goal_unit != "seconds" or op.date is None or op.started_at is None:
        raise ApiError(422, "invalid_timer", "Таймер только у привычки с целью по времени")
    today = user_today(user)
    if not today - timedelta(days=HISTORY_DAYS) < op.date <= today:
        raise ApiError(422, "invalid_date", "День вне истории привычки")
    # Момент — UTC без пояса, как в базе; из будущего (неверные часы устройства) — сейчас.
    started_at = min(op.started_at.astimezone(pytz.utc).replace(tzinfo=None), utc_now())
    current = await repo.get_timer(user.telegram_id)
    # Повтор того же запуска (ответ не дошёл): уведомление, если уже ушло, не повторяется.
    if (
        current is not None
        and current.task_id == task.id
        and current.day == op.date
        and current.started_at == started_at
    ):
        return SyncResult(ok=True)
    log = await repo.get_log(task.id, op.date)
    done = (log.count or 0) if log is not None else 0
    periods = (await repo.get_schedule_periods([task.id]))[task.id]
    await repo.set_timer(
        user.telegram_id,
        task.id,
        op.date,
        started_at,
        _timer_notify_at(user, task, periods, op.date, started_at, done),
    )
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


def _auto_mark_day(task: Task, user: User, moment: datetime) -> date | None:
    """День, который у привычки «Автоотметка» пора отметить в момент `moment`,
    или None.

    День — сегодняшний по календарю пользователя (как у напоминаний, режим «Отмечать за
    вчера» не влияет), запланированный и не замороженный. Без напоминания его пора
    отмечать с самого начала, с напоминанием — с минуты напоминания (бот сначала шлёт
    напоминание, потом отмечает).
    """
    if (
        not task.auto_mark
        or task.times_per_day != 1
        or task.frozen_since is not None
        or user.blocked_at is not None
    ):
        return None
    local = moment.astimezone(resolve_timezone(user.timezone))
    day = local.date()
    # «Гибкий график» — каждый день, пока не набрана цель (это проверяет _quota_open).
    if not _flexible(task) and not is_due_on(task, day):
        return None
    # С напоминаниями — после последнего: до него напоминания ещё приходят.
    reminders = task.reminder_times
    if reminders and (local.hour, local.minute) < (reminders[-1].hour, reminders[-1].minute):
        return None
    return day


async def _auto_mark(repo: Repository, task: Task, day: date) -> None:
    """Отметить привычку выполненной за день автоматически. В ленту — auto_checkin, но
    не день отметки: это не действие пользователя (аналитика считает его отметки)."""
    await repo.add_done_log(task, day)
    await repo.log_action(task.user_id, "auto_checkin", ref_id=task.id)


async def auto_mark_due(repo: Repository, moment: datetime) -> int:
    """Отметить привычки «Автоотметка», которым пора (см. `_auto_mark_day`),
    и вернуть, сколько отмечено. День, на который запись уже есть, не трогается: и
    отмеченный, и тот, с которого пользователь сам снял отметку.

    Зовёт бот раз в минуту, после напоминаний этой минуты (bot/reminders.py). Проверяет
    все такие привычки, а не только наступившие сейчас: отметка не теряется, даже если
    бот в нужную минуту не работал.
    """
    candidates: list[tuple[Task, date]] = []
    for task in await repo.get_auto_mark_tasks():
        day = _auto_mark_day(task, task.user, moment)
        if day is not None:
            candidates.append((task, day))
    if not candidates:
        return 0
    open_ids = await _quota_open(repo, [(task, day) for task, day in candidates if _flexible(task)])
    candidates = [
        (task, day) for task, day in candidates if not _flexible(task) or task.id in open_ids
    ]
    logged = await repo.get_logged_task_days({(task.id, day) for task, day in candidates})
    marked = 0
    for task, day in candidates:
        if (task.id, day) not in logged:
            await _auto_mark(repo, task, day)
            marked += 1
    return marked


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
    # Готовый текст вместо «Пора выполнить…» (уведомление «Отметки участников» совместной
    # привычки, groups.due_group_marks) — без 🔔 и пишется в ленту по-своему.
    text: str | None = None


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
    запланирована, и только пока она за этот день не отмечена выполненной. Замороженной и
    архивной привычке и пользователю, заблокированному администратором, напоминания не
    приходят.

    «Этот день» — всегда сегодняшний по календарю пользователя: режим «Отмечать за вчера»
    на напоминания о привычках не влияет (сегодня по расписанию — сегодня и напомнит).

    Из базы читаются только привычки, время напоминания которых где-то на Земле
    наступило сейчас (по индексу, см. `_clock_times`), — а не все привычки с
    напоминанием; отметки за день проверяются одним запросом на всех.
    """
    candidates: list[tuple[Task, date]] = []
    for task in await repo.get_active_tasks_with_reminder_at(_clock_times(moment)):
        if (
            task.user.blocked_at is not None
            or task.frozen_since is not None
            or task.archived_at is not None
        ):
            continue
        local = moment.astimezone(resolve_timezone(task.user.timezone))
        if not any(
            (reminder.hour, reminder.minute) == (local.hour, local.minute)
            for reminder in task.reminder_times
        ):
            continue
        day = local.date()
        if is_due_on(task, day) or _flexible(task):
            candidates.append((task, day))
    # «Гибкий график» — пока цель периода не набрана.
    open_ids = await _quota_open(repo, [(task, day) for task, day in candidates if _flexible(task)])
    candidates = [
        (task, day) for task, day in candidates if not _flexible(task) or task.id in open_ids
    ]
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
    отметки запланирована хотя бы одна незамороженная привычка не из архива и не все
    такие уже отмечены: иначе отмечать нечего.
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
    tasks = [
        task
        for task in await repo.get_active_tasks_of(candidates)
        if task.frozen_since is None
        and task.archived_at is None
        and (_flexible(task) or is_due_on(task, candidates[task.user_id][1]))
    ]
    open_ids = await _quota_open(
        repo, [(task, candidates[task.user_id][1]) for task in tasks if _flexible(task)]
    )
    pending = [
        (task.id, candidates[task.user_id][1], task.user_id)
        for task in tasks
        if not _flexible(task) or task.id in open_ids
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
        grid_layout=user.grid_layout,
        telegram_notifications=user.telegram_notifications,
        folder_swipe=user.folder_swipe,
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
        grid_layout=(
            validation.validate_grid_layout(payload.grid_layout)
            if payload.grid_layout is not None
            else None
        ),
        checkin_reminder=(
            (
                validation.validate_reminder_time(payload.checkin_reminder.time),
                validation.validate_days(payload.checkin_reminder.days),
            )
            if payload.checkin_reminder is not None
            else None
        ),
        telegram_notifications=payload.telegram_notifications,
        folder_swipe=payload.folder_swipe,
    )
    changed = sorted(payload.model_dump(exclude_none=True))
    if changed:
        await repo.log_action(user.telegram_id, "settings", detail=",".join(changed))


def _user_review(review: Review) -> UserReview:
    return UserReview(
        id=review.id,
        text=review.text,
        created_at=review.created_at,
        reply_text=review.reply_text,
        replied_at=review.replied_at,
    )


async def list_user_reviews(repo: Repository, user: User) -> ReviewsResponse:
    """История отзывов пользователя (экран «Написать отзыв»), новые сначала."""
    return ReviewsResponse(
        reviews=[_user_review(review) for review in await repo.user_reviews(user.telegram_id)]
    )


async def create_review(repo: Repository, user: User, payload: ReviewCreate) -> UserReview:
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
    return UserReview(id=review.id, text=review.text, created_at=review.created_at)


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
