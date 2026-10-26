"""Расписание привычки: в какие дни она запланирована.

Одна проверка на всё приложение: по ней определяется, можно ли отмечать привычку
сегодня, и какие пропуски прерывают серию (пропуск незапланированного дня — нет).

Привычка «через день» запланирована на свой первый день (`start_date`) и дальше на
каждый второй день от него; до первого дня — ни на один. Привычка «каждый месяц» — на
первый день и дальше на то же число каждого месяца; если в месяце такого числа нет (31-е
в апреле, 30-е в феврале), — на его последний день.

Прошлые дни оцениваются по расписанию, которое действовало в тот день
(`models.TaskSchedulePeriod`, см. `due_check_with_history`): смена расписания не
переписывает прошлое.

У «Гибкого графика» (`flexible`) дней нет — есть цель на период (`period_bounds`,
`period_quota`): пока она не набрана, привычку можно отмечать в любой день, а пропущенный
день ничего не рвёт (`due_check` — ни на один день). Серии таких привычек — в периодах
(services.flexible_streaks).
"""

from __future__ import annotations

import calendar
from collections.abc import Callable, Sequence
from datetime import date, timedelta
from typing import Protocol

from backend.constants import WEEKDAYS
from backend.models import FrequencyType


class Scheduled(Protocol):
    """Поля расписания — есть и у `Task`, и у `repository.TaskSchedule`."""

    frequency_type: FrequencyType
    days: str | None
    start_date: date | None
    period: str | None
    period_times: int | None


def task_days(task: Scheduled) -> list[str]:
    """Коды дней недели задачи (mon..sun); для остальных частот — пустой список."""
    if task.frequency_type != FrequencyType.specific_days:
        return []
    return [code for code in (task.days or "").split(",") if code]


def due_weekdays(task: Scheduled) -> frozenset[int]:
    """Номера дней недели (`date.weekday()`) привычки «каждый день» или «по дням»."""
    if task.frequency_type == FrequencyType.daily:
        return frozenset(range(len(WEEKDAYS)))
    days = set(task_days(task))
    return frozenset(index for index, code in enumerate(WEEKDAYS) if code in days)


def due_check(task: Scheduled) -> Callable[[date], bool]:
    """Проверка «запланирована ли задача на дату» — для перебора многих дат одной задачи
    (расписание разбирается один раз)."""
    if task.frequency_type == FrequencyType.flexible:
        return lambda day: False
    if task.frequency_type == FrequencyType.every_other_day:
        start = task.start_date
        if start is None:
            return lambda day: False
        return lambda day: day >= start and (day - start).days % 2 == 0
    if task.frequency_type == FrequencyType.monthly:
        start = task.start_date
        if start is None:
            return lambda day: False
        return lambda day: day >= start and day.day == min(
            start.day, calendar.monthrange(day.year, day.month)[1]
        )
    weekdays = due_weekdays(task)
    return lambda day: day.weekday() in weekdays


def is_due_on(task: Scheduled, day: date) -> bool:
    """Запланирована ли задача на указанную дату."""
    return due_check(task)(day)


class SchedulePeriod(Scheduled, Protocol):
    """Прежнее расписание: действовало до дня `until` (не включая его)."""

    until: date


def due_check_with_history(
    task: Scheduled, periods: Sequence[SchedulePeriod]
) -> Callable[[date], bool]:
    """Как `due_check`, но день до смены расписания проверяется по расписанию, которое
    действовало в тот день. `periods` — по возрастанию `until`; каждый период идёт с `until`
    предыдущего, первый — с самого начала; после последнего — текущее расписание задачи."""
    current = due_check(task)
    if not periods:
        return current
    checks = [(period.until, due_check(period)) for period in periods]

    def is_due(day: date) -> bool:
        for until, check in checks:
            if day < until:
                return check(day)
        return current(day)

    return is_due


def period_bounds(period: str, day: date) -> tuple[date, date]:
    """Первый и последний день календарного периода `period` (week / month / year), в
    который попадает `day`: неделя — с понедельника, месяц — с 1-го, год — с 1 января."""
    if period == "week":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    if period == "month":
        return day.replace(day=1), day.replace(day=calendar.monthrange(day.year, day.month)[1])
    return date(day.year, 1, 1), date(day.year, 12, 31)


def period_quota(times: int, start: date, end: date) -> int:
    """Сколько дней нужно выполнить за период с `start` по `end`: цель, но не больше дней
    в нём («31 раз в месяц» в феврале — 28)."""
    return min(times, (end - start).days + 1)


def schedule_at(task: Scheduled, periods: Sequence[SchedulePeriod]) -> Callable[[date], Scheduled]:
    """Расписание, действовавшее в день: прежнее (`periods`, как в
    `due_check_with_history`) или текущее."""

    def at(day: date) -> Scheduled:
        for period in periods:
            if day < period.until:
                return period
        return task

    return at
