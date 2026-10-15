"""Обзор — главный экран аналитики: сколько живых (data.Dataset.is_live), сколько пришло,
где пользуются, кто заходит, у кого есть привычки. Нажатая цифра открывает подробности
(group_details): из чего складывается группа — где пользуются, откуда и когда пришли,
сколько привычек, когда заходили и отмечали; график по дням, а у живых — кто за неделю
стал живым и кто перестал. Без фильтров и периодов: всегда все пользователи (без администраторов и
тестовых аккаунтов), дни — по Алматы.

Каждая цифра — размер группы людей (`groups`); те же группы открываются списком
(people.py, метрика «overview» с ключом группы), поэтому цифра и список не расходятся.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from datetime import date, timedelta

from backend.analytics.data import Dataset, UserRow
from backend.clock import local_day
from backend.constants import ACTIVE_NOW_MINUTES, CHURN_DAYS
from backend.constants import LIVE_WINDOW_DAYS
from backend.schemas import (
    AnalyticsOverview,
    AnalyticsOverviewGroup,
    DayValue,
    LeaveBucket,
    OverviewActivityDay,
    OverviewGroupMoves,
    OverviewNewDay,
)

# Сколько дней на графиках.
CHART_DAYS = 30

OVERVIEW_GROUPS = (
    # Живые: все пользователи = живые + новички + перестали + без привычек
    "alive", "newcomers", "stopped",
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
        newcomer = not alive and user.id in with_tasks and ds.is_newcomer(user)
        put("alive", user, alive)
        put("newcomers", user, newcomer)
        put("stopped", user, not alive and not newcomer and user.id in with_tasks)
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


# Что показывает график подробностей группы (нет в списке — графика нет).
_TRENDS = {
    "alive": "alive",
    "new_today": "new", "new_yesterday": "new", "new_week": "new", "new_month": "new",
    "all": "total",
    "online": "opened", "active_today": "opened", "active_week": "opened",
    "active_month": "opened", "telegram_week": "opened", "web_week": "opened",
    "checked_today": "checked",
}


def _buckets(keys: tuple[str, ...], values: list[str]) -> list[LeaveBucket]:
    counts = {key: 0 for key in keys}
    for value in values:
        counts[value] += 1
    return [LeaveBucket(key=key, users=users) for key, users in counts.items()]


def _joined(days: int) -> str:
    return "week" if days < 7 else "month" if days < 30 else "quarter" if days < 90 else "older"


def _habits(count: int) -> str:
    return "0" if count == 0 else "1" if count == 1 else "2-3" if count <= 3 else "4+"


def _last_seen(days: int | None) -> str:
    if days is None:
        return "never"
    return "today" if days == 0 else "week" if days < 7 else "month" if days < 30 else "older"


def _checked(days: int) -> str:
    return "0" if days == 0 else "1-2" if days <= 2 else "3-5" if days <= 5 else "6-7"


def _trend(ds: Dataset, kind: str, days: list[date]) -> list[DayValue]:
    if kind == "alive":
        return [DayValue(date=day, value=ds.live_count(day)) for day in days]
    if kind == "total":
        created = sorted(user.created_day for user in ds.users.values())
        return [DayValue(date=day, value=bisect_right(created, day)) for day in days]
    if kind == "new":
        per_day: dict[date, int] = defaultdict(int)
        for user in ds.users.values():
            per_day[user.created_day] += 1
        return [DayValue(date=day, value=per_day[day]) for day in days]
    check = ds.was_active_on if kind == "opened" else ds.checked_on
    return [
        DayValue(date=day, value=sum(1 for user_id in ds.users if check(user_id, day)))
        for day in days
    ]


def group_details(ds: Dataset, group: str) -> AnalyticsOverviewGroup:
    """Подробности цифры «Обзора»: те же люди, что в groups(ds)[group]."""
    ids = groups(ds)[group]
    members = [ds.users[user_id] for user_id in ids]
    today = ds.today
    habit_count: dict[int, int] = defaultdict(int)
    for task in ds.tasks:
        if task.is_active:
            habit_count[task.user_id] += 1
    first, last = today - timedelta(days=LIVE_WINDOW_DAYS), today - timedelta(days=1)

    def checked_days(user: UserRow) -> int:
        marks = ds.checkins.get(user.id) or []
        return bisect_right(marks, last) - bisect_left(marks, first)

    def platform(user: UserRow) -> str:
        telegram, web = user.uses_telegram, user.uses_web
        return "both" if telegram and web else "telegram" if telegram else "web" if web else "bot"

    sources: dict[str, int] = defaultdict(int)
    for user in members:
        sources[user.source] += 1
    days = [today - timedelta(days=offset) for offset in range(CHART_DAYS - 1, -1, -1)]
    kind = _TRENDS.get(group)
    moves = None
    if group == "alive":
        before = {user_id for user_id in ds.users if ds.is_live(user_id, today - timedelta(days=7))}
        moves = OverviewGroupMoves(joined=len(ids - before), left=len(before - ids))
    return AnalyticsOverviewGroup(
        group=group,
        users=len(ids),
        all_users=len(ds.users),
        trend_kind=kind,
        trend=_trend(ds, kind, days) if kind else [],
        moves=moves,
        platforms=_buckets(
            ("telegram", "both", "web", "bot"), [platform(user) for user in members]
        ),
        sources=[
            LeaveBucket(key=key, users=users)
            for key, users in sorted(sources.items(), key=lambda item: (-item[1], item[0]))
        ],
        joined=_buckets(
            ("week", "month", "quarter", "older"),
            [_joined((today - user.created_day).days) for user in members],
        ),
        habits=_buckets(
            ("0", "1", "2-3", "4+"), [_habits(habit_count[user.id]) for user in members]
        ),
        last_seen=_buckets(
            ("today", "week", "month", "older", "never"),
            [_last_seen(ds.inactive_days(user)) for user in members],
        ),
        checked=_buckets(
            ("0", "1-2", "3-5", "6-7"), [_checked(checked_days(user)) for user in members]
        ),
    )
