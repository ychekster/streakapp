"""Расписание привычки: в какие дни недели она запланирована.

Одна проверка на всё приложение: по ней определяется, можно ли отмечать привычку
сегодня, и какие пропуски прерывают серию (пропуск незапланированного дня — нет).
"""

from __future__ import annotations

from datetime import date

from tma.backend.constants import WEEKDAYS
from tma.backend.models import FrequencyType, Task

# Коды дней недели в порядке `date.weekday()` (понедельник == 0).
_WEEKDAY_CODES: tuple[str, ...] = tuple(code for code, _, _ in WEEKDAYS)


def task_days(task: Task) -> list[str]:
    """Коды дней недели задачи (mon..sun); для `daily` — пустой список."""
    if task.frequency_type != FrequencyType.specific_days:
        return []
    return [code for code in (task.days or "").split(",") if code]


def due_weekdays(task: Task) -> frozenset[int]:
    """Номера дней недели (`date.weekday()`), на которые запланирована задача."""
    if task.frequency_type == FrequencyType.daily:
        return frozenset(range(len(_WEEKDAY_CODES)))
    days = set(task_days(task))
    return frozenset(index for index, code in enumerate(_WEEKDAY_CODES) if code in days)


def is_due_on(task: Task, day: date) -> bool:
    """Запланирована ли задача на указанную дату."""
    return day.weekday() in due_weekdays(task)
