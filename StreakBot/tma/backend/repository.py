"""Репозиторий — единственная точка доступа к БД (Repository pattern).

Роутеры и сервисы не пишут SQL напрямую: вся работа с данными идёт через
методы этого класса. Каждый экземпляр привязан к одной async-сессии.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable, Iterator
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from itertools import islice
from typing import Any

from sqlalchemy import String, and_, case, cast, delete, func, or_, select, true, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from tma.backend.constants import (
    ACTIVE_NOW_MINUTES,
    DEFAULT_HABIT_COLOR,
    LAST_SEEN_RESOLUTION_SECONDS,
)
from tma.backend.models import (
    Admin,
    Broadcast,
    BroadcastStatus,
    FrequencyType,
    Review,
    Task,
    TaskLog,
    TaskStatus,
    User,
    UserActivity,
)


# Сколько значений передавать в одном `IN (...)`: у SQLite и драйверов PostgreSQL есть
# предел числа параметров запроса.
_IN_BATCH_SIZE = 500


def _batches(values: Iterable[int], size: int = _IN_BATCH_SIZE) -> Iterator[list[int]]:
    """Разбить значения на списки не длиннее `size`."""
    iterator = iter(values)
    while batch := list(islice(iterator, size)):
        yield batch


def utc_now() -> datetime:
    """Текущий момент в UTC без пояса — так в базе хранятся все отметки времени."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_date(value: Any) -> date:
    """Результат SQL `date(...)`: у PostgreSQL — дата, у SQLite — строка «ГГГГ-ММ-ДД»."""
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _like_pattern(text: str) -> str:
    """Шаблон LIKE «содержит `text`»: `%` и `_` в самом запросе — обычные символы."""
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _segment_condition(segment: str, moment: datetime) -> Any:
    """Условие на пользователя для сегмента рассылки (constants.BROADCAST_SEGMENTS).

    Новый сегмент (например, подписчики) — новая ветка здесь и ключ в константах.
    """
    if segment == "active_7d":
        return User.last_seen_at >= moment - timedelta(days=7)
    if segment == "active_30d":
        return User.last_seen_at >= moment - timedelta(days=30)
    if segment == "never_opened":
        return User.app_opened_at.is_(None)
    return true()  # "all"


def _recipient_condition(segment: str, moment: datetime, exclude_user_id: int | None) -> Any:
    """Получатели рассылки: пользователи сегмента, уже зарегистрированные к `moment`
    (пришедшие во время долгой рассылки её не получают — как и не посчитаны в ней), кроме
    заблокировавших бота (Telegram сообщает о разблокировке, поэтому отметка точна),
    заблокированных администратором и автора рассылки (ему копия уже пришла)."""
    condition = and_(
        _segment_condition(segment, moment),
        User.created_at <= moment,
        User.bot_blocked_at.is_(None),
        User.blocked_at.is_(None),
    )
    if exclude_user_id is not None:
        condition = and_(condition, User.telegram_id != exclude_user_id)
    return condition


@dataclass(frozen=True)
class UserCounts:
    """Счётчики пользователей для аналитики."""

    total: int
    new_week: int
    new_month: int
    opened_app: int
    never_opened: int
    blocked_bot: int
    blocked: int
    active_now: int
    # Не заблокировавшие бота — открывавшие приложение и не открывавшие (вместе с
    # blocked_bot делят всех пользователей без пересечений).
    reachable_opened: int
    reachable_never_opened: int


@dataclass(frozen=True)
class TaskSchedule:
    """Расписание активной привычки — всё, что нужно для доли выполнения по дням."""

    id: int
    created_on: date
    frequency_type: FrequencyType
    days: str | None


class Repository:
    """CRUD-методы для пользователей, привычек, отметок и данных админ-панели поверх
    одной сессии."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------ #
    #  Users
    # ------------------------------------------------------------------ #

    async def get_user(self, telegram_id: int) -> User | None:
        """Вернуть пользователя по telegram_id или None."""
        return await self.session.get(User, telegram_id)

    async def get_or_create_user(
        self,
        telegram_id: int,
        username: str | None,
        first_name: str | None,
        language: str,
    ) -> User:
        """Вернуть пользователя, создав его при первом обращении.

        @username и имя синхронизируются с Telegram (могут меняться между
        сессиями); если они не изменились, UPDATE не выполняется. `language` —
        язык интерфейса нового пользователя; у существующего он не меняется.

        Безопасно к гонке: приложение при открытии может отправить несколько
        запросов параллельно. Вставку оборачиваем в SAVEPOINT и при конфликте
        уникальности перечитываем запись, созданную параллельным запросом.
        """
        user = await self.get_user(telegram_id)
        if user is not None:
            user.username = username
            user.first_name = first_name
            await self.session.flush()
            return user
        try:
            async with self.session.begin_nested():
                user = User(
                    telegram_id=telegram_id,
                    username=username,
                    first_name=first_name,
                    language=language,
                )
                self.session.add(user)
                await self.session.flush()
            return user
        except IntegrityError:
            # Запись успели создать в параллельном запросе — перечитываем.
            user = await self.get_user(telegram_id)
            if user is None:  # крайне маловероятно
                raise
            return user

    async def update_settings(
        self,
        user: User,
        *,
        timezone: str | None = None,
        timezone_city: int | None = None,
        language: str | None = None,
        theme: str | None = None,
        mark_yesterday: bool | None = None,
    ) -> None:
        """Изменить настройки пользователя; None — оставить как есть. Город пояса
        меняется вместе с поясом (None у нового пояса — пояс без города)."""
        if timezone is not None:
            user.timezone = timezone
            user.timezone_city = timezone_city
        if language is not None:
            user.language = language
        if theme is not None:
            user.theme = theme
        if mark_yesterday is not None:
            user.mark_yesterday = mark_yesterday
        await self.session.flush()

    async def touch_user(self, user: User, now: datetime) -> None:
        """Отметить запрос пользователя к API: время последнего запроса, первое открытие
        приложения и день активности (для DAU/WAU/MAU).

        Пишет не чаще раза в LAST_SEEN_RESOLUTION_SECONDS (и в первый запрос нового
        дня): приложение при открытии делает несколько запросов, а каждый из них был бы
        ещё и записью в базу.
        """
        last = user.last_seen_at
        if (
            last is not None
            and last.date() == now.date()
            and now - last < timedelta(seconds=LAST_SEEN_RESOLUTION_SECONDS)
        ):
            return
        user.last_seen_at = now
        if user.app_opened_at is None:
            user.app_opened_at = now
        await self.session.flush()
        await self._record_activity(user.telegram_id, now.date())

    async def _record_activity(self, user_id: int, day: date) -> None:
        """Запись «пользователь был активен в этот день», если её ещё нет.

        Безопасно к гонке, как `get_or_create_user`: параллельные запросы одного
        пользователя вставляют запись в SAVEPOINT, и проигравший конфликт её не дублирует.
        """
        if await self.session.get(UserActivity, (user_id, day)) is not None:
            return
        try:
            async with self.session.begin_nested():
                self.session.add(UserActivity(user_id=user_id, day=day))
                await self.session.flush()
        except IntegrityError:
            pass  # запись уже вставил параллельный запрос

    async def set_bot_blocked(self, user_ids: Collection[int], blocked: bool) -> None:
        """Отметить, что пользователи заблокировали бота (или разблокировали его)."""
        for batch in _batches(user_ids):
            await self.session.execute(
                update(User)
                .where(User.telegram_id.in_(batch))
                .values(bot_blocked_at=utc_now() if blocked else None)
            )

    async def set_blocked(self, user: User, blocked: bool) -> None:
        """Заблокировать пользователя (или снять блокировку) по решению администратора."""
        user.blocked_at = utc_now() if blocked else None
        await self.session.flush()

    async def delete_user(self, telegram_id: int) -> None:
        """Удалить пользователя со всеми его данными: отметками, привычками, отзывами и
        днями активности. Порядок — от зависимых таблиц к `users` (PostgreSQL проверяет
        внешние ключи)."""
        for model in (TaskLog, Task, Review, UserActivity):
            await self.session.execute(delete(model).where(model.user_id == telegram_id))
        await self.session.execute(delete(User).where(User.telegram_id == telegram_id))

    # ------------------------------------------------------------------ #
    #  Tasks
    # ------------------------------------------------------------------ #

    async def create_task(
        self,
        user_id: int,
        name: str,
        frequency_type: FrequencyType,
        days: str | None = None,
        reminder_time: time | None = None,
        color: str = DEFAULT_HABIT_COLOR,
    ) -> Task:
        """Создать активную задачу."""
        task = Task(
            user_id=user_id,
            name=name,
            frequency_type=frequency_type,
            days=days,
            reminder_time=reminder_time,
            color=color,
            is_active=True,
        )
        self.session.add(task)
        await self.session.flush()
        return task

    async def update_task(
        self,
        task: Task,
        name: str,
        frequency_type: FrequencyType,
        days: str | None,
        reminder_time: time | None,
        color: str,
    ) -> None:
        """Заменить параметры задачи (всё, что задаётся в форме привычки)."""
        task.name = name
        task.frequency_type = frequency_type
        task.days = days
        task.reminder_time = reminder_time
        task.color = color
        await self.session.flush()

    async def task_name_exists(
        self, user_id: int, name: str, exclude_task_id: int | None = None
    ) -> bool:
        """Есть ли у пользователя активная задача с таким именем (без учёта регистра).

        `exclude_task_id` — задача, которую не учитывать (при переименовании сама себе
        не дубликат). Сравнение делается в Python: так оно не зависит от того, как СУБД
        понимает регистр (встроенная `lower()` SQLite знает только латиницу).
        """
        target = name.strip().lower()
        query = select(Task.name).where(Task.user_id == user_id, Task.is_active.is_(True))
        if exclude_task_id is not None:
            query = query.where(Task.id != exclude_task_id)
        result = await self.session.execute(query)
        return any((task_name or "").strip().lower() == target for task_name in result.scalars())

    async def count_active_tasks(self, user_id: int) -> int:
        """Сколько активных задач у пользователя."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Task)
            .where(Task.user_id == user_id, Task.is_active.is_(True))
        )
        return result.scalar_one()

    async def get_active_task(self, task_id: int, user_id: int) -> Task | None:
        """Вернуть активную задачу пользователя по id или None."""
        result = await self.session.execute(
            select(Task).where(
                Task.id == task_id,
                Task.user_id == user_id,
                Task.is_active.is_(True),
            )
        )
        return result.scalar_one_or_none()

    async def soft_delete_task(self, task: Task) -> None:
        """Мягкое удаление: пометить задачу неактивной.

        Логи остаются в базе, но неактивная задача нигде не показывается, а её
        название снова свободно для новой привычки.
        """
        task.is_active = False
        await self.session.flush()

    async def get_active_tasks(self, user_id: int) -> list[Task]:
        """Вернуть все активные задачи пользователя, отсортированные по id."""
        result = await self.session.execute(
            select(Task)
            .where(Task.user_id == user_id, Task.is_active.is_(True))
            .order_by(Task.id)
        )
        return list(result.scalars().all())

    async def get_active_tasks_with_reminder_at(self, times: Collection[time]) -> list[Task]:
        """Активные задачи всех пользователей с напоминанием в одно из `times` — вместе с
        владельцем (его пояс нужен, чтобы понять, наступило ли время напоминания)."""
        if not times:
            return []
        result = await self.session.execute(
            select(Task)
            .where(Task.is_active.is_(True), Task.reminder_time.in_(sorted(times)))
            .options(selectinload(Task.user))
            .order_by(Task.id)
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  TaskLogs
    # ------------------------------------------------------------------ #

    async def get_log(self, task_id: int, scheduled_date: date) -> TaskLog | None:
        """Вернуть запись лога задачи на дату или None."""
        result = await self.session.execute(
            select(TaskLog).where(
                TaskLog.task_id == task_id,
                TaskLog.scheduled_date == scheduled_date,
            )
        )
        return result.scalar_one_or_none()

    async def get_or_create_log(
        self,
        task_id: int,
        user_id: int,
        scheduled_date: date,
    ) -> TaskLog:
        """Вернуть лог на дату, создав его со статусом pending при отсутствии."""
        log = await self.get_log(task_id, scheduled_date)
        if log is not None:
            return log
        log = TaskLog(
            task_id=task_id,
            user_id=user_id,
            scheduled_date=scheduled_date,
            status=TaskStatus.pending,
        )
        self.session.add(log)
        await self.session.flush()
        return log

    async def set_log_status(self, log: TaskLog, status: TaskStatus) -> None:
        """Установить статус лога и зафиксировать момент отметки (UTC, как и остальные
        отметки времени в базе — без пояса)."""
        log.status = status
        log.marked_at = utc_now()
        await self.session.flush()

    async def get_done_dates(
        self, task_ids: Collection[int], until: date
    ) -> dict[int, set[date]]:
        """Даты выполнения (статус done) задач по `until` включительно: id задачи → даты.

        Один запрос на все задачи и только две колонки — без ORM-объектов логов: у
        привычки за годы накапливаются тысячи отметок, и список привычек не должен
        собирать их по запросу на каждую.
        """
        done: dict[int, set[date]] = {task_id: set() for task_id in task_ids}
        for batch in _batches(done):
            result = await self.session.execute(
                select(TaskLog.task_id, TaskLog.scheduled_date).where(
                    TaskLog.task_id.in_(batch),
                    TaskLog.status == TaskStatus.done,
                    TaskLog.scheduled_date <= until,
                )
            )
            for task_id, day in result.tuples():
                done[task_id].add(day)
        return done

    async def get_done_task_days(
        self, task_days: Collection[tuple[int, date]]
    ) -> set[tuple[int, date]]:
        """Какие из пар (id задачи, дата) отмечены выполненными — одним запросом на пачку."""
        days = {day for _, day in task_days}
        done: set[tuple[int, date]] = set()
        for batch in _batches({task_id for task_id, _ in task_days}):
            result = await self.session.execute(
                select(TaskLog.task_id, TaskLog.scheduled_date).where(
                    TaskLog.task_id.in_(batch),
                    TaskLog.scheduled_date.in_(sorted(days)),
                    TaskLog.status == TaskStatus.done,
                )
            )
            done.update((task_id, day) for task_id, day in result.tuples())
        return done & set(task_days)

    # ------------------------------------------------------------------ #
    #  Admins
    # ------------------------------------------------------------------ #

    async def is_admin(self, telegram_id: int) -> bool:
        """Есть ли пользователь в списке администраторов."""
        return await self.session.get(Admin, telegram_id) is not None

    async def list_admins(self) -> list[tuple[Admin, User | None]]:
        """Администраторы в порядке добавления — с записью пользователя, если он уже
        открывал приложение или запускал бота (оттуда имя)."""
        result = await self.session.execute(
            select(Admin, User)
            .outerjoin(User, User.telegram_id == Admin.telegram_id)
            .order_by(Admin.created_at, Admin.telegram_id)
        )
        return [(admin, user) for admin, user in result.tuples()]

    async def add_admin(self, telegram_id: int, added_by: int | None) -> Admin:
        """Добавить администратора (вызывающий проверяет, что его ещё нет)."""
        admin = Admin(telegram_id=telegram_id, added_by=added_by)
        self.session.add(admin)
        await self.session.flush()
        return admin

    async def remove_admin(self, telegram_id: int) -> bool:
        """Убрать администратора; False — его и не было."""
        result = await self.session.execute(delete(Admin).where(Admin.telegram_id == telegram_id))
        return result.rowcount > 0

    async def seed_admins(self, telegram_ids: Iterable[int]) -> None:
        """Добавить первых администраторов, если список пуст (новая база)."""
        if await self.session.scalar(select(func.count()).select_from(Admin)):
            return
        for telegram_id in telegram_ids:
            self.session.add(Admin(telegram_id=telegram_id))
        await self.session.flush()

    # ------------------------------------------------------------------ #
    #  Reviews
    # ------------------------------------------------------------------ #

    async def create_review(self, user_id: int, text: str) -> Review:
        """Сохранить отзыв пользователя."""
        review = Review(user_id=user_id, text=text)
        self.session.add(review)
        await self.session.flush()
        await self.session.refresh(review, ["created_at"])
        return review

    async def count_reviews_since(self, user_id: int, since: datetime) -> int:
        """Сколько отзывов пользователь оставил начиная с `since`."""
        return await self.session.scalar(
            select(func.count())
            .select_from(Review)
            .where(Review.user_id == user_id, Review.created_at >= since)
        ) or 0

    async def list_reviews(self, before_id: int | None, limit: int) -> list[Review]:
        """Отзывы всех пользователей, новые сначала, — вместе с автором. `before_id` —
        курсор страницы: id последнего отзыва предыдущей."""
        query = select(Review).options(selectinload(Review.user)).order_by(Review.id.desc())
        if before_id is not None:
            query = query.where(Review.id < before_id)
        result = await self.session.execute(query.limit(limit))
        return list(result.scalars().all())

    async def get_review(self, review_id: int) -> Review | None:
        """Отзыв по id — вместе с автором."""
        result = await self.session.execute(
            select(Review).options(selectinload(Review.user)).where(Review.id == review_id)
        )
        return result.scalar_one_or_none()

    async def user_reviews(self, user_id: int) -> list[Review]:
        """Отзывы пользователя, новые сначала."""
        result = await self.session.execute(
            select(Review).where(Review.user_id == user_id).order_by(Review.id.desc())
        )
        return list(result.scalars().all())

    async def set_review_reply(self, review: Review, text: str, admin_id: int) -> None:
        """Запомнить ответ администратора на отзыв (последний ответ заменяет прежний)."""
        review.reply_text = text
        review.replied_at = utc_now()
        review.replied_by = admin_id
        await self.session.flush()

    # ------------------------------------------------------------------ #
    #  Users in the admin panel
    # ------------------------------------------------------------------ #

    async def search_users(self, query: str | None, offset: int, limit: int) -> list[User]:
        """Пользователи для админ-панели, новые сначала: страница `limit` с `offset`.

        Запрос ищет по имени и @username без учёта регистра (в том числе кириллицы —
        см. database.py), а цифры — ещё и по началу id Telegram. Страницы — по смещению,
        а не по курсору: у `created_at` из разных источников разный формат в SQLite, и
        сравнение «после такой-то записи» ненадёжно.
        """
        statement = select(User).order_by(User.created_at.desc(), User.telegram_id.desc())
        text = (query or "").strip().lstrip("@")
        if text:
            pattern = _like_pattern(text)
            conditions = [
                User.first_name.ilike(pattern, escape="\\"),
                User.username.ilike(pattern, escape="\\"),
            ]
            if text.isdigit():
                conditions.append(cast(User.telegram_id, String).like(f"{text}%"))
            statement = statement.where(or_(*conditions))
        result = await self.session.execute(statement.offset(offset).limit(limit))
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  Analytics
    # ------------------------------------------------------------------ #

    async def user_counts(self, now: datetime) -> UserCounts:
        """Счётчики пользователей одним запросом: всего, новые за 7 и 30 дней, открывшие
        и не открывшие приложение, заблокировавшие бота, заблокированные администратором,
        активные прямо сейчас и деление всех без пересечений (см. UserCounts)."""

        def count_where(condition: Any) -> Any:
            return func.coalesce(func.sum(case((condition, 1), else_=0)), 0)

        row = (
            await self.session.execute(
                select(
                    func.count(),
                    count_where(User.created_at >= now - timedelta(days=7)),
                    count_where(User.created_at >= now - timedelta(days=30)),
                    count_where(User.app_opened_at.is_not(None)),
                    count_where(User.app_opened_at.is_(None)),
                    count_where(User.bot_blocked_at.is_not(None)),
                    count_where(User.blocked_at.is_not(None)),
                    count_where(
                        User.last_seen_at >= now - timedelta(minutes=ACTIVE_NOW_MINUTES)
                    ),
                    count_where(
                        and_(User.app_opened_at.is_not(None), User.bot_blocked_at.is_(None))
                    ),
                    count_where(and_(User.app_opened_at.is_(None), User.bot_blocked_at.is_(None))),
                ).select_from(User)
            )
        ).one()
        return UserCounts(*(int(value) for value in row))

    async def count_users_created_before(self, moment: datetime) -> int:
        """Сколько пользователей зарегистрировалось раньше `moment`."""
        return await self.session.scalar(
            select(func.count()).select_from(User).where(User.created_at < moment)
        ) or 0

    async def new_users_by_day(self, since: datetime) -> dict[date, int]:
        """Новые пользователи по дням (UTC) начиная с `since`."""
        day = func.date(User.created_at)
        result = await self.session.execute(
            select(day, func.count()).where(User.created_at >= since).group_by(day)
        )
        return {_as_date(value): count for value, count in result.tuples()}

    async def active_users_by_day(self, since: date) -> dict[date, int]:
        """Активные пользователи по дням (DAU) начиная с `since`."""
        result = await self.session.execute(
            select(UserActivity.day, func.count())
            .where(UserActivity.day >= since)
            .group_by(UserActivity.day)
        )
        return {_as_date(value): count for value, count in result.tuples()}

    async def count_active_users_since(self, since: date) -> int:
        """Сколько разных пользователей были активны начиная с `since` (WAU, MAU)."""
        return await self.session.scalar(
            select(func.count(func.distinct(UserActivity.user_id))).where(
                UserActivity.day >= since
            )
        ) or 0

    async def active_habit_counts(self) -> list[int]:
        """Число активных привычек у каждого пользователя, у которого они есть."""
        result = await self.session.execute(
            select(func.count())
            .select_from(Task)
            .where(Task.is_active.is_(True))
            .group_by(Task.user_id)
        )
        return list(result.scalars().all())

    async def active_task_schedules(self) -> list[TaskSchedule]:
        """Расписания всех активных привычек (без названий и отметок)."""
        result = await self.session.execute(
            select(Task.id, Task.created_at, Task.frequency_type, Task.days).where(
                Task.is_active.is_(True)
            )
        )
        return [
            TaskSchedule(id=task_id, created_on=created.date(), frequency_type=kind, days=days)
            for task_id, created, kind, days in result.tuples()
        ]

    async def done_task_days_since(self, since: date) -> list[tuple[int, date]]:
        """Отметки выполнения активных привычек начиная с `since`: (id привычки, дата)."""
        result = await self.session.execute(
            select(TaskLog.task_id, TaskLog.scheduled_date)
            .join(Task, Task.id == TaskLog.task_id)
            .where(
                Task.is_active.is_(True),
                TaskLog.status == TaskStatus.done,
                TaskLog.scheduled_date >= since,
            )
        )
        return [(task_id, day) for task_id, day in result.tuples()]

    # ------------------------------------------------------------------ #
    #  Broadcasts
    # ------------------------------------------------------------------ #

    async def count_recipients(
        self, segment: str, moment: datetime, exclude_user_id: int | None = None
    ) -> int:
        """Сколько получателей у рассылки на сегмент в момент `moment`."""
        return await self.session.scalar(
            select(func.count())
            .select_from(User)
            .where(_recipient_condition(segment, moment, exclude_user_id))
        ) or 0

    async def recipients_after(
        self,
        segment: str,
        moment: datetime,
        exclude_user_id: int | None,
        after_id: int,
        limit: int,
    ) -> list[int]:
        """Следующие получатели рассылки по возрастанию id — после `after_id`."""
        result = await self.session.execute(
            select(User.telegram_id)
            .where(
                _recipient_condition(segment, moment, exclude_user_id),
                User.telegram_id > after_id,
            )
            .order_by(User.telegram_id)
            .limit(limit)
        )
        return list(result.scalars().all())

    async def create_broadcast(
        self,
        *,
        created_by: int,
        segment: str,
        text: str | None,
        media_type: str | None,
        media_file_id: str | None,
        total: int,
    ) -> Broadcast:
        """Поставить рассылку в очередь бота."""
        broadcast = Broadcast(
            created_by=created_by,
            segment=segment,
            text=text,
            media_type=media_type,
            media_file_id=media_file_id,
            status=BroadcastStatus.pending,
            total=total,
        )
        self.session.add(broadcast)
        await self.session.flush()
        await self.session.refresh(broadcast, ["created_at"])
        return broadcast

    async def get_broadcast(self, broadcast_id: int) -> Broadcast | None:
        """Рассылка по id или None."""
        return await self.session.get(Broadcast, broadcast_id)

    async def next_broadcast(self) -> Broadcast | None:
        """Самая ранняя неразосланная рассылка (прерванная перезапуском — тоже)."""
        result = await self.session.execute(
            select(Broadcast)
            .where(Broadcast.status != BroadcastStatus.done)
            .order_by(Broadcast.id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def record_broadcast_progress(
        self, broadcast: Broadcast, *, cursor: int, sent: int, failed: int
    ) -> None:
        """Учесть обработанную пачку получателей."""
        broadcast.status = BroadcastStatus.sending
        broadcast.cursor = cursor
        broadcast.sent += sent
        broadcast.failed += failed
        await self.session.flush()

    async def finish_broadcast(self, broadcast: Broadcast) -> None:
        """Рассылка разослана всем получателям."""
        broadcast.status = BroadcastStatus.done
        broadcast.finished_at = utc_now()
        await self.session.flush()
