"""Обзор — главный экран аналитики: сколько живых (data.Dataset.is_live), сколько пришло,
где пользуются, кто заходит, у кого есть привычки. Без фильтров и периодов: всегда все пользователи (без администраторов и
тестовых аккаунтов), дни — по Алматы.

Каждая цифра — размер группы людей (`groups`); те же группы открываются списком
(people.py, метрика «overview» с ключом группы), поэтому цифра и список не расходятся.
"""

from __future__ import annotations

from datetime import date, timedelta

from backend.analytics.data import Dataset, UserRow
from backend.clock import local_day
from backend.constants import ACTIVE_NOW_MINUTES, CHURN_DAYS
from backend.schemas import AnalyticsOverview, DayValue, OverviewActivityDay, OverviewNewDay

# Сколько дней на графиках.
CHART_DAYS = 30

OVERVIEW_GROUPS = (
    # Живые: все пользователи = живые + перестали + без привычек
    "alive", "stopped",
    # Пришли
    "new_today", "new_yesterday", "new_week", "new_month", "all",
    # Где пользуются
    "telegram", "web", "both", "bot_only", "telegram_week", "web_week",
    "web_logged_in", "web_guests",
    # Заходят
    "online", "active_today", "active_week", "active_month", "checked_today", "gone",
    # Привычки
    "with_habits", "without_habits",
)


def _seen_since(moment, first: date) -> bool:
    return moment is not None and local_day(moment) >= first


def groups(ds: Dataset) -> dict[str, set[int]]:
    """Группы обзора: ключ (OVERVIEW_GROUPS) → id людей."""
    today = ds.today
    week = today - timedelta(days=6)
    month = today - timedelta(days=CHART_DAYS - 1)
    online_since = ds.now - timedelta(minutes=ACTIVE_NOW_MINUTES)
    with_tasks = {task.user_id for task in ds.tasks if task.is_active}
    result: dict[str, set[int]] = {key: set() for key in OVERVIEW_GROUPS}

    def put(key: str, user: UserRow, condition: bool) -> None:
        if condition:
            result[key].add(user.id)

    for user in ds.users.values():
        last = ds.last_active_day(user)
        alive = ds.is_live(user.id)
        put("alive", user, alive)
        put("stopped", user, not alive and user.id in with_tasks)
        telegram, web = user.uses_telegram, user.uses_web
        put("new_today", user, user.created_day == today)
        put("new_yesterday", user, user.created_day == today - timedelta(days=1))
        put("new_week", user, user.created_day >= week)
        put("new_month", user, user.created_day >= month)
        put("all", user, True)
        put("telegram", user, telegram)
        put("web", user, web)
        put("both", user, telegram and web)
        put("bot_only", user, user.opened is None and not web)
        put("telegram_week", user, _seen_since(user.telegram_seen, week))
        put("web_week", user, _seen_since(user.web_seen, week))
        put("web_logged_in", user, web and not user.web_only)
        put("web_guests", user, user.web_only)
        put("online", user, user.last_seen is not None and user.last_seen >= online_since)
        put("active_today", user, last == today)
        put("active_week", user, last is not None and last >= week)
        put("active_month", user, last is not None and last >= month)
        put("checked_today", user, ds.checked_on(user.id, today))
        put("gone", user, last is not None and (today - last).days >= CHURN_DAYS)
        put("with_habits", user, user.id in with_tasks)
        put("without_habits", user, user.id not in with_tasks)
    return result


def overview(ds: Dataset) -> AnalyticsOverview:
    days = [ds.today - timedelta(days=offset) for offset in range(CHART_DAYS - 1, -1, -1)]
    new_by_day: dict[date, list[int]] = {day: [0, 0] for day in days}
    for user in ds.users.values():
        counts = new_by_day.get(user.created_day)
        if counts is not None:
            counts[0 if user.platform == "telegram" else 1] += 1
    return AnalyticsOverview(
        generated_at=ds.now,
        counts={key: len(ids) for key, ids in groups(ds).items()},
        habits=sum(1 for task in ds.tasks if task.is_active),
        alive_week_ago=ds.live_count(ds.today - timedelta(days=7)),
        alive_by_day=[DayValue(date=day, value=ds.live_count(day)) for day in days],
        new_by_day=[
            OverviewNewDay(date=day, telegram=new_by_day[day][0], web=new_by_day[day][1])
            for day in days
        ],
        activity_by_day=[
            OverviewActivityDay(
                date=day,
                opened=sum(1 for user_id in ds.users if ds.was_active_on(user_id, day)),
                checked=sum(1 for user_id in ds.users if ds.checked_on(user_id, day)),
            )
            for day in days
        ],
    )
