"""Дни аналитики — по времени владельца (constants.ANALYTICS_TIMEZONE, Алматы), а не по UTC.

Моменты в базе — UTC без пояса (см. repository.utc_now). Здесь они переводятся в день по
Алматы и обратно: день активности и день отметки (user_activity, checkin_days), границы
периодов аналитики.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

import pytz

from backend.constants import ANALYTICS_TIMEZONE

ZONE = pytz.timezone(ANALYTICS_TIMEZONE)


def local_time(moment: datetime) -> datetime:
    """Момент из базы (UTC без пояса) — время по Алматы (без пояса)."""
    return pytz.utc.localize(moment).astimezone(ZONE).replace(tzinfo=None)


def local_day(moment: datetime) -> date:
    """День по Алматы, на который приходится момент из базы."""
    return local_time(moment).date()


def day_start(day: date) -> datetime:
    """Начало дня по Алматы — момент в UTC без пояса (как в базе)."""
    return ZONE.localize(datetime.combine(day, time.min)).astimezone(pytz.utc).replace(tzinfo=None)


def day_end(day: date) -> datetime:
    """Конец дня по Алматы (начало следующего) — момент в UTC без пояса."""
    return day_start(day + timedelta(days=1))
