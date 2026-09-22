"""Аналитика админ-панели: пользователи, активность, привычки и доля выполнения.

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
from datetime import date, datetime, time, timedelta

from tma.backend.constants import HABITS_DISTRIBUTION_MAX
from tma.backend.repository import Repository, TaskSchedule
from tma.backend.schedule import due_weekdays
from tma.backend.schemas import (
    AnalyticsActivity,
    AnalyticsAudience,
    AnalyticsDay,
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
    """
    created_by_weekday: list[list[date]] = [[] for _ in range(_WEEK_DAYS)]
    due: dict[int, tuple[date, frozenset[int]]] = {}
    for schedule in schedules:
        weekdays = due_weekdays(schedule)  # у TaskSchedule те же поля расписания, что у Task
        due[schedule.id] = (schedule.created_on, weekdays)
        for weekday in weekdays:
            created_by_weekday[weekday].append(schedule.created_on)
    for dates in created_by_weekday:
        dates.sort()

    completed: Counter[date] = Counter()
    for task_id, day in done:
        info = due.get(task_id)
        if info is not None and info[0] <= day and day.weekday() in info[1]:
            completed[day] += 1

    return [
        (bisect_right(created_by_weekday[day.weekday()], day), completed[day]) for day in days
    ]


def habits_distribution(habit_counts: list[int], app_users: int) -> list[HabitsBucket]:
    """Сколько пользователей приложения завели 0, 1, … и HABITS_DISTRIBUTION_MAX+
    привычек. Без привычек — открывшие приложение, у кого их нет."""
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
    return AnalyticsResponse(
        period_days=period_days,
        generated_at=now,
        users=AnalyticsUsers(
            total=counts.total,
            new_week=counts.new_week,
            new_month=counts.new_month,
            opened_app=counts.opened_app,
            never_opened=counts.never_opened,
            blocked_bot=counts.blocked_bot,
            blocked=counts.blocked,
            active_now=counts.active_now,
        ),
        audience=AnalyticsAudience(
            uses_app=counts.reachable_opened,
            never_opened=counts.reachable_never_opened,
            blocked_bot=counts.blocked_bot,
        ),
        activity=AnalyticsActivity(dau=active_by_day.get(today, 0), wau=wau, mau=mau),
        habits=AnalyticsHabits(
            average=round(habits_total / counts.opened_app, 2) if counts.opened_app else 0.0,
            total=habits_total,
            distribution=habits_distribution(habit_counts, counts.opened_app),
        ),
        completion_rate=_ratio(
            sum(completed for _, completed in completion),
            sum(scheduled for scheduled, _ in completion),
        ),
        days=series,
    )
