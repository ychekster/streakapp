"""Тестовые данные для аналитики админ-панели — только для локальной базы.

Добавляет несколько сотен правдоподобных пользователей за последние ~4 месяца: разные
источники (Threads с номерами постов, Instagram, друзья, напрямую, TikTok), Telegram и
веб-приложение, iPhone и Android, и разные судьбы — кто-то только нажал /start, кто-то
добавил привычку и бросил, кто-то держит серию месяцами, кто-то ушёл и вернулся, кто-то
заблокировал бота. Плюс напоминания, рассылки, события страницы установки, удалённые
привычки — всё, что показывает панель.

У тестовых пользователей свои диапазоны id (Telegram — от 7·10¹², веб — от −7·10¹²,
по миллиону; настоящие id туда не попадают), поэтому их легко убрать: `--remove`. На
сервере скрипт не запускается: адрес приложения в .env должен быть локальным (туннель
*.trycloudflare.com или localhost). Сообщения им бот отправить не сможет (таких чатов
нет) — для проверки панели это не мешает.

    venv/Scripts/python.exe scripts/backup_db.py            # сначала копия базы
    venv/Scripts/python.exe scripts/seed_analytics.py       # добавить (400 человек)
    venv/Scripts/python.exe scripts/seed_analytics.py --users 600 --seed 7
    venv/Scripts/python.exe scripts/seed_analytics.py --remove

Повторный запуск сначала убирает прежних тестовых пользователей. Запускать из корня
репозитория (путь SQLite в DATABASE_URL относительный).
"""

from __future__ import annotations

import argparse
import asyncio
import random
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, or_  # noqa: E402

from backend.clock import local_day  # noqa: E402
from backend.config import is_local_stack, load_settings  # noqa: E402
from backend.database import Database  # noqa: E402
from backend.models import (  # noqa: E402
    ActivityLog,
    Broadcast,
    BroadcastStatus,
    CheckinDay,
    Event,
    FrequencyType,
    PushSubscription,
    Review,
    Task,
    TaskLog,
    TaskStatus,
    User,
    UserActivity,
    WebSession,
)
from backend.repository import utc_now  # noqa: E402

TELEGRAM_BASE = 7_000_000_000_000
WEB_BASE = -7_000_000_000_000
# Тестовые id — только BASE ± SPAN: удаление не выходит за этот диапазон, а настоящие
# гости веб-приложения получают id не дальше −10¹² (repository._WEB_ID_MAX).
SPAN = 1_000_000
DAYS = 120

FIRST_NAMES = (
    "Аня", "Дима", "Катя", "Саша", "Маша", "Олег", "Лена", "Ира", "Женя", "Никита", "Даша",
    "Артём", "Алина", "Максим", "Юля", "Вика", "Костя", "Полина", "Айгерим", "Арман",
    "Динара", "Тимур", "Мадина", "Ерлан", "Asel", "Kate", "Alex", "Sam", "Nina", "Leo",
)
HABITS = (
    "Читать 20 минут", "читать 📚", "Чтение", "Пить воду 💧", "Выпить 2 л воды", "Медитация",
    "Зарядка", "Тренировка", "Бег", "Прогулка 10к шагов", "Английский", "Английский 30 мин",
    "Дневник", "Без сахара", "Витамины", "Растяжка", "Йога", "Лечь до 23:00", "Подъём в 6:30",
    "Учёба", "Без соцсетей после 22", "Уборка 15 минут", "Холодный душ", "Уход за кожей",
    "Duolingo", "Read 10 pages", "Gym", "Планка 2 минуты", "Гитара", "Не курить",
)
# Источник → (доля прихода, «качество»: выше — чаще остаются).
SOURCES: dict[str | None, tuple[float, float]] = {
    "threads": (0.38, 1.0),
    None: (0.24, 1.15),
    "instagram": (0.15, 0.8),
    "friends": (0.13, 1.35),
    "tiktok": (0.10, 0.6),
}
THREAD_POSTS = ("post1", "post2", "post3", "post5", "post8", "post12")
TIMEZONES = (
    ("Asia/Almaty", 0.45), ("Europe/Moscow", 0.25), ("Asia/Tashkent", 0.1),
    ("Europe/Berlin", 0.05), ("Asia/Bishkek", 0.05), ("Europe/Kyiv", 0.05), (None, 0.05),
)
OPEN_ORIGINS = (("menu", 0.55), ("welcome", 0.1), ("link", 0.08), ("reminder", 0.02))


def pick(rng: random.Random, weighted) -> object:
    items = list(weighted)
    return rng.choices([item[0] for item in items], [item[1] for item in items])[0]


@dataclass
class Plan:
    """Судьба одного человека."""

    kind: str
    lifetime: int  # сколько дней он с нами
    daily: float  # вероятность отметиться в день, пока он с нами
    gap: tuple[int, int] | None = None  # перерыв (с какого дня, сколько) — потом вернулся
    blocks: bool = False
    reminders: bool = False
    habits: int = 1


def plan_for(rng: random.Random, quality: float, platform: str) -> Plan:
    roll = rng.random() / quality
    if platform == "telegram" and roll < 0.13:
        return Plan("start_only", 0, 0, blocks=rng.random() < 0.15)
    if roll < 0.27:
        return Plan("no_habit", rng.randint(0, 2), 0, blocks=rng.random() < 0.2)
    if roll < 0.37:
        return Plan("no_checkin", rng.randint(0, 3), 0, blocks=rng.random() < 0.2)
    if roll < 0.62:
        return Plan(
            "tried", rng.randint(1, 9), rng.uniform(0.35, 0.7), habits=rng.randint(1, 3),
            blocks=rng.random() < 0.25, reminders=rng.random() < 0.25,
        )
    reminders = rng.random() < 0.6
    plan = Plan(
        "regular",
        rng.randint(14, DAYS) if rng.random() < 0.55 else DAYS * 2,
        min(0.97, rng.uniform(0.6, 0.92) + (0.05 if reminders else 0)),
        habits=rng.randint(1, 6),
        reminders=reminders,
        blocks=rng.random() < 0.05,
    )
    if rng.random() < 0.18:
        plan.gap = (rng.randint(5, 30), rng.randint(16, 30))
    return plan


@dataclass
class Batch:
    """Всё, что добавит скрипт (без повторов дней)."""

    users: list[User] = field(default_factory=list)
    rows: list[object] = field(default_factory=list)
    activity: set[tuple[int, date]] = field(default_factory=set)
    checkins: set[tuple[int, date]] = field(default_factory=set)
    tasks: list[Task] = field(default_factory=list)
    marks: dict[tuple[int, date], tuple[Task, datetime]] = field(default_factory=dict)
    # Напоминания о привычке: (привычка, канал, когда).
    reminders: list[tuple[Task, str, datetime]] = field(default_factory=list)
    telegram: list[tuple[int, datetime]] = field(default_factory=list)

    def log(self, user_id: int, kind: str, at: datetime, *, detail: str | None = None, ref: int | None = None) -> None:
        self.rows.append(ActivityLog(user_id=user_id, kind=kind, detail=detail, ref_id=ref, created_at=at))


async def remove(database: Database) -> None:
    def seeded(column):  # noqa: ANN001, ANN202
        return or_(
            column.between(TELEGRAM_BASE, TELEGRAM_BASE + SPAN - 1),
            column.between(WEB_BASE - SPAN + 1, WEB_BASE),
        )

    async with database.session_factory() as session:
        for model in (
            TaskLog, Task, Review, UserActivity, CheckinDay, ActivityLog, WebSession,
            PushSubscription, Event,
        ):
            await session.execute(delete(model).where(seeded(model.user_id)))
        await session.execute(delete(Event).where(Event.anon_id.like("seed-%")))
        await session.execute(delete(Broadcast).where(Broadcast.text.like("[seed]%")))
        await session.execute(delete(User).where(seeded(User.telegram_id)))
        await session.commit()


def add_person(rng: random.Random, batch: Batch, number: int, now: datetime) -> str:
    """Один человек со всей его историей; возвращает платформу."""
    days_ago = int(DAYS * (rng.random() ** 1.6))  # больше новых в последние недели
    joined = now - timedelta(days=days_ago, hours=rng.uniform(0, 23), minutes=rng.uniform(0, 59))
    source = pick(rng, ((name, weight) for name, (weight, _) in SOURCES.items()))
    quality = SOURCES[source][1]  # type: ignore[index]
    tag = rng.choice(THREAD_POSTS) if source == "threads" and rng.random() < 0.8 else None
    if tag == "post12":
        quality *= 1.3  # пост, который приводит «правильных» людей
    platform = "web" if rng.random() < 0.3 else "telegram"
    user_id = TELEGRAM_BASE + number if platform == "telegram" else WEB_BASE - number
    device = pick(rng, (("ios", 0.6), ("android", 0.35), ("desktop", 0.05)))
    if platform == "web" and device == "desktop":
        device = "ios"
    plan = plan_for(rng, quality, platform)
    opened = None if plan.kind == "start_only" else joined + timedelta(minutes=rng.uniform(0.2, 40))
    if platform == "web":
        opened = joined

    # Дни в приложении и дни с отметками (смещения от дня прихода).
    active: list[int] = []
    checked: list[int] = []
    if opened is not None:
        for offset in range(0, min(plan.lifetime, days_ago) + 1):
            if plan.gap and plan.gap[0] <= offset < plan.gap[0] + plan.gap[1]:
                continue
            if plan.kind in ("no_habit", "no_checkin"):
                active.append(offset)
            elif offset == 0 or rng.random() < plan.daily * 0.985 ** offset:
                checked.append(offset)
                active.append(offset)
            elif rng.random() < 0.3:
                active.append(offset)
        if not active:
            active = [0]
    last_seen = None
    if opened is not None:
        last_seen = min(now - timedelta(minutes=rng.uniform(1, 300)), joined + timedelta(days=active[-1], hours=rng.uniform(0, 6)))
    blocked_at = None
    if plan.blocks and platform == "telegram":
        blocked_at = joined + timedelta(days=(active[-1] if active else 0) + rng.uniform(0.2, 6))
        blocked_at = blocked_at if blocked_at < now else None

    user = User(
        telegram_id=user_id,
        first_name=rng.choice(FIRST_NAMES),
        language="en" if rng.random() < 0.08 else "ru",
        timezone=pick(rng, TIMEZONES),
        theme="dark" if rng.random() < 0.3 else "system",
        mark_yesterday=rng.random() < 0.07,
        checkin_reminder_time=time(21, 0) if plan.reminders and rng.random() < 0.4 else None,
        checkin_reminder_days="mon,tue,wed,thu,fri,sat,sun",
        app_opened_at=opened,
        last_seen_at=last_seen,
        bot_blocked_at=blocked_at,
        source=source,
        source_tag=tag,
        signup_platform=platform,
        device=device,
        created_at=joined,
    )
    batch.users.append(user)

    if platform == "telegram":
        batch.telegram.append((user_id, joined))
        label = f"src_{source}_{tag}" if source and tag else (f"src_{source}" if source else None)
        batch.log(user_id, "start", joined, detail=label)
    else:
        anon = f"seed-{user_id}"
        src = f"{source}_{tag}" if source and tag else (source or "direct")
        for event, minutes in (("landing_view", -9), ("install_screen_view", -6), ("first_standalone_launch", 0)):
            batch.rows.append(
                Event(
                    event=event, anon_id=anon, user_id=user_id if minutes == 0 else None,
                    platform=device, browser_context="standalone" if minutes == 0 else "browser",
                    src=src, created_at=joined + timedelta(minutes=minutes),
                )
            )
        batch.rows.append(
            WebSession(
                token_hash=f"seed{user_id}", user_id=user_id, user_agent=device, created_at=joined,
                last_used_at=last_seen or joined, expires_at=now + timedelta(days=90),
            )
        )
        if plan.kind in ("regular", "tried") and rng.random() < 0.7:
            batch.rows.append(
                PushSubscription(
                    user_id=user_id, endpoint=f"https://push.seed/{user_id}", p256dh="x", auth="x",
                    created_at=joined + timedelta(minutes=5),
                )
            )
            batch.log(user_id, "push_on", joined + timedelta(minutes=5))

    for offset in active:
        moment = min(joined + timedelta(days=offset), now)
        if (user_id, local_day(moment)) in batch.activity:
            continue
        batch.activity.add((user_id, local_day(moment)))
        weights = [(name, weight * (15 if name == "reminder" and plan.reminders else 1)) for name, weight in OPEN_ORIGINS]
        origin = "icon" if platform == "web" else pick(rng, weights)
        if platform == "web" and plan.reminders and rng.random() < 0.3:
            origin = "push"
        batch.log(user_id, "app_open", moment, detail=str(origin))
    if blocked_at is not None:
        batch.log(user_id, "bot_blocked", blocked_at)
    if rng.random() < 0.04 and opened is not None:
        text = rng.choice(("Классное приложение!", "Добавьте статистику по неделям", "Не приходят напоминания"))
        batch.rows.append(Review(user_id=user_id, text=text, created_at=opened + timedelta(days=1)))
    if plan.kind in ("start_only", "no_habit") or opened is None:
        return platform

    tasks: list[Task] = []
    for index in range(plan.habits):
        created = min(now, opened + timedelta(minutes=rng.uniform(1, 30) + index * rng.uniform(0, 3000)))
        frequency = pick(
            rng,
            ((FrequencyType.daily, 0.75), (FrequencyType.specific_days, 0.18), (FrequencyType.every_other_day, 0.07)),
        )
        task = Task(
            user_id=user_id,
            name=rng.choice(HABITS) + ("" if index == 0 else f" {index + 1}"),
            frequency_type=frequency,
            days="mon,wed,fri" if frequency == FrequencyType.specific_days else None,
            start_date=local_day(created) if frequency == FrequencyType.every_other_day else None,
            reminder_time=(
                time(rng.choice((7, 8, 9, 12, 19, 20, 21, 22)), rng.choice((0, 30)))
                if plan.reminders and rng.random() < 0.8
                else None
            ),
            color=rng.choice(("blue", "green", "orange", "purple", "teal")),
            is_active=True,
            created_at=created,
        )
        if rng.random() < 0.18:  # удаляют — чаще в первую неделю
            deleted = created + timedelta(days=rng.choice((0, 1, 2, 3, 5, 6, 12, 25)), hours=rng.uniform(0, 10))
            if deleted < now:
                task.is_active, task.deleted_at = False, deleted
        tasks.append(task)
    batch.tasks.extend(tasks)
    if plan.kind == "no_checkin":
        return platform

    hour = rng.choice((8, 9, 13, 20, 21, 22))  # отмечает обычно в это время (по своему поясу)
    for offset in checked:
        moment = joined + timedelta(days=offset)
        marked = min(now, max(joined, datetime.combine(moment.date(), time(0)) + timedelta(hours=hour - 5 + rng.uniform(-2, 2))))
        day = local_day(marked)
        batch.checkins.add((user_id, day))
        if user.first_checkin_at is None:
            user.first_checkin_at = marked
            if platform == "telegram" and rng.random() < 0.9:
                # Бот предлагает установить веб-приложение после первой отметки.
                offered = marked + timedelta(minutes=1)
                user.install_offer_sent_at = offered
                batch.log(user_id, "install_offer_sent", offered)
                if rng.random() < 0.3:
                    batch.log(user_id, "app_open", offered + timedelta(minutes=2), detail="install_offer")
                    if rng.random() < 0.45:
                        batch.rows.append(
                            WebSession(
                                token_hash=f"seed-install{user_id}", user_id=user_id, user_agent=device,
                                created_at=offered + timedelta(minutes=6), last_used_at=offered + timedelta(minutes=6),
                                expires_at=now + timedelta(days=90),
                            )
                        )
        for task in tasks:
            alive = task.created_at <= marked and (task.deleted_at is None or marked < task.deleted_at)
            if alive and rng.random() < 0.85 and (id(task), day) not in batch.marks:
                batch.marks[(id(task), day)] = (task, marked)
                if task.reminder_time is not None:
                    channel = "push" if platform == "web" else "telegram"
                    batch.reminders.append((task, channel, marked - timedelta(minutes=rng.uniform(5, 90))))
    return platform


async def seed(database: Database, count: int, seed_value: int) -> None:
    rng = random.Random(seed_value)
    now = utc_now()
    batch = Batch()
    totals = {"telegram": 0, "web": 0}
    for number in range(1, count + 1):
        totals[add_person(rng, batch, number, now)] += 1

    async with database.session_factory() as session:
        session.add_all(batch.users)
        await session.flush()
        session.add_all(batch.tasks)
        session.add_all(batch.rows)
        session.add_all(UserActivity(user_id=user_id, day=day) for user_id, day in batch.activity)
        session.add_all(CheckinDay(user_id=user_id, day=day) for user_id, day in batch.checkins)
        await session.flush()  # у привычек появились id
        for task in batch.tasks:
            session.add(ActivityLog(user_id=task.user_id, kind="habit_created", ref_id=task.id, created_at=task.created_at))
            if task.deleted_at is not None:
                session.add(ActivityLog(user_id=task.user_id, kind="habit_deleted", ref_id=task.id, created_at=task.deleted_at))
        for (_, day), (task, marked) in batch.marks.items():
            session.add(
                TaskLog(
                    task_id=task.id, user_id=task.user_id, scheduled_date=day, status=TaskStatus.done,
                    marked_at=marked, created_at=marked,
                )
            )
            session.add(ActivityLog(user_id=task.user_id, kind="checkin", ref_id=task.id, created_at=marked))
        for task, channel, at in batch.reminders:
            session.add(ActivityLog(user_id=task.user_id, kind="reminder_sent", ref_id=task.id, detail=channel, created_at=at))

        # Рассылки: получатели — Telegram-пользователи, пришедшие до неё.
        for number, days_back in enumerate(sorted(rng.sample(range(5, 70), 3)), start=1):
            moment = now - timedelta(days=days_back, hours=rng.uniform(0, 4))
            recipients = [user_id for user_id, joined in batch.telegram if joined < moment]
            broadcast = Broadcast(
                created_by=0, audience="", button="open_app",
                text=f"[seed] Рассылка №{number}: возвращайтесь к привычкам",
                status=BroadcastStatus.done, total=len(recipients), sent=len(recipients), failed=0,
                created_at=moment, finished_at=moment + timedelta(minutes=10),
            )
            session.add(broadcast)
            await session.flush()
            for user_id in recipients:
                session.add(ActivityLog(user_id=user_id, kind="broadcast_sent", ref_id=broadcast.id, created_at=moment))
                roll = rng.random()
                if roll < 0.12:
                    opened_at = moment + timedelta(hours=rng.uniform(0.1, 20))
                    session.add(ActivityLog(user_id=user_id, kind="app_open", detail="broadcast", ref_id=broadcast.id, created_at=opened_at))
                    if (user_id, local_day(opened_at)) not in batch.activity:
                        batch.activity.add((user_id, local_day(opened_at)))
                        session.add(UserActivity(user_id=user_id, day=local_day(opened_at)))
                elif roll < 0.135:
                    blocked = moment + timedelta(hours=rng.uniform(0.1, 20))
                    user = await session.get(User, user_id)
                    if user is not None and user.bot_blocked_at is None:
                        user.bot_blocked_at = blocked
                        session.add(ActivityLog(user_id=user_id, kind="bot_blocked", created_at=blocked))

        # Посетители страницы установки, которые так и не установили приложение.
        for number in range(count):
            moment = now - timedelta(days=int(DAYS * (rng.random() ** 1.6)), hours=rng.uniform(0, 23))
            source = pick(rng, ((name, weight) for name, (weight, _) in SOURCES.items())) or "direct"
            anon = f"seed-visitor-{number}"
            session.add(Event(event="landing_view", anon_id=anon, platform="ios", browser_context="in_app", src=str(source), created_at=moment))
            if rng.random() < 0.35:
                session.add(Event(event="install_screen_view", anon_id=anon, platform="ios", browser_context="browser", src=str(source), created_at=moment + timedelta(minutes=2)))
        await session.commit()
    print(f"Добавлено {count} человек: Telegram — {totals['telegram']}, веб — {totals['web']}.")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Тестовые данные аналитики (локально)")
    parser.add_argument("--users", type=int, default=400, help="сколько человек (400)")
    parser.add_argument("--seed", type=int, default=42, help="зерно случайности")
    parser.add_argument("--remove", action="store_true", help="только убрать тестовых")
    args = parser.parse_args()
    if not 0 < args.users < SPAN:
        sys.exit(f"--users: от 1 до {SPAN - 1}")
    settings = load_settings()
    if not is_local_stack(settings):
        sys.exit(f"Адрес приложения {settings.web_base_url!r} — не локальный стек: скрипт только для локальной базы.")
    database = Database(settings.database_url)
    try:
        await remove(database)
        if args.remove:
            print("Тестовые пользователи убраны.")
        else:
            await seed(database, args.users, args.seed)
    finally:
        await database.dispose()


if __name__ == "__main__":
    asyncio.run(main())
