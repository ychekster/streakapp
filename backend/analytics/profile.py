"""Профиль пользователя в панели: сводка (откуда пришёл, статус, серия, выполнение) и
лента его действий.

Сводка считается теми же определениями, что и вся аналитика (data.Dataset) — на наборе
из одного пользователя. Лента — записи activity_log, новые сначала, и ещё два события из
полей пользователя: «пришёл» (с источником) и «впервые открыл приложение».
"""

from __future__ import annotations

from datetime import datetime, timedelta

from backend.analytics.completion import completion_by_day
from backend.analytics.data import Dataset, TaskRow, UserRow, load_config, ratio, user_today
from backend.clock import local_day
from backend.constants import TIMELINE_PAGE_SIZE
from backend.models import User
from backend.repository import Repository, TaskSchedule
from backend.schemas import TimelineItem, TimelinePage
from backend.sources import source_name

# Действия, у которых ref_id — привычка (в ленте показывается её название).
_HABIT_ACTIONS = (
    "habit_created", "habit_updated", "habit_deleted", "habit_frozen", "habit_unfrozen",
    "checkin", "uncheck", "reminder_sent", "reminder_failed",
)


def user_row(user: User, is_admin: bool) -> UserRow:
    return UserRow(
        id=user.telegram_id,
        created=user.created_at,
        created_day=local_day(user.created_at),
        opened=user.app_opened_at,
        last_seen=user.last_seen_at,
        bot_blocked=user.bot_blocked_at,
        blocked=user.blocked_at,
        first_checkin=user.first_checkin_at,
        source=source_name(user.source),
        tag=user.source_tag,
        platform=user.signup_platform or ("web" if user.telegram_id < 0 else "telegram"),
        device=user.device,
        language=user.language,
        timezone=user.timezone,
        timezone_city=user.timezone_city,
        theme=user.theme,
        mark_yesterday=user.mark_yesterday,
        checkin_reminder=user.checkin_reminder_time is not None,
        install_offer_sent=user.install_offer_sent_at,
        is_test=user.is_test,
        is_admin=is_admin,
    )


async def user_insights(repo: Repository, user: User, is_admin: bool, now: datetime) -> dict:
    """Поля сводки профиля (AdminUserProfile): источник, платформа, статус, активация,
    серии, дни с отметками и доля выполнения за 30 дней."""
    row = user_row(user, is_admin)
    tasks = [
        TaskRow(
            id=task.id,
            user_id=task.user_id,
            name=task.name,
            frequency_type=task.frequency_type,
            days=task.days,
            start_date=task.start_date,
            reminder_time=task.reminder_time,
            created=task.created_at,
            is_active=task.is_active,
            deleted=task.deleted_at,
        )
        for task in await repo.user_tasks(user.telegram_id)
    ]
    checkins = await repo.user_checkin_days(user.telegram_id)
    ds = Dataset(
        now=now,
        today=local_day(now),
        config=await load_config(repo),
        users={row.id: row},
        activity={row.id: await repo.user_activity_days(user.telegram_id)},
        checkins={row.id: checkins},
        tasks=tasks,
        push_users={row.id} if await repo.has_push_subscription(user.telegram_id) else set(),
    )
    ds.set_push_gone(
        {uid: moment for uid, _, _, _, moment in await repo.actions(["push_gone"], user_id=row.id)}
    )
    current, best = (await ds.load_streaks(repo)).get(row.id, (0, 0))

    today = user_today(row)
    days = [today - timedelta(days=offset) for offset in range(29, -1, -1)]
    active = [task for task in tasks if task.is_active]
    schedules = [
        TaskSchedule(
            id=task.id,
            created_on=task.created.date(),
            frequency_type=task.frequency_type,
            days=task.days,
            start_date=task.start_date,
        )
        for task in active
    ]
    done = [
        (task_id, day)
        for task_id, _, day, _ in await repo.done_logs(since=days[0], user_ids=[row.id])
    ]
    totals = completion_by_day(schedules, done, days)
    activated = ds.activation_day(row.id)
    return {
        "source": row.source,
        "source_tag": row.tag,
        "platform": row.platform,
        "device": row.device,
        "is_test": row.is_test,
        "status": ds.status(row),
        "activated": True if activated else (False if ds.window_closed(row) else None),
        "live": ds.is_live(row.id),
        "current_streak": current,
        "best_streak": best,
        "checkin_days": len(checkins),
        "completion_30d": ratio(sum(c for _, c in totals), sum(s for s, _ in totals)),
        "last_checkin": checkins[-1] if checkins else None,
    }


async def timeline(repo: Repository, user: User, offset: int) -> TimelinePage:
    """Страница ленты действий, новые сначала."""
    limit = TIMELINE_PAGE_SIZE
    logs = await repo.user_actions_page(user.telegram_id, offset, limit + 1)
    more = len(logs) > limit
    page = logs[:limit]
    names = await repo.task_names(
        [log.ref_id for log in page if log.kind in _HABIT_ACTIONS and log.ref_id is not None]
    )
    items = [
        TimelineItem(
            at=log.created_at,
            kind=log.kind,
            detail=log.detail,
            habit=names.get(log.ref_id) if log.ref_id is not None and log.kind in _HABIT_ACTIONS else None,
        )
        for log in page
    ]
    # «Пришёл» и «впервые открыл» — из полей пользователя, на своём месте по времени.
    source = source_name(user.source)
    synthetic = [
        TimelineItem(
            at=user.created_at,
            kind="joined",
            detail=f"{source}:{user.source_tag}" if user.source_tag else source,
        )
    ]
    if user.app_opened_at is not None:
        synthetic.append(TimelineItem(at=user.app_opened_at, kind="first_open"))
    newest = page[0].created_at if page and offset else None
    oldest = page[-1].created_at if page and more else None
    for item in synthetic:
        moment = item.at.replace(tzinfo=None)
        if (newest is None or moment <= newest) and (oldest is None or moment > oldest):
            items.append(item)
    items.sort(key=lambda item: item.at, reverse=True)
    return TimelinePage(items=items, next_offset=offset + limit if more else None)

