"""Чистая логика: серии, валидация ввода, ограничитель частоты, расчёты аналитики."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from tma.backend import ratelimit
from tma.backend.analytics import completion_by_day, habits_distribution
from tma.backend.errors import ApiError
from tma.backend.models import FrequencyType
from tma.backend.repository import TaskSchedule
from tma.backend.services import compute_streaks
from tma.backend.validation import resolve_timezone, validate_name

TODAY = date(2026, 9, 22)  # вторник


def _task(frequency: FrequencyType, days: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(frequency_type=frequency, days=days)


def _days_ago(*offsets: int) -> set[date]:
    return {TODAY - timedelta(days=offset) for offset in offsets}


def test_daily_streak_breaks_on_missed_day() -> None:
    task = _task(FrequencyType.daily)
    # Сегодня ещё не отмечено — серия тянется со вчера; пропуск 3 дня назад её прервал.
    assert compute_streaks(task, _days_ago(1, 2, 4, 5, 6), TODAY) == (2, 3)
    assert compute_streaks(task, set(), TODAY) == (0, 0)


def test_unscheduled_days_do_not_break_streak() -> None:
    # По понедельникам и средам: вторник (сегодня), воскресенье, суббота, четверг,
    # пятница не запланированы и серию не рвут.
    task = _task(FrequencyType.specific_days, "mon,wed")
    monday, last_wednesday = TODAY - timedelta(days=1), TODAY - timedelta(days=6)
    assert compute_streaks(task, {monday, last_wednesday}, TODAY) == (2, 2)


def test_name_is_cleaned() -> None:
    assert validate_name("  Бег\r\n по\x00 утрам  ") == "Бег по утрам"
    for bad in ("", "   ", "\n\t", "x" * 101):
        with pytest.raises(ApiError):
            validate_name(bad)


@pytest.mark.parametrize(
    ("raw", "stored"),
    [("europe/moscow", "Europe/Moscow"), ("UTC+3", "Etc/GMT-3"), ("utc", "UTC"),
     ("+5:30", "Asia/Kolkata")],
)
def test_timezone_is_canonical(raw: str, stored: str) -> None:
    assert resolve_timezone(raw) == stored


def test_rate_limiter_refills(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = [100.0]
    monkeypatch.setattr(ratelimit.time, "monotonic", lambda: clock[0])
    limiter = ratelimit.RateLimiter(burst=2, per_second=1)
    assert [limiter.acquire(1), limiter.acquire(1)] == [0, 0]
    assert limiter.acquire(1) == pytest.approx(1.0)
    assert limiter.acquire(2) == 0  # у другого пользователя своё ведро
    clock[0] += 1.0
    assert limiter.acquire(1) == 0


def test_rate_limiter_can_be_disabled() -> None:
    limiter = ratelimit.RateLimiter(burst=0, per_second=0)
    assert all(limiter.acquire(1) == 0 for _ in range(1000))


# --------------------------------------------------------------------------- #
#  Аналитика админ-панели
# --------------------------------------------------------------------------- #


def test_completion_counts_only_scheduled_days_of_existing_habits() -> None:
    monday = date(2026, 9, 21)
    days = [monday + timedelta(days=offset) for offset in range(3)]  # пн, вт, ср
    schedules = [
        TaskSchedule(1, monday, FrequencyType.daily, None),
        TaskSchedule(2, monday, FrequencyType.specific_days, "mon,wed"),
        TaskSchedule(3, days[2], FrequencyType.daily, None),  # создана в среду
    ]
    done = [
        (1, days[0]), (2, days[0]),  # понедельник — всё выполнено
        (2, days[1]),  # вторник не по расписанию привычки 2 — не считается
        (3, days[2]),
    ]
    assert completion_by_day(schedules, done, days) == [(2, 2), (1, 0), (3, 1)]


def test_habits_distribution_groups_the_tail() -> None:
    buckets = habits_distribution([1, 1, 3, 7, 9], app_users=8)
    assert [(bucket.habits, bucket.users) for bucket in buckets] == [
        (0, 3), (1, 2), (2, 0), (3, 1), (4, 0), (5, 2),
    ]
