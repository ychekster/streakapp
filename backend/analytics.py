"""Аналитика админ-панели: воронка новых пользователей, активность, привычки и доля
выполнения.

Воронка — пользователи, появившиеся за период (запустили бота или сразу открыли
приложение): сколько из них открыли приложение и сколько из тех добавили хотя бы одну
привычку.

Дни — по UTC (кроме доли выполнения: отметки хранятся датой в поясе пользователя).
Счётчики и ряды по дням берутся из базы агрегатами (Repository), а доля выполнения
считается здесь — по расписаниям активных привычек:

- запланировано на день D — активные привычки, созданные не позже D, у которых D —
  день расписания;
- выполнено — отметки `done` таких привычек за D (отметка в незапланированный день не
  считается, поэтому доля не больше 100%).

Удалённые привычки не учитываются вовсе: когда их удалили, база не хранит, и в прошлые
дни они исказили бы знаменатель.
"""

from __future__ import annotations

from bisect import bisect_right
from collections import Counter
from collections.abc import Callable
from datetime import date, datetime, time, timedelta

from backend.constants import HABITS_DISTRIBUTION_MAX
from backend.repository import Repository, TaskSchedule
from backend.models import FrequencyType
from backend.schedule import due_check, due_weekdays
from backend.schemas import (
    AnalyticsActivity,
    AnalyticsAudience,
    AnalyticsDay,
    AnalyticsFunnel,
    AnalyticsHabits,
    AnalyticsResponse,
    AnalyticsUsers,
    HabitsBucket,
)

_WEEK_DAYS = 7
_MONTH_DAYS = 30


def _ratio(part: int, whole: int) -> float | None:
    """Доля с тремя знаками; None — делить не на что."""
    return round(part / whole, 3) if whole else None


def completion_by_day(
    schedules: list[TaskSchedule], done: list[tuple[int, date]], days: list[date]
) -> list[tuple[int, int]]:
    """(запланировано, выполнено) на каждый день `days` — см. описание модуля.

    Сколько привычек запланировано на день, считается двоичным поиском по отсортированным
    датам создания привычек этого дня недели, а не перебором всех привычек на каждый день.
    Привычки «через день» к дню недели не привязаны — их дни проверяются по каждой.
    """
    created_by_weekday: list[list[date]] = [[] for _ in range(_WEEK_DAYS)]
    alternating: list[tuple[date, Callable[[date], bool]]] = []
    due: dict[int, tuple[date, Callable[[date], bool]]] = {}
    for schedule in schedules:
        # У TaskSchedule те же поля расписания, что у Task.
        due[schedule.id] = (schedule.created_on, due_check(schedule))
        if schedule.frequency_type == FrequencyType.every_other_day:
            alternating.append(due[schedule.id])
            continue
        for weekday in due_weekdays(schedule):
            created_by_weekday[weekday].append(schedule.created_on)
    for dates in created_by_weekday:
        dates.sort()

    completed: Counter[date] = Counter()
    for task_id, day in done:
        info = due.get(task_id)
        if info is not None and info[0] <= day and info[1](day):
            completed[day] += 1

    return [
        (
            bisect_right(created_by_weekday[day.weekday()], day)
            + sum(1 for created, is_due in alternating if created <= day and is_due(day)),
            completed[day],
        )
        for day in days
    ]


def habits_distribution(habit_counts: list[int], app_users: int) -> list[HabitsBucket]:
    """Сколько пользователей приложения (`app_users` — пользуются им: открывали и не
    заблокировали бота) завели 0, 1, … и HABITS_DISTRIBUTION_MAX+ привычек. Без
    привычек — те из них, у кого их нет."""
    buckets = Counter(min(count, HABITS_DISTRIBUTION_MAX) for count in habit_counts)
    buckets[0] = max(0, app_users - len(habit_counts))
    return [
        HabitsBucket(
            habits=habits, users=buckets[habits], open_ended=habits == HABITS_DISTRIBUTION_MAX
        )
        for habits in range(HABITS_DISTRIBUTION_MAX + 1)
    ]


async def build_analytics(repo: Repository, period_days: int, now: datetime) -> AnalyticsResponse:
    """Аналитика за последние `period_days` дней по сегодня включительно (UTC)."""
    today = now.date()
    first_day = today - timedelta(days=period_days - 1)
    days = [first_day + timedelta(days=offset) for offset in range(period_days)]
    period_start = datetime.combine(first_day, time.min)

    counts = await repo.user_counts(now)
    funnel = await repo.funnel_since(period_start)
    new_by_day = await repo.new_users_by_day(period_start)
    total = await repo.count_users_created_before(period_start)
    active_by_day = await repo.active_users_by_day(first_day)
    wau = await repo.count_active_users_since(today - timedelta(days=_WEEK_DAYS - 1))
    mau = await repo.count_active_users_since(today - timedelta(days=_MONTH_DAYS - 1))
    habit_counts = await repo.active_habit_counts()
    completion = completion_by_day(
        await repo.active_task_schedules(), await repo.done_task_days_since(first_day), days
    )

    series: list[AnalyticsDay] = []
    for day, (scheduled, completed) in zip(days, completion):
        total += new_by_day.get(day, 0)
        series.append(
            AnalyticsDay(
                date=day,
                new_users=new_by_day.get(day, 0),
                total_users=total,
                active_users=active_by_day.get(day, 0),
                scheduled=scheduled,
                completed=completed,
                completion_rate=_ratio(completed, scheduled),
            )
        )

    habits_total = sum(habit_counts)
    # Привычки — только у тех, кто пользуется приложением: открывал его и не заблокировал
    # бота (как «Пользуются приложением» в аудитории — распределение в сумме равно ей).
    app_users = counts.reachable_opened
    return AnalyticsResponse(
        period_days=period_days,
        generated_at=now,
        users=AnalyticsUsers(
            total=counts.total,
            opened_app=counts.opened_app,
            never_opened=counts.never_opened,
            blocked_bot=counts.blocked_bot,
            blocked=counts.blocked,
            active_now=counts.active_now,
        ),
        funnel=AnalyticsFunnel(
            started_bot=funnel.started_bot,
            opened_app=funnel.opened_app,
            added_habit=funnel.added_habit,
        ),
        audience=AnalyticsAudience(
            uses_app=counts.reachable_opened,
            never_opened=counts.reachable_never_opened,
            blocked_bot=counts.blocked_bot,
        ),
        activity=AnalyticsActivity(dau=active_by_day.get(today, 0), wau=wau, mau=mau),
        habits=AnalyticsHabits(
            average=round(habits_total / app_users, 2) if app_users else 0.0,
            total=habits_total,
            distribution=habits_distribution(habit_counts, app_users),
        ),
        completion_rate=_ratio(
            sum(completed for _, completed in completion),
            sum(scheduled for scheduled, _ in completion),
        ),
        days=series,
    )
