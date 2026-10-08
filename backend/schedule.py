"""Расписание привычки: в какие дни она запланирована.

Одна проверка на всё приложение: по ней определяется, можно ли отмечать привычку
сегодня, и какие пропуски прерывают серию (пропуск незапланированного дня — нет).

Привычка «через день» запланирована на свой первый день (`start_date`) и дальше на
каждый второй день от него; до первого дня — ни на один. Привычка «каждый месяц» — на
первый день и дальше на то же число каждого месяца; если в месяце такого числа нет (31-е
в апреле, 30-е в феврале), — на его последний день.
"""

from __future__ import annotations

import calendar
from collections.abc import Callable
from datetime import date
from typing import Protocol

from backend.constants import WEEKDAYS
from backend.models import FrequencyType


class Scheduled(Protocol):
    """Поля расписания — есть и у `Task`, и у `repository.TaskSchedule`."""

    frequency_type: FrequencyType
    days: str | None
    start_date: date | None


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
