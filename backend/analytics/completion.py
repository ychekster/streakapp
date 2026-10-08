"""Доля выполнения по дням: сколько запланированных на день привычек отмечено.

- запланировано на день D — активные привычки, созданные не позже D, у которых D — день
  расписания;
- выполнено — отметки `done` таких привычек за D (отметка в незапланированный день не
  считается, поэтому доля не больше 100%).

Удалённые привычки не учитываются: в прошлые дни они исказили бы знаменатель.
"""

from __future__ import annotations

from bisect import bisect_right
from collections import Counter
from collections.abc import Callable
from datetime import date

from backend.models import FrequencyType
from backend.repository import TaskSchedule
from backend.schedule import due_check, due_weekdays

_WEEK_DAYS = 7


def completion_by_day(
    schedules: list[TaskSchedule], done: list[tuple[int, date]], days: list[date]
) -> list[tuple[int, int]]:
    """(запланировано, выполнено) на каждый день `days`.

    Сколько привычек запланировано на день, считается двоичным поиском по отсортированным
    датам создания привычек этого дня недели, а не перебором всех привычек на каждый день.
    Привычки «через день» и «каждый месяц» к дню недели не привязаны — их дни проверяются
    по каждой.
    """
    created_by_weekday: list[list[date]] = [[] for _ in range(_WEEK_DAYS)]
    alternating: list[tuple[date, Callable[[date], bool]]] = []
    due: dict[int, tuple[date, Callable[[date], bool]]] = {}
    for schedule in schedules:
        # У TaskSchedule те же поля расписания, что у Task.
        due[schedule.id] = (schedule.created_on, due_check(schedule))  # type: ignore[arg-type]
        if schedule.frequency_type in (FrequencyType.every_other_day, FrequencyType.monthly):
            alternating.append(due[schedule.id])
            continue
        for weekday in due_weekdays(schedule):  # type: ignore[arg-type]
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
