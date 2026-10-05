"""Люди за цифрами аналитики: нажали на цифру — получили список этих людей.

`people(...)` возвращает id пользователей метрики `metric` (с аргументом `arg`) за период —
теми же определениями, что считают цифры (report.py). Список сохраняется группой
(segments) — по ней панель показывает людей и делает рассылку (фильтр «segment:<id>»).

Здесь же — пользователи признаков фильтра, которые считаются в Python (activated,
stuck:not_activated, uninstalled, streak — см. audience.resolve_audience).
"""

from __future__ import annotations

from datetime import date, timedelta

from backend.analytics import report
from backend.analytics.data import Dataset, Period, UserRow
from backend.analytics.names import topic
from backend.clock import local_day
from backend.constants import CHURN_DAYS
from backend.errors import ApiError
from backend.repository import Repository


def _bad(metric: str) -> ApiError:
    return ApiError(422, "invalid_metric", f"Неизвестная метрика: {metric[:40]}")


def _cohort_steps(ds: Dataset, period: Period, platform: str) -> dict[int, list[bool]]:
    """Пройденные шаги воронки платформы у пришедших за период: id → шаги (для веба — без
    шагов страницы установки)."""
    first_task: dict[int, object] = {}
    for task in ds.tasks:
        if task.user_id not in first_task or task.created < first_task[task.user_id]:  # type: ignore[operator]
            first_task[task.user_id] = task.created
    result: dict[int, list[bool]] = {}
    for user in ds.new_in(period):
        if user.platform != platform:
            continue
        moments = report.user_steps(ds, user, first_task.get(user.id))  # type: ignore[arg-type]
        reached = [moment is not None for moment in moments]
        if platform == "web":
            reached = [reached[0], *reached[2:]]
        result[user.id] = reached
    return result


def _funnel_people(ds: Dataset, period: Period, arg: str, stuck: bool) -> set[int]:
    platform, _, step = arg.partition(":")
    keys = report.TELEGRAM_STEPS if platform == "telegram" else report.WEB_STEPS
    if platform not in ("telegram", "web") or step not in keys or step in report.WEB_PAGE_STEPS:
        raise _bad("funnel")
    index = keys.index(step) - (2 if platform == "web" else 0)
    result: set[int] = set()
    for user_id, reached in _cohort_steps(ds, period, platform).items():
        if not reached[index]:
            continue
        last = index + 1 >= len(reached)
        if not stuck or last or not reached[index + 1]:
            result.add(user_id)
    return result


def _bucket_users(users: list[UserRow], value, buckets, key: str) -> set[int]:
    return {user.id for user in users if report.bucket_of(value(user), buckets) == key}


async def people(
    repo: Repository, ds: Dataset, period: Period, metric: str, arg: str | None, basis: str | None
) -> set[int]:
    """id людей за цифрой `metric` (см. описание модуля)."""
    users = list(ds.users.values())
    cohort = ds.new_in(period)
    value = arg or ""
    retention_basis = "checkin" if basis == "checkin" else "open"
    tasks_of = ds.tasks_of()

    # --- Сводка ---
    if metric == "live":
        return {user.id for user in users if ds.is_live(user.id)}
    if metric == "new":
        return {user.id for user in cohort}
    if metric in ("activated", "not_activated"):
        known = [user for user in cohort if ds.activation_known(user)]
        want = metric == "activated"
        return {user.id for user in known if (ds.activation_day(user.id) is not None) == want}
    if metric in ("day_n", "day_n_lost", "d7_retained", "d7_lost"):
        n = 7 if metric.startswith("d7") else int(value) if value.isdigit() else -1
        if n not in (1, 7, 30):
            raise _bad(metric)
        keep = metric in ("day_n", "d7_retained")
        on = "checkin" if metric.startswith("d7") else retention_basis
        return {
            user.id
            for user in report.day_n_cohort(ds, period, n)
            if report.retained(ds, user, n, on) == keep
        }
    if metric == "opened_today":
        return {user.id for user in users if ds.was_active_on(user.id, ds.today)}
    if metric == "checked_today":
        return {user.id for user in users if ds.checked_on(user.id, ds.today)}
    if metric == "online":
        since = ds.now - timedelta(minutes=5)
        return {user.id for user in users if user.last_seen and user.last_seen >= since}
    if metric == "blocked_bot":
        return report.blocked_in(await report.block_days(repo, ds), period)
    if metric == "became_inactive":
        return {user.id for user in report.churned_in(ds, period)}
    if metric == "uninstalled":
        return {user.id for user in report.uninstalled_in(ds, period)}

    # --- Воронка ---
    if metric in ("funnel_reached", "funnel_stuck"):
        return _funnel_people(ds, period, value, metric == "funnel_stuck")

    # --- Удержание ---
    if metric in ("cohort_week", "cohort_cell"):
        start_text, _, week_text = value.partition(":")
        try:
            start = date.fromisoformat(start_text)
        except ValueError as exc:
            raise _bad(metric) from exc
        members = [user for user in users if start <= user.created_day <= start + timedelta(days=6)]
        if metric == "cohort_week":
            return {user.id for user in members}
        if not week_text.isdigit():
            raise _bad(metric)
        first = start + timedelta(days=7 * int(week_text))
        days_of = ds.checkins if retention_basis == "checkin" else ds.activity
        return {
            user.id
            for user in members
            if report._any_between(days_of.get(user.id), first, first + timedelta(days=6))
        }
    if metric in ("left_after", "still_active"):
        result: set[int] = set()
        for user in cohort:
            status = ds.status(user)
            if status in ("churned", "uninstalled", "bot_blocked"):
                last = ds.last_active_day(user)
                key = "never" if last is None else report.bucket_of((last - user.created_day).days, report.LEAVE_BUCKETS)
            elif status == "not_opened":
                key = "never"
            else:
                key = "still"
            if (metric == "still_active" and key == "still") or (metric == "left_after" and key == value):
                result.add(user.id)
        return result

    # --- Отток и возврат ---
    churned = [user for user in users if ds.is_churned(user)]
    if metric == "inactive_total":
        return {user.id for user in churned}
    if metric == "inactive_bucket":
        return _bucket_users(churned, lambda user: ds.inactive_days(user) or CHURN_DAYS, report.INACTIVE_BUCKETS, value)
    if metric == "uninstalled_total":
        return {user.id for user in users if ds.likely_uninstalled(user)}
    if metric == "returned":
        return {user.id for user in users if any(period.contains(day) for day in ds.returns(user.id))}
    if metric == "gone_active":
        return {user.id for user in churned if ds.activation_day(user.id) is not None}
    if metric == "habit_abandoned":
        return {user.id for user in users if report._abandoned_habit(ds, user, tasks_of)}
    if metric == "start_no_open":
        return {
            user.id
            for user in users
            if user.opened is None and user.platform == "telegram" and user.bot_blocked is None
        }

    # --- Привычки ---
    app_users = [user for user in users if user.opened is not None and user.bot_blocked is None]
    active = {user.id: [task for task in tasks_of.get(user.id, ()) if task.is_active] for user in users}
    if metric == "habits_bucket":
        return _bucket_users(
            [user for user in app_users if active[user.id]],
            lambda user: len(active[user.id]),
            report.HABIT_BUCKETS,
            value,
        )
    if metric == "without_habits":
        return {user.id for user in app_users if not active[user.id]}
    if metric == "habit_topic":
        return {user.id for user in users if any(topic(task.name) == value for task in active[user.id])}
    if metric == "deleted_topic":
        return {
            task.user_id
            for task in ds.tasks
            if task.deleted is not None
            and period.contains(local_day(task.deleted))
            and topic(task.name) == value
        }
    if metric == "frequency":
        return {
            user.id
            for user in users
            if any(task.frequency_type.value == value for task in active[user.id])
        }
    if metric in ("streak_current", "streak_best", "streak_min"):
        streaks = await ds.load_streaks(repo)
        if metric == "streak_min":
            if not value.isdigit():
                raise _bad(metric)
            return {user_id for user_id, (current, _) in streaks.items() if current >= int(value)}
        index = 0 if metric == "streak_current" else 1
        holders = [user for user in users if active[user.id] or user.id in streaks]
        return _bucket_users(
            holders, lambda user: streaks.get(user.id, (0, 0))[index], report.STREAK_BUCKETS, value
        )
    if metric == "feature":
        reminders = {task.user_id for task in ds.tasks if task.is_active and task.reminder_time}
        checks = {
            "mark_yesterday": lambda user: user.mark_yesterday,
            "checkin_reminder": lambda user: user.checkin_reminder,
            "habit_reminder": lambda user: user.id in reminders,
            "push": lambda user: user.id in ds.push_users,
            "dark_theme": lambda user: user.theme == "dark",
            "english": lambda user: user.language == "en",
        }
        if value not in checks:
            raise _bad(metric)
        return {user.id for user in app_users if checks[value](user)}

    # --- Источники и аудитория ---
    if metric in ("source", "source_live"):
        name, _, tag = value.partition(":")
        members = [user for user in cohort if user.source == name and (not tag or user.tag == tag)]
        if metric == "source_live":
            members = [user for user in members if ds.is_live(user.id)]
        return {user.id for user in members}
    if metric == "platform":
        return {user.id for user in cohort if user.platform == value}
    if metric == "device":
        return {user.id for user in cohort if (user.device or "unknown") == value}
    if metric == "language":
        return {user.id for user in cohort if user.language == value}
    if metric == "timezone":
        return {user.id for user in cohort if user.timezone == value}
    if metric == "web_users":
        return {user.id for user in cohort if user.platform == "web"}
    if metric == "web_linked":
        return {user.id for user in cohort if user.platform == "web" and not user.web_only}

    # --- Напоминания и рассылки ---
    if metric in ("reminders_with", "reminders_without"):
        with_reminder = {
            user.id
            for user in users
            if user.checkin_reminder or any(task.reminder_time for task in active[user.id])
        }
        want = metric == "reminders_with"
        return {user.id for user in users if active[user.id] and (user.id in with_reminder) == want}
    if metric == "reminder_openers":
        return {
            user_id
            for user_id, _, _, detail, moment in await repo.actions(["app_open"])
            if detail == "reminder" and period.contains(local_day(moment)) and user_id in ds.users
        }
    if metric.startswith("broadcast_"):
        if not value.isdigit():
            raise _bad(metric)
        broadcast_id = int(value)
        actions = await repo.actions(["broadcast_sent", "app_open", "checkin", "bot_blocked"])
        received = {
            user_id: moment
            for user_id, kind, ref_id, _, moment in actions
            if kind == "broadcast_sent" and ref_id == broadcast_id
        }
        if metric == "broadcast_recipients":
            return set(received)
        kind, hours = {
            "broadcast_opened": ("app_open", 72),
            "broadcast_checked": ("checkin", 72),
            "broadcast_blocked": ("bot_blocked", 24),
        }.get(metric, (None, 0))
        if kind is None:
            raise _bad(metric)
        return {
            user_id
            for user_id, action, _, _, moment in actions
            if action == kind
            and user_id in received
            and received[user_id] <= moment <= received[user_id] + timedelta(hours=hours)
        }
    if metric in ("offer_shown", "offer_installed"):
        offered = [
            user
            for user in users
            if user.install_offer_sent and period.contains(local_day(user.install_offer_sent))
        ]
        if metric == "offer_shown":
            return {user.id for user in offered}
        sessions = await repo.first_web_sessions()
        return {
            user.id
            for user in offered
            if user.id in sessions and sessions[user.id] >= user.install_offer_sent  # type: ignore[operator]
        }
    raise _bad(metric)


# --------------------------------------------------------------------------- #
#  Признаки фильтра, которые считаются в Python
# --------------------------------------------------------------------------- #


async def filter_ids(repo: Repository, ds: Dataset, key: str, value: str) -> set[int]:
    """Пользователи признака фильтра `key:value` (activated, stuck:not_activated,
    uninstalled, streak). Набор `ds` — все пользователи, вместе с исключёнными."""
    users = list(ds.users.values())
    if key == "activated":
        return {user.id for user in users if ds.activation_day(user.id) is not None}
    if key == "stuck":
        # Отмечал, но не активирован (окно уже закончилось).
        return {
            user.id
            for user in users
            if ds.checkins.get(user.id)
            and ds.activation_day(user.id) is None
            and ds.window_closed(user)
        }
    if key == "uninstalled":
        return {user.id for user in users if ds.likely_uninstalled(user)}
    if key == "streak":
        streaks = await ds.load_streaks(repo)
        return {user_id for user_id, (current, _) in streaks.items() if current >= int(value)}
    return set()

