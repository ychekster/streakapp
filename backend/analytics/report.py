"""Разделы аналитики админ-панели: сводка, воронка, удержание, отток и возврат, привычки,
источники, напоминания и рассылки. Определения — data.py, люди за цифрами — people.py.

Каждый раздел — одна функция: (репозиторий, набор данных, период) → схема ответа. Цифры
с изменением считаются и за прошлый такой же период (`Metric.previous`).
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta

import pytz

from backend.analytics.completion import completion_by_day
from backend.analytics.data import Dataset, Period, UserRow, median, ratio
from backend.analytics.names import group_names, topic
from backend.clock import day_end, day_start, local_day
from backend.constants import (
    ACTIVE_NOW_MINUTES,
    CHURN_DAYS,
    REMINDER_EFFECT_HOURS,
)
from backend.repository import Repository, TaskSchedule
from backend.schemas import (
    AnalyticsChurnResponse,
    AnalyticsFunnelResponse,
    AnalyticsHabitsResponse,
    AnalyticsMessagingResponse,
    AnalyticsMeta,
    AnalyticsRetentionResponse,
    AnalyticsSourcesResponse,
    AnalyticsSummary,
    BroadcastStats,
    ChangeItem,
    DayValue,
    FunnelReport,
    FunnelSourceRow,
    FunnelStep,
    LeaveBucket,
    Metric,
    NamedCount,
    RetentionCurve,
    RetentionWeek,
    ReturnReason,
    SourceRow,
    SummaryToday,
)
from backend.services import resolve_timezone
from backend.sources import parse_source, source_name
from backend.timezones import selected_city, timezone_display

# Шаги воронок (ключи — во фронтенде подписи).
TELEGRAM_STEPS = ("started", "opened", "habit", "checkin", "activated", "day7")
WEB_STEPS = ("landing", "install_screen", "installed", "habit", "checkin", "activated", "day7")
# Шаги веб-воронки до появления аккаунта: их считают события страницы (людей ещё нет).
WEB_PAGE_STEPS = ("landing", "install_screen")
# Последний шаг воронки — вернулся через неделю и позже.
RETURN_AFTER_DAYS = 7
# Удержание: дни D1, D7, D30; кривая — дни 0…CURVE_DAYS; таблица — недели 0…WEEK_CELLS.
CURVE_DAYS = 30
WEEK_CELLS = 8
# Сколько строк таблиц «топ».
TOP_NAMES = 30
TOP_TIMEZONES = 10
# Группы по числу привычек и по длине серии, «когда уходят», «сколько не заходит».
HABIT_BUCKETS = ((1, 1, "1"), (2, 3, "2-3"), (4, 6, "4-6"), (7, None, "7+"))
STREAK_BUCKETS = (
    (0, 0, "0"), (1, 2, "1-2"), (3, 6, "3-6"), (7, 13, "7-13"),
    (14, 29, "14-29"), (30, 59, "30-59"), (60, None, "60+"),
)
LEAVE_BUCKETS = ((0, 0, "0"), (1, 1, "1"), (2, 3, "2-3"), (4, 7, "4-7"), (8, 14, "8-14"), (15, None, "15+"))
INACTIVE_BUCKETS = ((CHURN_DAYS, 30, "14-30"), (31, 60, "31-60"), (61, 90, "61-90"), (91, None, "91+"))


def bucket_of(value: int, buckets: tuple[tuple[int, int | None, str], ...]) -> str:
    for low, high, key in buckets:
        if value >= low and (high is None or value <= high):
            return key
    return buckets[-1][2]


def meta(ds: Dataset, period: Period) -> AnalyticsMeta:
    return AnalyticsMeta(
        period=period.key,
        start=period.start,
        end=period.end,
        generated_at=ds.now,
        tracking_since=ds.config.tracking_since,
        sources=ds.sources,
        activation_window_days=ds.config.window_days,
        activation_min_days=ds.config.min_days,
    )


def _first_day(ds: Dataset) -> date:
    days = [user.created_day for user in ds.users.values()]
    return min(days) if days else ds.today


# --------------------------------------------------------------------------- #
#  Общие расчёты
# --------------------------------------------------------------------------- #


def activation_rate(ds: Dataset, period: Period | None) -> tuple[float | None, int, list[UserRow]]:
    """Доля активированных среди новых периода, у кого уже понятно (окно закончилось или
    уже активирован); сколько ещё в процессе; кто активирован."""
    if period is None:
        return None, 0, []
    cohort = ds.new_in(period)
    known = [user for user in cohort if ds.activation_known(user)]
    activated = [user for user in known if ds.activation_day(user.id) is not None]
    return ratio(len(activated), len(known)), len(cohort) - len(known), activated


def day_n_cohort(ds: Dataset, period: Period | None, n: int) -> list[UserRow]:
    """Те, чей n-й день после прихода приходится на период и уже закончился."""
    if period is None:
        return []
    last = min(period.end, ds.today - timedelta(days=1))
    return [
        user
        for user in ds.users.values()
        if (period.start is None or user.created_day + timedelta(days=n) >= period.start)
        and user.created_day + timedelta(days=n) <= last
    ]


def retained(ds: Dataset, user: UserRow, n: int, basis: str) -> bool:
    day = user.created_day + timedelta(days=n)
    return ds.checked_on(user.id, day) if basis == "checkin" else ds.was_active_on(user.id, day)


def day_n_rate(ds: Dataset, period: Period | None, n: int, basis: str) -> tuple[float | None, int]:
    cohort = day_n_cohort(ds, period, n)
    return ratio(sum(1 for user in cohort if retained(ds, user, n, basis)), len(cohort)), len(cohort)


def uninstall_day(ds: Dataset, user: UserRow) -> date | None:
    """День, когда пользователь «вероятно удалил» веб-приложение."""
    if not ds.likely_uninstalled(user):
        return None
    days = []
    gone = (ds._gone_push or {}).get(user.id)
    if gone is not None:
        days.append(local_day(gone))
    inactive = ds.inactive_days(user)
    if inactive is not None and inactive >= CHURN_DAYS:
        days.append(ds.gone_day(user))
    return min(day for day in days if day is not None) if days else None


def churned_in(ds: Dataset, period: Period | None) -> list[UserRow]:
    """Стали неактивными за период (и до сих пор не вернулись)."""
    if period is None:
        return []
    return [user for user in ds.users.values() if ds.is_churned(user) and period.contains(ds.gone_day(user))]


def uninstalled_in(ds: Dataset, period: Period | None) -> list[UserRow]:
    if period is None:
        return []
    return [user for user in ds.users.values() if period.contains(uninstall_day(ds, user))]


async def block_days(repo: Repository, ds: Dataset) -> dict[int, list[date]]:
    """Дни (по Алматы), когда пользователи блокировали бота."""
    days: dict[int, list[date]] = defaultdict(list)
    for user_id, _, _, _, moment in await repo.actions(["bot_blocked"]):
        if user_id in ds.users:
            days[user_id].append(local_day(moment))
    return days


def blocked_in(blocks: dict[int, list[date]], period: Period | None) -> set[int]:
    if period is None:
        return set()
    return {user_id for user_id, days in blocks.items() if any(period.contains(day) for day in days)}


def _metric(current: float | None, previous: float | None) -> Metric:
    return Metric(value=current, previous=previous)


# --------------------------------------------------------------------------- #
#  1. Сводка
# --------------------------------------------------------------------------- #


async def summary(repo: Repository, ds: Dataset, period: Period) -> AnalyticsSummary:
    previous = period.previous()
    yesterday = ds.today - timedelta(days=1)
    online_since = ds.now - timedelta(minutes=ACTIVE_NOW_MINUTES)

    activation, pending, _ = activation_rate(ds, period)
    activation_before, _, _ = activation_rate(ds, previous)
    d7, d7_size = day_n_rate(ds, period, 7, "checkin")
    d7_before, d7_before_size = day_n_rate(ds, previous, 7, "checkin")
    blocks = await block_days(repo, ds)
    new_now, new_before = len(ds.new_in(period)), (len(ds.new_in(previous)) if previous else None)
    live_now = ds.live_count(ds.today)
    live_week_ago = ds.live_count(ds.today - timedelta(days=7))
    inactive_now = len(churned_in(ds, period))
    inactive_before = len(churned_in(ds, previous)) if previous else None

    changes: list[ChangeItem] = []
    if new_before is not None and max(new_now, new_before) >= 5:
        change = (new_now - new_before) / max(new_before, 1)
        if abs(change) >= 0.25:
            changes.append(
                ChangeItem(
                    kind="new_users",
                    current=new_now,
                    previous=new_before,
                    source=_driving_source(ds, period, previous, growing=change > 0),
                )
            )
    if activation is not None and activation_before is not None and abs(activation - activation_before) >= 0.05:
        changes.append(ChangeItem(kind="activation", current=activation, previous=activation_before))
    if max(live_now, live_week_ago) >= 3 and abs(live_now - live_week_ago) >= max(3, 0.15 * live_week_ago):
        changes.append(ChangeItem(kind="live", current=live_now, previous=live_week_ago))
    if (
        d7 is not None and d7_before is not None and min(d7_size, d7_before_size) >= 5
        and abs(d7 - d7_before) >= 0.05
    ):
        changes.append(ChangeItem(kind="d7", current=d7, previous=d7_before))
    blocked_yesterday = sum(1 for days in blocks.values() if yesterday in days)
    usual = [
        sum(1 for days in blocks.values() if ds.today - timedelta(days=offset) in days)
        for offset in range(2, 9)
    ]
    usual_average = sum(usual) / len(usual)
    if blocked_yesterday >= 3 and blocked_yesterday >= 2 * usual_average:
        changes.append(
            ChangeItem(kind="blocked", current=blocked_yesterday, previous=round(usual_average, 1))
        )
    if inactive_before is not None and max(inactive_now, inactive_before) >= 5:
        if abs(inactive_now - inactive_before) / max(inactive_before, 1) >= 0.3:
            changes.append(ChangeItem(kind="inactive", current=inactive_now, previous=inactive_before))

    return AnalyticsSummary(
        meta=meta(ds, period),
        live=_metric(live_now, live_week_ago),
        live_weeks=[
            DayValue(date=end, value=ds.live_count(end))
            for end in (ds.today - timedelta(days=7 * weeks) for weeks in range(7, -1, -1))
        ],
        new_users=_metric(new_now, new_before),
        activation=_metric(activation, activation_before),
        activation_pending=pending,
        d7=_metric(d7, d7_before),
        d7_cohort=d7_size,
        today=SummaryToday(
            opened=sum(1 for user_id in ds.users if ds.was_active_on(user_id, ds.today)),
            checked_in=sum(1 for user_id in ds.users if ds.checked_on(user_id, ds.today)),
            online=sum(
                1 for user in ds.users.values() if user.last_seen and user.last_seen >= online_since
            ),
            opened_yesterday=sum(1 for user_id in ds.users if ds.was_active_on(user_id, yesterday)),
            checked_in_yesterday=sum(1 for user_id in ds.users if ds.checked_on(user_id, yesterday)),
        ),
        blocked_bot=_metric(
            len(blocked_in(blocks, period)), len(blocked_in(blocks, previous)) if previous else None
        ),
        became_inactive=_metric(inactive_now, inactive_before),
        uninstalled=_metric(
            len(uninstalled_in(ds, period)), len(uninstalled_in(ds, previous)) if previous else None
        ),
        changes=changes[:4],
    )


def _driving_source(ds: Dataset, period: Period, previous: Period | None, *, growing: bool) -> str | None:
    """Источник, который больше всех дал изменение числа новых."""
    if previous is None:
        return None
    now = Counter(user.source for user in ds.new_in(period))
    before = Counter(user.source for user in ds.new_in(previous))
    deltas = {source: now[source] - before[source] for source in now | before}
    if not deltas:
        return None
    source = max(deltas, key=deltas.get) if growing else min(deltas, key=deltas.get)  # type: ignore[arg-type]
    delta = deltas[source]
    return source if (delta > 0 if growing else delta < 0) else None


# --------------------------------------------------------------------------- #
#  2. Воронка
# --------------------------------------------------------------------------- #


def user_steps(ds: Dataset, user: UserRow, first_task: datetime | None) -> list[datetime | None]:
    """Моменты шагов «появился → открыл → привычка → отметил → активирован → через неделю»
    (None — шаг не пройден; шаги проходятся по порядку)."""
    first_checkin_day = (ds.checkins.get(user.id) or [None])[0]
    first_checkin = user.first_checkin or (day_start(first_checkin_day) if first_checkin_day else None)
    activation = ds.activation_day(user.id)
    week_later = user.created_day + timedelta(days=RETURN_AFTER_DAYS)
    activity = ds.activity.get(user.id, [])
    returned_day = activity[bisect_left(activity, week_later)] if activity and activity[-1] >= week_later else None
    moments: list[datetime | None] = [
        user.created,
        user.opened,
        first_task,
        first_checkin,
        day_start(activation) if activation else None,
        day_start(returned_day) if returned_day else None,
    ]
    for index in range(1, len(moments)):
        if moments[index - 1] is None:
            moments[index] = None
    return moments


def _steps(keys: tuple[str, ...], counts: list[int], gaps: list[list[float]], page: tuple[str, ...]) -> list[FunnelStep]:
    steps: list[FunnelStep] = []
    for index, key in enumerate(keys):
        steps.append(
            FunnelStep(
                key=key,
                users=counts[index],
                from_previous=ratio(counts[index], counts[index - 1]) if index else 1.0 if counts[0] else None,
                from_start=ratio(counts[index], counts[0]),
                median_minutes_to_next=(
                    round(value, 1) if index < len(gaps) and (value := median(gaps[index])) is not None else None
                ),
                people=key not in page,
            )
        )
    return steps


def _user_funnel(ds: Dataset, cohort: list[UserRow]) -> tuple[list[int], list[list[float]], dict[str, list[int]]]:
    """Счётчики шагов (с «появился») пользователей, медианы переходов и разбивка по
    источникам."""
    first_task: dict[int, datetime] = {}
    for task in ds.tasks:
        if task.user_id not in first_task or task.created < first_task[task.user_id]:
            first_task[task.user_id] = task.created
    counts = [0] * len(TELEGRAM_STEPS)
    gaps: list[list[float]] = [[] for _ in range(len(TELEGRAM_STEPS) - 1)]
    by_source: dict[str, list[int]] = defaultdict(lambda: [0] * len(TELEGRAM_STEPS))
    for user in cohort:
        moments = user_steps(ds, user, first_task.get(user.id))
        for index, moment in enumerate(moments):
            if moment is None:
                continue
            counts[index] += 1
            by_source[user.source][index] += 1
            following = moments[index + 1] if index + 1 < len(moments) else None
            if following is not None and index + 1 < len(moments) - 1:
                gaps[index].append(max(0.0, (following - moment).total_seconds() / 60))
    return counts, gaps, by_source


async def funnel(repo: Repository, ds: Dataset, period: Period, platform: str | None, source: str | None) -> AnalyticsFunnelResponse:
    cohort = ds.new_in(period)
    reports: list[FunnelReport] = []
    if platform in (None, "telegram"):
        counts, gaps, by_source = _user_funnel(ds, [user for user in cohort if user.platform == "telegram"])
        reports.append(
            FunnelReport(
                platform="telegram",
                steps=_steps(TELEGRAM_STEPS, counts, gaps, ()),
                by_source=_source_rows(by_source),
            )
        )
    if platform in (None, "web"):
        counts, gaps, by_source = _user_funnel(ds, [user for user in cohort if user.platform == "web"])
        since = day_start(period.start) if period.start else None
        until = day_end(period.end)
        visitors: dict[str, set[str]] = {step: set() for step in WEB_PAGE_STEPS}
        visitors_by_source: dict[str, dict[str, set[str]]] = defaultdict(lambda: {step: set() for step in WEB_PAGE_STEPS})
        first_seen: dict[str, dict[str, datetime]] = {step: {} for step in WEB_PAGE_STEPS}
        names = {"landing_view": "landing", "install_screen_view": "install_screen"}
        for event, anon, user_id, src, moment in await repo.funnel_events(names, since, until):
            parsed = parse_source(src)
            event_source = source_name(parsed[0] if parsed else None)
            if source is not None and event_source != source:
                continue
            who = anon or (str(user_id) if user_id is not None else None)
            if who is None:
                continue
            step = names[event]
            visitors[step].add(who)
            visitors_by_source[event_source][step].add(who)
            if who not in first_seen[step] or moment < first_seen[step][who]:
                first_seen[step][who] = moment
        page_gaps = [
            max(0.0, (first_seen["install_screen"][who] - first_seen["landing"][who]).total_seconds() / 60)
            for who in first_seen["install_screen"]
            if who in first_seen["landing"]
        ]
        web_counts = [len(visitors["landing"]), len(visitors["install_screen"]), *counts[0:1], *counts[2:]]
        # «Установили» — веб-аккаунты, появившиеся за период (первый запуск с экрана создаёт
        # аккаунт и сразу «открывает» приложение); дальше — те же шаги, что у Telegram, без
        # «открыли приложение».
        web_gaps = [page_gaps, [], gaps[1], gaps[2], gaps[3], []]
        rows: dict[str, list[int]] = {}
        for name in set(by_source) | set(visitors_by_source):
            steps = by_source.get(name, [0] * len(TELEGRAM_STEPS))
            pages = visitors_by_source.get(name, {step: set() for step in WEB_PAGE_STEPS})
            rows[name] = [len(pages["landing"]), len(pages["install_screen"]), steps[0], *steps[2:]]
        reports.append(
            FunnelReport(
                platform="web",
                steps=_steps(WEB_STEPS, web_counts, web_gaps, WEB_PAGE_STEPS),
                by_source=_source_rows(rows),
            )
        )
    return AnalyticsFunnelResponse(meta=meta(ds, period), funnels=reports)


def _source_rows(by_source: dict[str, list[int]]) -> list[FunnelSourceRow]:
    return sorted(
        (FunnelSourceRow(source=name, steps=list(steps)) for name, steps in by_source.items()),
        key=lambda row: (-max(row.steps or [0]), row.source),
    )


# --------------------------------------------------------------------------- #
#  3. Удержание
# --------------------------------------------------------------------------- #


def _any_between(days: list[date] | None, first: date, last: date) -> bool:
    if not days:
        return False
    return bisect_right(days, last) > bisect_left(days, first)


def _weeks_to_show(period: Period) -> int:
    return {"today": 8, "7": 8, "30": 8, "90": 13, "all": 16}.get(period.key, 8)


def retention(ds: Dataset, period: Period, basis: str, compare: str) -> AnalyticsRetentionResponse:
    days_of = ds.checkins if basis == "checkin" else ds.activity
    previous = period.previous()

    this_monday = ds.today - timedelta(days=ds.today.weekday())
    weeks: list[RetentionWeek] = []
    for back in range(_weeks_to_show(period) - 1, -1, -1):
        start = this_monday - timedelta(days=7 * back)
        cohort = [
            user for user in ds.users.values() if start <= user.created_day <= start + timedelta(days=6)
        ]
        cells: list[float | None] = []
        for week in range(WEEK_CELLS + 1):
            first = start + timedelta(days=7 * week)
            if first > ds.today:
                cells.append(None)
                continue
            last = first + timedelta(days=6)
            cells.append(
                ratio(sum(1 for user in cohort if _any_between(days_of.get(user.id), first, last)), len(cohort))
            )
        weeks.append(RetentionWeek(start=start, size=len(cohort), cells=cells))

    cohort = ds.new_in(period)
    groups: dict[str, list[UserRow]] = {"all": cohort}
    if compare == "platform":
        groups = {name: [user for user in cohort if user.platform == name] for name in ("telegram", "web")}
    elif compare == "source":
        top = [name for name, _ in Counter(user.source for user in cohort).most_common(4)]
        groups = {name: [user for user in cohort if user.source == name] for name in top}
    curves: list[RetentionCurve] = []
    for key, members in groups.items():
        points: list[float | None] = []
        for day in range(CURVE_DAYS + 1):
            eligible = [
                user for user in members if day == 0 or user.created_day + timedelta(days=day) < ds.today
            ]
            points.append(
                ratio(sum(1 for user in eligible if retained(ds, user, day, basis)), len(eligible))
            )
        curves.append(RetentionCurve(key=key, size=len(members), points=points))

    def day_metric(n: int) -> Metric:
        now, _ = day_n_rate(ds, period, n, basis)
        before, _ = day_n_rate(ds, previous, n, basis) if previous else (None, 0)
        return Metric(value=now, previous=before)

    leave: Counter[str] = Counter()
    still = 0
    for user in cohort:
        status = ds.status(user)
        if status in ("churned", "uninstalled", "bot_blocked"):
            last = ds.last_active_day(user)
            if last is None:
                leave["never"] += 1
            else:
                leave[bucket_of((last - user.created_day).days, LEAVE_BUCKETS)] += 1
        elif status == "not_opened":
            leave["never"] += 1
        else:
            still += 1
    return AnalyticsRetentionResponse(
        meta=meta(ds, period),
        basis="checkin" if basis == "checkin" else "open",
        weeks=weeks,
        curves=curves,
        d1=day_metric(1),
        d7=day_metric(7),
        d30=day_metric(30),
        leave=[LeaveBucket(key=key, users=leave[key]) for key in ("never", *(b[2] for b in LEAVE_BUCKETS))],
        still_active=still,
    )


# --------------------------------------------------------------------------- #
#  4. Отток и возврат
# --------------------------------------------------------------------------- #


async def churn(repo: Repository, ds: Dataset, period: Period) -> AnalyticsChurnResponse:
    previous = period.previous()
    blocks = await block_days(repo, ds)
    blocked_now = blocked_in(blocks, period)
    tasks_of = ds.tasks_of()
    series_days = period.days(_first_day(ds))[-90:]
    by_day = Counter(day for days in blocks.values() for day in set(days))

    churned = [user for user in ds.users.values() if ds.is_churned(user)]
    inactive_buckets = Counter(
        bucket_of(ds.inactive_days(user) or CHURN_DAYS, INACTIVE_BUCKETS) for user in churned
    )

    opens = await repo.actions(["app_open"])
    open_reasons: dict[tuple[int, date], str] = {}
    for user_id, _, _, detail, moment in opens:
        key = (user_id, local_day(moment))
        if detail in ("reminder", "broadcast", "push") and key not in open_reasons:
            open_reasons[key] = detail
    since = ds.config.tracking_since

    def returned_in(span: Period | None) -> list[tuple[int, date]]:
        if span is None:
            return []
        return [
            (user_id, day)
            for user_id in ds.users
            for day in ds.returns(user_id)
            if span.contains(day)
        ]

    reasons: Counter[str] = Counter()
    returned_now = returned_in(period)
    for user_id, day in returned_now:
        if since is not None and day < local_day(since):
            reasons["unknown"] += 1
        else:
            reasons[open_reasons.get((user_id, day), "self")] += 1

    groups = {
        "gone_active": sum(1 for user in churned if ds.activation_day(user.id) is not None),
        "habit_abandoned": sum(1 for user in ds.users.values() if _abandoned_habit(ds, user, tasks_of)),
        "start_no_open": sum(
            1
            for user in ds.users.values()
            if user.opened is None and user.platform == "telegram" and user.bot_blocked is None
        ),
    }
    return AnalyticsChurnResponse(
        meta=meta(ds, period),
        blocked=Metric(
            value=len(blocked_now), previous=len(blocked_in(blocks, previous)) if previous else None
        ),
        blocked_days=[DayValue(date=day, value=by_day.get(day, 0)) for day in series_days],
        blocked_had_habit=sum(1 for user_id in blocked_now if tasks_of.get(user_id)),
        blocked_activated=sum(1 for user_id in blocked_now if ds.activation_day(user_id) is not None),
        inactive_total=len(churned),
        became_inactive=Metric(
            value=len(churned_in(ds, period)),
            previous=len(churned_in(ds, previous)) if previous else None,
        ),
        inactive_buckets=[LeaveBucket(key=key, users=inactive_buckets[key]) for _, _, key in INACTIVE_BUCKETS],
        uninstalled_total=sum(1 for user in ds.users.values() if ds.likely_uninstalled(user)),
        uninstalled=Metric(
            value=len(uninstalled_in(ds, period)),
            previous=len(uninstalled_in(ds, previous)) if previous else None,
        ),
        returned=Metric(
            value=len({user_id for user_id, _ in returned_now}),
            previous=len({user_id for user_id, _ in returned_in(previous)}) if previous else None,
        ),
        return_reasons=[
            ReturnReason(key=key, users=reasons[key])
            for key in ("reminder", "broadcast", "push", "self", "unknown")
        ],
        groups=[LeaveBucket(key=key, users=value) for key, value in groups.items()],
    )


def _abandoned_habit(ds: Dataset, user: UserRow, tasks_of: dict) -> bool:
    """Добавил привычку и бросил: привычка была, отметок нет CHURN_DAYS дней (или не было
    никогда), бота не блокировал."""
    if not tasks_of.get(user.id) or user.bot_blocked is not None:
        return False
    days = ds.checkins.get(user.id)
    return not days or (ds.today - days[-1]).days >= CHURN_DAYS


# --------------------------------------------------------------------------- #
#  5. Привычки и поведение
# --------------------------------------------------------------------------- #


async def habits(repo: Repository, ds: Dataset, period: Period) -> AnalyticsHabitsResponse:
    previous = period.previous()
    tasks_of = ds.tasks_of()
    app_users = [user for user in ds.users.values() if user.opened is not None and user.bot_blocked is None]
    active_count = {user.id: sum(1 for task in tasks_of.get(user.id, ()) if task.is_active) for user in app_users}
    with_habits = [count for count in active_count.values() if count > 0]
    per_user = Counter(bucket_of(count, HABIT_BUCKETS) for count in with_habits)

    active_tasks = [task for task in ds.tasks if task.is_active]
    grouped = group_names((task.name, task.user_id) for task in active_tasks)
    top = sorted(grouped.items(), key=lambda item: (-len(item[1][2]), -item[1][1], item[1][0]))[:TOP_NAMES]
    frequency = Counter(task.frequency_type.value for task in active_tasks)
    reminder_hours = [0] * 24
    for task in active_tasks:
        if task.reminder_time is not None:
            reminder_hours[task.reminder_time.hour] += 1

    def deleted_in(span: Period | None) -> list:
        if span is None:
            return []
        return [task for task in ds.tasks if task.deleted is not None and span.contains(local_day(task.deleted))]

    deleted_now = deleted_in(period)
    lifetimes = [(task.deleted - task.created).total_seconds() / 86400 for task in deleted_now]
    since = ds.config.tracking_since
    week_old = [
        task
        for task in ds.tasks
        if (since is None or task.created >= since) and task.created <= ds.now - timedelta(days=7)
    ]
    first_week = ratio(
        sum(1 for task in week_old if task.deleted and task.deleted - task.created <= timedelta(days=7)),
        len(week_old),
    )
    deleted_groups = group_names((task.name, task.user_id) for task in deleted_now)
    deleted_top = sorted(deleted_groups.items(), key=lambda item: (-item[1][1], item[1][0]))[:10]

    streaks = await ds.load_streaks(repo)
    holders = [user_id for user_id in ds.users if active_count.get(user_id) or user_id in streaks]
    current = Counter(bucket_of(streaks.get(user_id, (0, 0))[0], STREAK_BUCKETS) for user_id in holders)
    best = Counter(bucket_of(streaks.get(user_id, (0, 0))[1], STREAK_BUCKETS) for user_id in holders)
    current_values = [value for value, _ in streaks.values()]

    # Доля выполнения: дни периода (у «всего времени» — последние 90) и прошлый период.
    days = period.days(_first_day(ds))[-90:]
    before_days = previous.days(_first_day(ds))[-90:] if previous else []
    first = min([*days, *before_days])
    schedules = [
        TaskSchedule(
            id=task.id,
            created_on=task.created.date(),
            frequency_type=task.frequency_type,
            days=task.days,
            start_date=task.start_date,
        )
        for task in active_tasks
    ]
    logs = await repo.done_logs(since=first, user_ids=list(ds.users))
    done = [(task_id, day) for task_id, _, day, _ in logs]
    week_days = days if len(days) >= 14 else [ds.today - timedelta(days=offset) for offset in range(27, -1, -1)]
    all_days = sorted(set(days) | set(before_days) | set(week_days))
    by_day = dict(zip(all_days, completion_by_day(schedules, done, all_days)))

    def total(span: list[date]) -> float | None:
        return ratio(sum(by_day[day][1] for day in span), sum(by_day[day][0] for day in span))

    weekday_totals = [[0, 0] for _ in range(7)]
    for day in week_days:
        scheduled, completed = by_day[day]
        weekday_totals[day.weekday()][0] += scheduled
        weekday_totals[day.weekday()][1] += completed

    hours = [0] * 24
    zones = {user.id: resolve_timezone(user.timezone) for user in ds.users.values()}
    start = day_start(period.start) if period.start else None
    for _, user_id, _, marked in logs:
        if marked is None or (start is not None and marked < start) or marked >= day_end(period.end):
            continue
        zone = zones.get(user_id)
        if zone is not None:
            hours[pytz.utc.localize(marked).astimezone(zone).hour] += 1

    base = len(app_users)
    with_habit_reminder = {task.user_id for task in active_tasks if task.reminder_time is not None}
    features = {
        "mark_yesterday": sum(1 for user in app_users if user.mark_yesterday),
        "checkin_reminder": sum(1 for user in app_users if user.checkin_reminder),
        "habit_reminder": sum(1 for user in app_users if user.id in with_habit_reminder),
        "push": sum(1 for user in app_users if user.id in ds.push_users),
        "dark_theme": sum(1 for user in app_users if user.theme == "dark"),
        "english": sum(1 for user in app_users if user.language == "en"),
    }
    return AnalyticsHabitsResponse(
        meta=meta(ds, period),
        average=round(sum(with_habits) / len(with_habits), 2) if with_habits else None,
        with_habits=len(with_habits),
        without_habits=base - len(with_habits),
        per_user=[LeaveBucket(key=key, users=per_user[key]) for _, _, key in HABIT_BUCKETS],
        top_names=[
            NamedCount(key=key, name=label, users=len(owners), habits=count)
            for key, (label, count, owners) in top
        ],
        frequency=[
            LeaveBucket(key=key, users=frequency[key])
            for key in ("daily", "specific_days", "every_other_day", "monthly")
        ],
        total_habits=len(active_tasks),
        with_reminder=sum(1 for task in active_tasks if task.reminder_time is not None),
        reminder_hours=reminder_hours,
        deleted=Metric(value=len(deleted_now), previous=len(deleted_in(previous)) if previous else None),
        deleted_median_days=round(value, 1) if (value := median(lifetimes)) is not None else None,
        deleted_first_week=first_week,
        deleted_top=[
            NamedCount(key=key, name=label, users=len(owners), habits=count)
            for key, (label, count, owners) in deleted_top
        ],
        streaks_current=[LeaveBucket(key=key, users=current[key]) for _, _, key in STREAK_BUCKETS],
        streaks_best=[LeaveBucket(key=key, users=best[key]) for _, _, key in STREAK_BUCKETS],
        streak_7=sum(1 for value in current_values if value >= 7),
        streak_30=sum(1 for value in current_values if value >= 30),
        streak_100=sum(1 for value in current_values if value >= 100),
        longest_streak=max(current_values, default=0),
        completion=Metric(value=total(days), previous=total(before_days) if before_days else None),
        completion_days=[
            DayValue(date=day, value=ratio(by_day[day][1], by_day[day][0])) for day in days
        ],
        completion_weekdays=[ratio(done_count, scheduled) for scheduled, done_count in weekday_totals],
        checkin_hours=hours,
        features=[
            NamedCount(key=key, name=key, users=value, habits=0) for key, value in features.items()
        ],
        app_users=base,
    )


def habit_topic(name: str) -> str:
    """Ключ группы названия (для людей «у кого есть привычка …»)."""
    return topic(name)


# --------------------------------------------------------------------------- #
#  6. Источники и аудитория
# --------------------------------------------------------------------------- #


def sources(ds: Dataset, period: Period, language: str) -> AnalyticsSourcesResponse:
    cohort = ds.new_in(period)

    def row(source: str, tag: str | None, members: list[UserRow]) -> SourceRow:
        known = [user for user in members if ds.activation_known(user)]
        d7_members = [
            user for user in members if user.created_day + timedelta(days=7) < ds.today
        ]
        return SourceRow(
            source=source,
            tag=tag,
            new_users=len(members),
            opened_rate=ratio(sum(1 for user in members if user.opened), len(members)),
            activated_rate=ratio(
                sum(1 for user in known if ds.activation_day(user.id) is not None), len(known)
            ),
            d7_rate=ratio(
                sum(1 for user in d7_members if retained(ds, user, 7, "checkin")), len(d7_members)
            ),
            live=sum(1 for user in members if ds.is_live(user.id)),
        )

    by_source: dict[str, list[UserRow]] = defaultdict(list)
    by_tag: dict[tuple[str, str], list[UserRow]] = defaultdict(list)
    for user in cohort:
        by_source[user.source].append(user)
        if user.tag:
            by_tag[(user.source, user.tag)].append(user)
    rows = [row(name, None, members) for name, members in by_source.items()]
    rows.sort(key=lambda item: -item.new_users)
    tagged = [row(name, tag, members) for (name, tag), members in by_tag.items()]
    tagged.sort(key=lambda item: -item.new_users)

    zones: Counter[tuple[str, int | None]] = Counter(
        (user.timezone, user.timezone_city) for user in cohort if user.timezone
    )
    timezones: list[NamedCount] = []
    for (zone, city_id), count in zones.most_common(TOP_TIMEZONES):
        city = selected_city(zone, city_id)
        timezones.append(
            NamedCount(key=zone, name=timezone_display(zone, language, city), users=count)
        )
    web = [user for user in cohort if user.platform == "web"]
    return AnalyticsSourcesResponse(
        meta=meta(ds, period),
        rows=rows + tagged,
        platforms=[
            LeaveBucket(key=key, users=sum(1 for user in cohort if user.platform == key))
            for key in ("telegram", "web")
        ],
        devices=[
            LeaveBucket(key=key, users=sum(1 for user in cohort if (user.device or "unknown") == key))
            for key in ("ios", "android", "desktop", "unknown")
        ],
        languages=[
            LeaveBucket(key=key, users=count)
            for key, count in Counter(user.language for user in cohort).most_common()
        ],
        timezones=timezones,
        web_users=len(web),
        web_linked=sum(1 for user in web if not user.web_only),
        cohort=len(cohort),
    )


# --------------------------------------------------------------------------- #
#  7. Напоминания и рассылки
# --------------------------------------------------------------------------- #


async def messaging(repo: Repository, ds: Dataset, period: Period) -> AnalyticsMessagingResponse:
    start = day_start(period.start) if period.start else None
    end = day_end(period.end)
    kinds = [
        "reminder_sent", "reminder_failed", "checkin", "app_open", "broadcast_sent",
        "bot_blocked", "install_offer_sent",
    ]
    actions = [row for row in await repo.actions(kinds) if row[0] in ds.users]
    in_period = [row for row in actions if (start is None or row[4] >= start) and row[4] < end]

    checkins: dict[int, list[tuple[datetime, int | None]]] = defaultdict(list)
    opens: dict[int, list[tuple[datetime, str | None, int | None]]] = defaultdict(list)
    blocks: dict[int, list[datetime]] = defaultdict(list)
    for user_id, kind, ref_id, detail, moment in actions:
        if kind == "checkin":
            checkins[user_id].append((moment, ref_id))
        elif kind == "app_open":
            opens[user_id].append((moment, detail, ref_id))
        elif kind == "bot_blocked":
            blocks[user_id].append(moment)

    effect = timedelta(hours=REMINDER_EFFECT_HOURS)
    sent = [row for row in in_period if row[1] == "reminder_sent"]
    followed = 0
    for user_id, _, ref_id, _, moment in sent:
        if any(
            moment <= marked <= moment + effect and (ref_id is None or task == ref_id)
            for marked, task in checkins.get(user_id, ())
        ):
            followed += 1
    reminder_opens = [row for row in in_period if row[1] == "app_open" and row[3] == "reminder"]

    # Держатся ли люди с напоминаниями лучше: «живые» сейчас и D7 по отметкам.
    tasks_of = ds.tasks_of()
    with_reminder = {
        user.id
        for user in ds.users.values()
        if user.checkin_reminder
        or any(task.is_active and task.reminder_time is not None for task in tasks_of.get(user.id, ()))
    }
    has_habits = [user for user in ds.users.values() if any(task.is_active for task in tasks_of.get(user.id, ()))]
    group_with = [user for user in has_habits if user.id in with_reminder]
    group_without = [user for user in has_habits if user.id not in with_reminder]
    d7_cohort = day_n_cohort(ds, period, 7)

    def d7_of(ids: set[int], inside: bool) -> float | None:
        members = [user for user in d7_cohort if (user.id in ids) == inside]
        return ratio(sum(1 for user in members if retained(ds, user, 7, "checkin")), len(members))

    broadcasts: list[BroadcastStats] = []
    deliveries: dict[int, list[tuple[int, datetime]]] = defaultdict(list)
    for user_id, kind, ref_id, _, moment in actions:
        if kind == "broadcast_sent" and ref_id is not None:
            deliveries[ref_id].append((user_id, moment))
    for broadcast in await repo.all_broadcasts():
        if not period.contains(local_day(broadcast.created_at)):
            continue
        received = deliveries.get(broadcast.id, [])

        def within(rows: dict, user_id: int, moment: datetime, hours: int, match=None) -> bool:
            return any(
                moment <= item[0] <= moment + timedelta(hours=hours) and (match is None or match(item))
                for item in rows.get(user_id, ())
            )

        broadcasts.append(
            BroadcastStats(
                id=broadcast.id,
                created_at=broadcast.created_at,
                text=(broadcast.text or "")[:120] or None,
                media_type=broadcast.media_type,
                audience=broadcast.audience,
                button=broadcast.button,
                total=broadcast.total,
                sent=broadcast.sent,
                failed=broadcast.failed,
                tracked=bool(received),
                opened_24h=sum(1 for user_id, moment in received if within(opens, user_id, moment, 24)),
                opened_72h=sum(1 for user_id, moment in received if within(opens, user_id, moment, 72)),
                checked_72h=sum(1 for user_id, moment in received if within(checkins, user_id, moment, 72)),
                blocked_24h=sum(
                    1
                    for user_id, moment in received
                    if any(moment <= blocked <= moment + timedelta(hours=24) for blocked in blocks.get(user_id, ()))
                ),
                button_opens=len(
                    {
                        user_id
                        for user_id, items in opens.items()
                        for _, detail, ref in items
                        if detail == "broadcast" and ref == broadcast.id
                    }
                ),
            )
        )

    offered = [user for user in ds.users.values() if user.install_offer_sent and period.contains(local_day(user.install_offer_sent))]
    sessions = await repo.first_web_sessions()
    prompt = await repo.funnel_events(
        ["install_prompt_shown", "install_prompt_accepted", "app_installed"], start, end
    )

    def devices(event: str) -> int:
        return len({anon or user_id for name, anon, user_id, _, _ in prompt if name == event})

    return AnalyticsMessagingResponse(
        meta=meta(ds, period),
        reminders_telegram=sum(1 for row in sent if row[3] == "telegram"),
        reminders_push=sum(1 for row in sent if row[3] == "push"),
        reminders_failed=sum(1 for row in in_period if row[1] == "reminder_failed"),
        reminders_followed=ratio(followed, len(sent)),
        reminder_opens=len(reminder_opens),
        reminder_open_users=len({row[0] for row in reminder_opens}),
        push_opens=sum(1 for row in in_period if row[1] == "app_open" and row[3] == "push"),
        with_reminders=len(group_with),
        without_reminders=len(group_without),
        live_with=ratio(sum(1 for user in group_with if ds.is_live(user.id)), len(group_with)),
        live_without=ratio(sum(1 for user in group_without if ds.is_live(user.id)), len(group_without)),
        d7_with=d7_of(with_reminder, True),
        d7_without=d7_of(with_reminder, False),
        broadcasts=broadcasts,
        offer_shown=len(offered),
        offer_clicked=len(
            {row[0] for row in in_period if row[1] == "app_open" and row[3] == "install_offer"}
        ),
        offer_installed=sum(
            1
            for user in offered
            if user.id in sessions and user.install_offer_sent and sessions[user.id] >= user.install_offer_sent
        ),
        prompt_shown=devices("install_prompt_shown"),
        prompt_accepted=devices("install_prompt_accepted"),
        prompt_installed=devices("app_installed"),
    )
