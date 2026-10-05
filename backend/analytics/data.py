"""Данные аналитики и определения, одинаковые во всех разделах панели.

Аналитика читает нужные таблицы целиком (Repository.analytics_*) и считает в Python: так
одно определение («активирован», «живой», «ушёл») работает и в цифрах, и в списках людей
(people.py), и в фильтрах рассылки (audience.py). Пользователей — тысячи, это быстро.

Термины (constants.py, ANALYTICS_*):
- **новый пользователь** — появился впервые (users.created_at): /start, Mini App или
  веб-приложение; в статистику не входят администраторы и тестовые аккаунты;
- **активирован** — в первые N дней (день прихода — первый) отметил привычку хотя бы в M
  разных дней (N и M — в настройках панели);
- **активный за день** — открыл приложение в этот день (user_activity), **отмечающий** —
  отметил хотя бы одну привычку (checkin_days); дни — по Алматы;
- **живой** — отмечал привычки хотя бы LIVE_MIN_DAYS разных дней за LIVE_WINDOW_DAYS дней;
- **ушёл** — открывал приложение, но не заходит CHURN_DAYS дней (бота не блокировал);
- **вероятно удалил веб-приложение** — аккаунт только веб-приложения (без Telegram) не
  заходит CHURN_DAYS дней или его уведомления перестали доходить (подписка исчезла) и
  после этого он не заходил: напрямую удаление узнать нельзя;
- **вернулся** — после перерыва больше CHURN_DAYS дней снова открыл приложение.
"""

from __future__ import annotations

from bisect import bisect_left, bisect_right
from collections import defaultdict
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from backend.clock import local_day
from backend.constants import (
    ACTIVATION_WINDOW_MAX_DAYS,
    CHURN_DAYS,
    DEFAULT_ACTIVATION_MIN_DAYS,
    DEFAULT_ACTIVATION_WINDOW_DAYS,
    LIVE_MIN_DAYS,
    LIVE_WINDOW_DAYS,
)
from backend.models import FrequencyType
from backend.repository import Repository
from backend.schedule import due_check
from backend.services import compute_streaks, resolve_timezone
from backend.sources import source_name

# Ключи настроек панели (app_config).
CONFIG_WINDOW = "activation_window_days"
CONFIG_MIN_DAYS = "activation_min_days"
CONFIG_TRACKING_SINCE = "tracking_since"


# --------------------------------------------------------------------------- #
#  Период
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Period:
    """Дни [start, end] по Алматы; start=None — всё время."""

    key: str
    start: date | None
    end: date

    def contains(self, day: date | None) -> bool:
        return day is not None and (self.start is None or day >= self.start) and day <= self.end

    def previous(self) -> Period | None:
        """Такой же период перед этим (для «изменения к прошлому»); у «всего времени» нет."""
        if self.start is None:
            return None
        length = (self.end - self.start).days + 1
        end = self.start - timedelta(days=1)
        return Period(self.key, end - timedelta(days=length - 1), end)

    def days(self, first: date) -> list[date]:
        """Дни периода по порядку (у «всего времени» — с `first`)."""
        start = self.start or first
        return [start + timedelta(days=offset) for offset in range((self.end - start).days + 1)]


def make_period(key: str, today: date) -> Period:
    """Период по ключу (constants.ANALYTICS_PERIODS)."""
    if key == "all":
        return Period(key, None, today)
    if key == "today":
        return Period(key, today, today)
    return Period(key, today - timedelta(days=int(key) - 1), today)


# --------------------------------------------------------------------------- #
#  Строки
# --------------------------------------------------------------------------- #


@dataclass
class UserRow:
    """Пользователь в аналитике."""

    id: int
    created: datetime
    created_day: date
    opened: datetime | None
    last_seen: datetime | None
    bot_blocked: datetime | None
    blocked: datetime | None
    first_checkin: datetime | None
    source: str
    tag: str | None
    platform: str
    device: str | None
    language: str
    timezone: str | None
    timezone_city: int | None
    theme: str
    mark_yesterday: bool
    checkin_reminder: bool
    install_offer_sent: datetime | None
    is_test: bool
    is_admin: bool

    @property
    def web_only(self) -> bool:
        """Аккаунт только веб-приложения (без Telegram)."""
        return self.id < 0

    @property
    def excluded(self) -> bool:
        """Не входит в статистику: администратор или тестовый аккаунт."""
        return self.is_test or self.is_admin


@dataclass
class TaskRow:
    """Привычка (и удалённая) — поля расписания совпадают с Task (для schedule.py)."""

    id: int
    user_id: int
    name: str
    frequency_type: FrequencyType
    days: str | None
    start_date: date | None
    reminder_time: time | None
    created: datetime
    is_active: bool
    deleted: datetime | None


@dataclass(frozen=True)
class Config:
    """Пороги активации и момент, с которого собираются новые данные (None — с начала)."""

    window_days: int
    min_days: int
    tracking_since: datetime | None


async def load_config(repo: Repository) -> Config:
    """Настройки панели с проверкой границ (значения по умолчанию — constants.py)."""
    values = await repo.get_config()

    def number(key: str, default: int, low: int, high: int) -> int:
        try:
            return min(high, max(low, int(values.get(key, default))))
        except ValueError:
            return default

    window = number(CONFIG_WINDOW, DEFAULT_ACTIVATION_WINDOW_DAYS, 1, ACTIVATION_WINDOW_MAX_DAYS)
    since_raw = values.get(CONFIG_TRACKING_SINCE)
    try:
        since = datetime.fromisoformat(since_raw) if since_raw else None
    except ValueError:
        since = None
    return Config(
        window_days=window,
        min_days=number(CONFIG_MIN_DAYS, DEFAULT_ACTIVATION_MIN_DAYS, 1, window),
        tracking_since=since,
    )


# --------------------------------------------------------------------------- #
#  Набор данных
# --------------------------------------------------------------------------- #


@dataclass
class Dataset:
    """Пользователи (под фильтром платформы и источника, без исключённых), их дни
    активности и отметок, привычки. Определения терминов — методы."""

    now: datetime
    today: date
    config: Config
    users: dict[int, UserRow]
    activity: dict[int, list[date]]
    checkins: dict[int, list[date]]
    tasks: list[TaskRow]
    push_users: set[int]
    sources: list[str] = field(default_factory=list)
    _activation: dict[int, date | None] = field(default_factory=dict)
    _streaks: dict[int, tuple[int, int]] | None = None
    _gone_push: dict[int, datetime] | None = None

    # --- Выборки ---

    def tasks_of(self) -> dict[int, list[TaskRow]]:
        """Привычки по пользователям."""
        grouped: dict[int, list[TaskRow]] = defaultdict(list)
        for task in self.tasks:
            grouped[task.user_id].append(task)
        return grouped

    def new_in(self, period: Period) -> list[UserRow]:
        """Пришедшие за период."""
        return [user for user in self.users.values() if period.contains(user.created_day)]

    # --- Активация ---

    def activation_day(self, user_id: int) -> date | None:
        """День, когда пользователь стал активирован (M-й день с отметкой в первые N
        дней); не активирован — None."""
        if user_id not in self._activation:
            user = self.users[user_id]
            last = user.created_day + timedelta(days=self.config.window_days - 1)
            days = [day for day in self.checkins.get(user_id, ()) if user.created_day <= day <= last]
            self._activation[user_id] = (
                days[self.config.min_days - 1] if len(days) >= self.config.min_days else None
            )
        return self._activation[user_id]

    def window_closed(self, user: UserRow) -> bool:
        """Окно активации пользователя закончилось (последний его день уже прошёл)."""
        return user.created_day + timedelta(days=self.config.window_days - 1) < self.today

    def activation_known(self, user: UserRow) -> bool:
        """Уже понятно, активирован ли он: активирован или окно закончилось."""
        return self.activation_day(user.id) is not None or self.window_closed(user)

    # --- Живые ---

    def is_live(self, user_id: int, end: date | None = None) -> bool:
        """Отмечал привычки хотя бы LIVE_MIN_DAYS разных дней за LIVE_WINDOW_DAYS дней,
        кончая днём `end` (по умолчанию — сегодня)."""
        last = end or self.today
        days = self.checkins.get(user_id)
        if not days:
            return False
        first = last - timedelta(days=LIVE_WINDOW_DAYS - 1)
        return bisect_right(days, last) - bisect_left(days, first) >= LIVE_MIN_DAYS

    def live_count(self, end: date | None = None) -> int:
        return sum(1 for user_id in self.users if self.is_live(user_id, end))

    # --- Активность ---

    def last_active_day(self, user: UserRow) -> date | None:
        """Последний день, когда пользователь открывал приложение."""
        days = self.activity.get(user.id)
        candidates = [day for day in (days[-1] if days else None,) if day is not None]
        if user.last_seen is not None:
            candidates.append(local_day(user.last_seen))
        return max(candidates) if candidates else None

    def was_active_on(self, user_id: int, day: date) -> bool:
        days = self.activity.get(user_id)
        if not days:
            return False
        index = bisect_left(days, day)
        return index < len(days) and days[index] == day

    def checked_on(self, user_id: int, day: date) -> bool:
        days = self.checkins.get(user_id)
        if not days:
            return False
        index = bisect_left(days, day)
        return index < len(days) and days[index] == day

    def inactive_days(self, user: UserRow) -> int | None:
        """Сколько полных дней не открывал приложение (не открывал никогда — None)."""
        last = self.last_active_day(user)
        return None if last is None else (self.today - last).days

    def set_push_gone(self, gone: dict[int, datetime]) -> None:
        """Последнее «уведомление перестало доходить» по пользователям (push_gone)."""
        self._gone_push = gone

    # --- Статус ---

    def likely_uninstalled(self, user: UserRow) -> bool:
        """Вероятно удалил веб-приложение (см. описание модуля)."""
        if not user.web_only:
            return False
        inactive = self.inactive_days(user)
        if inactive is not None and inactive >= CHURN_DAYS:
            return True
        gone = (self._gone_push or {}).get(user.id)
        return (
            gone is not None
            and user.id not in self.push_users
            and (user.last_seen is None or user.last_seen <= gone)
        )

    def is_churned(self, user: UserRow) -> bool:
        """Ушёл: открывал приложение, не заходит CHURN_DAYS дней, бота не блокировал (и
        это не «вероятно удалил веб-приложение»)."""
        if user.opened is None or user.bot_blocked is not None or self.likely_uninstalled(user):
            return False
        inactive = self.inactive_days(user)
        return inactive is not None and inactive >= CHURN_DAYS

    def status(self, user: UserRow) -> str:
        """Статус: bot_blocked, uninstalled, churned, not_opened, active."""
        if user.bot_blocked is not None:
            return "bot_blocked"
        if self.likely_uninstalled(user):
            return "uninstalled"
        if self.is_churned(user):
            return "churned"
        if user.opened is None:
            return "not_opened"
        return "active"

    def gone_day(self, user: UserRow) -> date | None:
        """День, когда пользователь «ушёл» (последний визит + CHURN_DAYS) — для «ушли за
        период»; не ушёл — None."""
        last = self.last_active_day(user)
        if last is None:
            return None
        return last + timedelta(days=CHURN_DAYS)

    def returns(self, user_id: int) -> list[date]:
        """Дни возвращения: открыл приложение после перерыва больше CHURN_DAYS дней."""
        days = self.activity.get(user_id, [])
        return [
            later for earlier, later in zip(days, days[1:]) if (later - earlier).days > CHURN_DAYS
        ]

    # --- Серии ---

    async def load_streaks(self, repo: Repository) -> dict[int, tuple[int, int]]:
        """Текущая и лучшая серии пользователя — наибольшие среди его активных привычек
        (как их видит он сам: «сегодня» — в его поясе). Отметки выполнения читаются
        только здесь."""
        if self._streaks is not None:
            return self._streaks
        active = [task for task in self.tasks if task.is_active]
        done: dict[int, set[date]] = defaultdict(set)
        if active:
            for task_id, _user, day, _marked in await repo.done_logs(
                user_ids={task.user_id for task in active}
            ):
                done[task_id].add(day)
        result: dict[int, tuple[int, int]] = {}
        for task in active:
            user = self.users.get(task.user_id)
            if user is None:
                continue
            today = user_today(user)
            dates = {day for day in done.get(task.id, ()) if day <= today}
            current, best = compute_streaks(task, dates, today)  # type: ignore[arg-type]
            previous = result.get(user.id, (0, 0))
            result[user.id] = (max(previous[0], current), max(previous[1], best))
        self._streaks = result
        return result


def user_today(user: UserRow) -> date:
    """День отметки пользователя — как services.user_today."""
    today = datetime.now(resolve_timezone(user.timezone)).date()
    return today - timedelta(days=1) if user.mark_yesterday else today


def _group_days(pairs: Iterable[tuple[int, date]], keep: Callable[[int], bool]) -> dict[int, list[date]]:
    grouped: dict[int, list[date]] = defaultdict(list)
    for user_id, day in pairs:
        if keep(user_id):
            grouped[user_id].append(day)
    for days in grouped.values():
        days.sort()
    return grouped


async def load_dataset(
    repo: Repository,
    now: datetime,
    *,
    platform: str | None = None,
    source: str | None = None,
    include_excluded: bool = False,
) -> Dataset:
    """Набор данных аналитики. `platform` (telegram / web) и `source` (точное имя
    источника, «direct» — без метки) — фильтр сверху экрана; `include_excluded` — вместе
    с администраторами и тестовыми аккаунтами (для фильтров рассылки)."""
    config = await load_config(repo)
    every: dict[int, UserRow] = {}
    for row in await repo.analytics_users():
        user = UserRow(
            id=row.telegram_id,
            created=row.created_at,
            created_day=local_day(row.created_at),
            opened=row.app_opened_at,
            last_seen=row.last_seen_at,
            bot_blocked=row.bot_blocked_at,
            blocked=row.blocked_at,
            first_checkin=row.first_checkin_at,
            source=source_name(row.source),
            tag=row.source_tag,
            platform=row.signup_platform or ("web" if row.telegram_id < 0 else "telegram"),
            device=row.device,
            language=row.language,
            timezone=row.timezone,
            timezone_city=row.timezone_city,
            theme=row.theme,
            mark_yesterday=bool(row.mark_yesterday),
            checkin_reminder=row.checkin_reminder_time is not None,
            install_offer_sent=row.install_offer_sent_at,
            is_test=bool(row.is_test),
            is_admin=bool(row.is_admin),
        )
        if include_excluded or not user.excluded:
            every[user.id] = user
    sources = sorted({user.source for user in every.values()})
    users = {
        user_id: user
        for user_id, user in every.items()
        if (platform is None or user.platform == platform)
        and (source is None or user.source == source)
    }
    keep = users.__contains__
    tasks = [
        TaskRow(
            id=row.id,
            user_id=row.user_id,
            name=row.name,
            frequency_type=row.frequency_type,
            days=row.days,
            start_date=row.start_date,
            reminder_time=row.reminder_time,
            created=row.created_at,
            is_active=bool(row.is_active),
            deleted=row.deleted_at,
        )
        for row in await repo.analytics_tasks()
        if keep(row.user_id)
    ]
    dataset = Dataset(
        now=now,
        today=local_day(now),
        config=config,
        users=users,
        activity=_group_days(await repo.activity_pairs(), keep),
        checkins=_group_days(await repo.checkin_pairs(), keep),
        tasks=tasks,
        push_users=await repo.push_user_ids(),
        sources=sources,
    )
    dataset.set_push_gone(
        {user_id: moment for user_id, _, _, _, moment in await repo.actions(["push_gone"])}
    )
    return dataset


def ratio(part: int, whole: int) -> float | None:
    """Доля с тремя знаками; None — делить не на что."""
    return round(part / whole, 3) if whole else None


def median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[middle]
    return (ordered[middle - 1] + ordered[middle]) / 2


def due_on(task: TaskRow) -> Callable[[date], bool]:
    """Запланирована ли привычка на день (schedule.due_check по полям TaskRow)."""
    return due_check(task)  # type: ignore[arg-type]
