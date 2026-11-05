"""Профиль пользователя в панели: сводка (откуда пришёл, статус, серия, выполнение) и
лента его действий.

Сводка считается теми же определениями, что и вся аналитика (data.Dataset) — на наборе
из одного пользователя. Лента — записи activity_log, шаги воронки до аккаунта (лендинг,
установка; events, в том числе с устройств до входа) и ещё два события из полей
пользователя: «пришёл» (с источником) и «впервые открыл приложение». Новые сначала или с
самого начала.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from backend.analytics.completion import completion_by_day
from backend.analytics.data import Dataset, TaskRow, UserRow, load_config, ratio, user_today
from backend.clock import local_day
from backend.constants import FUNNEL_EVENTS, SERVER_FUNNEL_EVENTS, TIMELINE_PAGE_SIZE
from backend.models import Event, User
from backend.repository import Repository, TaskSchedule
from backend.schemas import TimelineItem, TimelinePage
from backend.sources import source_name

# Действия, у которых ref_id — привычка (в ленте показывается её название).
_HABIT_ACTIONS = (
    "habit_created", "habit_updated", "habit_deleted", "habit_frozen", "habit_unfrozen",
    "habit_archived", "habit_unarchived",
    "checkin", "uncheck", "auto_checkin", "reminder_sent", "reminder_failed",
    "group_created", "group_joined", "group_left", "group_unshared", "group_mark_sent",
    "group_mark_failed", "timer_goal_sent", "timer_goal_failed",
)

# Шаги воронки в ленте. Записанные сервером («запустил бота», первая привычка и отметка,
# вход) уже есть в ней действиями — их второй раз не показываем.
_TIMELINE_EVENTS = tuple(event for event in FUNNEL_EVENTS if event not in SERVER_FUNNEL_EVENTS)


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
        is_test=user.is_test,
        is_admin=is_admin,
        telegram_seen=user.telegram_seen_at,
        web_seen=user.web_seen_at,
    )


def uses_telegram(user: User) -> bool:
    """Открывал Mini App (определение — data.UserRow.uses_telegram)."""
    return user_row(user, False).uses_telegram


def uses_web(user: User) -> bool:
    """Заходил в веб-приложение."""
    return user_row(user, False).uses_web


async def user_insights(repo: Repository, user: User, is_admin: bool, now: datetime) -> dict:
    """Поля сводки профиля (AdminUserProfile): источник, платформа, статус, активация,
    серии, дни с отметками, доля выполнения за 30 дней и где он пользуется приложением."""
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
            auto_mark=task.auto_mark,
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
        "uses_telegram": row.uses_telegram,
        "uses_web": row.uses_web,
        "telegram_seen_at": user.telegram_seen_at,
        "web_seen_at": user.web_seen_at,
        "push": row.id in ds.push_users,
    }


def event_item(event: Event) -> TimelineItem:
    """Шаг воронки строкой ленты: `detail` — «платформа|браузер|источник|приложение»
    (что из этого известно; приложение — Threads, Instagram… у встроенного браузера)."""
    props = event.props or {}
    app = props.get("app")
    detail = "|".join(
        (
            event.platform or "",
            event.browser_context or "",
            event.src or "",
            app if isinstance(app, str) else "",
        )
    )
    return TimelineItem(at=event.created_at, kind=event.event, detail=detail)


def _moment(item: TimelineItem) -> datetime:
    return item.at.replace(tzinfo=None)


async def timeline(
    repo: Repository, user: User, offset: int, newest_first: bool = True
) -> TimelinePage:
    """Страница ленты: действия, шаги до аккаунта (лендинг, установка) и «пришёл» / «впервые
    открыл» — новые сначала или с самого начала (с первого клика)."""
    limit = TIMELINE_PAGE_SIZE
    # Лента склеена из трёх источников: из каждого берётся всё до конца страницы, а
    # страница вырезается из общего порядка.
    wanted = offset + limit + 1
    logs = await repo.user_actions_page(user.telegram_id, 0, wanted, newest_first)
    events = [
        event
        for event in await repo.user_events(
            user.telegram_id, wanted + len(SERVER_FUNNEL_EVENTS), newest_first
        )
        if event.event in _TIMELINE_EVENTS
    ]
    names = await repo.task_names(
        [log.ref_id for log in logs if log.kind in _HABIT_ACTIONS and log.ref_id is not None]
    )
    items = [
        TimelineItem(
            at=log.created_at,
            kind=log.kind,
            detail=log.detail,
            habit=names.get(log.ref_id) if log.ref_id is not None and log.kind in _HABIT_ACTIONS else None,
        )
        for log in logs
    ]
    items.extend(event_item(event) for event in events)
    # «Пришёл» и «впервые открыл» — из полей пользователя, на своём месте по времени.
    source = source_name(user.source)
    items.append(
        TimelineItem(
            at=user.created_at,
            kind="joined",
            detail=f"{source}:{user.source_tag}" if user.source_tag else source,
        )
    )
    if user.app_opened_at is not None:
        items.append(TimelineItem(at=user.app_opened_at, kind="first_open"))
    items.sort(key=_moment, reverse=newest_first)
    more = len(items) > offset + limit
    return TimelinePage(
        items=items[offset : offset + limit], next_offset=offset + limit if more else None
    )
