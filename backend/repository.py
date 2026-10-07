"""Репозиторий — единственная точка доступа к БД (Repository pattern).

Роутеры и сервисы не пишут SQL напрямую: вся работа с данными идёт через
методы этого класса. Каждый экземпляр привязан к одной async-сессии.
"""

from __future__ import annotations

import secrets
from collections.abc import Collection, Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from itertools import islice
from typing import Any

from sqlalchemy import (
    String,
    and_,
    case,
    cast,
    delete,
    exists,
    func,
    not_,
    or_,
    select,
    true,
    update,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, AsyncSessionTransaction
from sqlalchemy.orm import selectinload

from backend.clock import day_start, local_day
from backend.constants import (
    ACTIVE_NOW_MINUTES,
    DEFAULT_HABIT_COLOR,
    HABIT_NAME_MAX_LENGTH,
    LAST_SEEN_RESOLUTION_SECONDS,
    SEGMENT_FILTER,
    SOURCE_DIRECT,
    SOURCE_PRESETS,
)
from backend.models import (
    ActivityLog,
    Admin,
    AppConfig,
    AuthCode,
    Broadcast,
    BroadcastStatus,
    CheckinDay,
    Event,
    FrequencyType,
    PushSubscription,
    Review,
    Segment,
    Task,
    TaskFreeze,
    TaskLog,
    TaskStatus,
    User,
    UserActivity,
    WebSession,
)


# Сколько значений передавать в одном `IN (...)`: у SQLite и драйверов PostgreSQL есть
# предел числа параметров запроса.
_IN_BATCH_SIZE = 500

# Web-only account ids: random in [-_WEB_ID_MAX, -1]. Within 2**53, so JavaScript (the
# admin panel) keeps them exact, and above −7·10¹², where scripts/seed_analytics.py keeps
# its fake users — removing them can never touch a real account.
_WEB_ID_MAX = 10**12 - 1
_WEB_ID_ATTEMPTS = 5


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


# Периоды фильтров «активность» и «появились» (constants.AUDIENCE_FILTERS), дней.
_FILTER_DAYS: dict[str, int] = {
    "1d": 1,
    "7d": 7,
    "30d": 30,
    "90d": 90,
    "inactive_3d": 3,
    "inactive_7d": 7,
    "inactive_14d": 14,
    "inactive_30d": 30,
}

# Признаки фильтра, которые считаются не одним условием SQL, а в Python (аналитика, см.
# audience.resolve_audience): их пользователей вызывающий передаёт готовыми списками id.
PRECOMPUTED_FILTERS: tuple[str, ...] = ("activated", "stuck", "uninstalled", "streak", SEGMENT_FILTER)


def is_web_platform() -> Any:
    """Пользователь пришёл из веб-приложения (у строк без отметки — веб-гость)."""
    return or_(
        User.signup_platform == "web",
        and_(User.signup_platform.is_(None), User.telegram_id < 0),
    )


def _source_condition(value: str) -> Any:
    """Фильтр «Источник»: готовый источник, «напрямую» (без метки) или любой другой."""
    if value == SOURCE_DIRECT:
        return or_(User.source.is_(None), User.source == SOURCE_DIRECT)
    if value in SOURCE_PRESETS:
        return User.source == value
    return and_(
        User.source.is_not(None), User.source != SOURCE_DIRECT, User.source.not_in(SOURCE_PRESETS)
    )


def _audience_condition(
    audience: Mapping[str, str], moment: datetime, ids: Mapping[str, Collection[int]]
) -> Any:
    """Условие на пользователя для фильтра (audience.py): условия признаков через «и».

    Всё считается на момент `moment`: привычки, отзывы и первое открытие приложения —
    сделанные до него. Рассылка перебирает получателей долго, и так её фильтр не
    расползается: кто открыл приложение или добавил привычку во время рассылки, в неё не
    попадает — как не был посчитан и в числе получателей.

    `ids` — пользователи признаков из PRECOMPUTED_FILTERS (их считает аналитика, см.
    audience.resolve_audience): признак → id подходящих.
    """
    conditions: list[Any] = []
    opened = and_(User.app_opened_at.is_not(None), User.app_opened_at <= moment)
    has_habit = exists().where(Task.user_id == User.telegram_id, Task.created_at <= moment)
    has_review = exists().where(Review.user_id == User.telegram_id, Review.created_at <= moment)
    has_checkin = or_(
        User.first_checkin_at.is_not(None),
        exists().where(CheckinDay.user_id == User.telegram_id),
    )

    def listed(key: str) -> Any:
        return User.telegram_id.in_(sorted(ids.get(key, ())))

    for key, value in audience.items():
        if key == "app":
            conditions.append(opened if value == "opened" else not_(opened))
        elif key == "habits":
            # Считаются и удалённые привычки: «добавил хотя бы одну» — как в воронке аналитики.
            conditions.append(has_habit if value == "any" else not_(has_habit))
        elif key == "activity":
            since = moment - timedelta(days=_FILTER_DAYS[value])
            if value.startswith("inactive_"):
                conditions.append(
                    and_(opened, or_(User.last_seen_at.is_(None), User.last_seen_at < since))
                )
            else:
                conditions.append(User.last_seen_at >= since)
        elif key == "joined":
            if value == "today":
                conditions.append(User.created_at >= day_start(local_day(moment)))
            else:
                conditions.append(User.created_at >= moment - timedelta(days=_FILTER_DAYS[value]))
        elif key == "platform":
            conditions.append(is_web_platform() if value == "web" else not_(is_web_platform()))
        elif key == "device":
            conditions.append(User.device == value)
        elif key == "source":
            conditions.append(_source_condition(value))
        elif key == "activated":
            conditions.append(listed(key) if value == "yes" else not_(listed(key)))
        elif key == "stuck":
            if value == "no_open":
                conditions.append(and_(not_(opened), not_(is_web_platform())))
            elif value == "no_habit":
                conditions.append(and_(opened, not_(has_habit)))
            elif value == "no_checkin":
                conditions.append(and_(has_habit, not_(has_checkin)))
            else:
                conditions.append(listed(key))
        elif key in ("uninstalled", "streak", SEGMENT_FILTER):
            conditions.append(listed(key))
        elif key == "reminders":
            has_reminder = or_(
                User.checkin_reminder_time.is_not(None),
                exists().where(
                    Task.user_id == User.telegram_id,
                    Task.is_active.is_(True),
                    Task.reminder_time.is_not(None),
                ),
            )
            conditions.append(has_reminder if value == "any" else not_(has_reminder))
        elif key == "language":
            conditions.append(User.language == value)
        elif key == "reviews":
            conditions.append(has_review if value == "any" else not_(has_review))
        elif key == "bot":
            column = User.bot_blocked_at
            conditions.append(column.is_not(None) if value == "blocked" else column.is_(None))
        elif key == "access":
            column = User.blocked_at
            conditions.append(column.is_not(None) if value == "blocked" else column.is_(None))
        elif key == "test":
            flag = User.is_test.is_(True)
            conditions.append(flag if value == "yes" else not_(flag))
    return and_(true(), *conditions)


def _recipient_condition(
    audience: Mapping[str, str],
    moment: datetime,
    exclude_user_id: int | None,
    ids: Mapping[str, Collection[int]],
) -> Any:
    """Получатели рассылки: пользователи под фильтром, уже зарегистрированные к `moment`
    (пришедшие во время долгой рассылки её не получают — как и не посчитаны в ней), кроме
    заблокировавших бота (Telegram сообщает о разблокировке, поэтому отметка точна),
    выключивших уведомления в Mini App, заблокированных администратором и автора
    рассылки (ему копия уже пришла)."""
    condition = and_(
        _audience_condition(audience, moment, ids),
        # Web-only accounts (negative ids) have no Telegram chat to send to.
        User.telegram_id > 0,
        # Turned notifications off in the Mini App: no broadcasts either.
        User.telegram_notifications.is_(True),
        User.created_at <= moment,
        User.bot_blocked_at.is_(None),
        User.blocked_at.is_(None),
    )
    if exclude_user_id is not None:
        condition = and_(condition, User.telegram_id != exclude_user_id)
    return condition


@dataclass(frozen=True)
class TaskSchedule:
    """Расписание активной привычки — всё, что нужно для доли выполнения по дням."""

    id: int
    created_on: date
    frequency_type: FrequencyType
    days: str | None
    start_date: date | None = None


class Repository:
    """CRUD-методы для пользователей, привычек, отметок и данных админ-панели поверх
    одной сессии."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def commit(self) -> None:
        """Зафиксировать сделанное и закрыть транзакцию.

        Обычно коммит делает зависимость `get_repository` в конце запроса, и вызывать его
        вручную не нужно. Исключение — обработчик, которому предстоит долгий поход в сеть
        (админ-панель отправляет сообщение или загружает видео рассылки в Telegram): пока
        транзакция открыта, SQLite держит блокировку записи, и отметки привычек остальных
        пользователей ждут её до таймаута. Коммит перед отправкой снимает блокировку,
        а запись результата открывает новую, короткую транзакцию.
        """
        await self.session.commit()

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
        source: tuple[str, str | None] | None = None,
    ) -> User:
        """Вернуть пользователя, создав его при первом обращении.

        @username и имя синхронизируются с Telegram (могут меняться между
        сессиями); если они не изменились, UPDATE не выполняется. `language` —
        язык интерфейса нового пользователя; у существующего он не меняется. `source` —
        метка ссылки (источник, подпись), с которой он пришёл: запоминается только у нового.

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
                    signup_platform="telegram",
                    source=source[0] if source else None,
                    source_tag=source[1] if source else None,
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
        checkin_reminder: tuple[time | None, str] | None = None,
        telegram_notifications: bool | None = None,
    ) -> None:
        """Изменить настройки пользователя; None — оставить как есть. Город пояса
        меняется вместе с поясом (None у нового пояса — пояс без города). Напоминание
        «Пора отметить привычки» — (время или None — выключено, дни «mon,wed»)."""
        if timezone is not None:
            user.timezone = timezone
            user.timezone_city = timezone_city
        if language is not None:
            user.language = language
        if theme is not None:
            user.theme = theme
        if mark_yesterday is not None:
            user.mark_yesterday = mark_yesterday
        if checkin_reminder is not None:
            user.checkin_reminder_time, user.checkin_reminder_days = checkin_reminder
        if telegram_notifications is not None:
            user.telegram_notifications = telegram_notifications
        await self.session.flush()

    async def touch_user(self, user: User, now: datetime, device: str | None = None) -> None:
        """Отметить запрос пользователя к API: время последнего запроса, первое открытие
        приложения, день активности (по Алматы — для аналитики) и устройство (`device` —
        ios / android / desktop по User-Agent).

        Пишет не чаще раза в LAST_SEEN_RESOLUTION_SECONDS (и в первый запрос нового
        дня): приложение при открытии делает несколько запросов, а каждый из них был бы
        ещё и записью в базу.
        """
        last = user.last_seen_at
        if (
            last is not None
            and local_day(last) == local_day(now)
            and now - last < timedelta(seconds=LAST_SEEN_RESOLUTION_SECONDS)
        ):
            return
        user.last_seen_at = now
        if user.app_opened_at is None:
            user.app_opened_at = now
        if device is not None and user.device != device:
            user.device = device
        await self.session.flush()
        await self._record_activity(user.telegram_id, local_day(now))

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
        """Отметить, что пользователи заблокировали бота (или разблокировали его). Смена
        состояния попадает в ленту действий (bot_blocked / bot_unblocked) — по ней
        аналитика считает блокировки по дням."""
        now = utc_now()
        column = User.bot_blocked_at
        kind = "bot_blocked" if blocked else "bot_unblocked"
        for batch in _batches(set(user_ids)):
            changing = list(
                await self.session.scalars(
                    select(User.telegram_id).where(
                        User.telegram_id.in_(batch),
                        column.is_(None) if blocked else column.is_not(None),
                    )
                )
            )
            if not changing:
                continue
            await self.session.execute(
                update(User)
                .where(User.telegram_id.in_(changing))
                .values(bot_blocked_at=now if blocked else None)
            )
            self.session.add_all(
                ActivityLog(user_id=user_id, kind=kind, created_at=now) for user_id in changing
            )
        await self.session.flush()

    async def set_blocked(self, user: User, blocked: bool) -> None:
        """Заблокировать пользователя (или снять блокировку) по решению администратора.
        Блокировка завершает и все его сессии веб-приложения."""
        user.blocked_at = utc_now() if blocked else None
        if blocked:
            await self.delete_user_sessions(user.telegram_id)
        await self.session.flush()

    async def delete_user(self, telegram_id: int) -> None:
        """Удалить пользователя со всеми его данными: отметками, привычками, отзывами и
        днями активности. Порядок — от зависимых таблиц к `users` (PostgreSQL проверяет
        внешние ключи)."""
        for model in (
            TaskLog,
            TaskFreeze,
            Task,
            Review,
            UserActivity,
            CheckinDay,
            ActivityLog,
            WebSession,
            PushSubscription,
        ):
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
        start_date: date | None = None,
        client_ref: str | None = None,
        times_per_day: int = 1,
        auto_mark: bool = False,
    ) -> Task:
        """Создать активную задачу. `client_ref` — id, который дало ей устройство (/sync)."""
        task = Task(
            user_id=user_id,
            name=name,
            frequency_type=frequency_type,
            days=days,
            start_date=start_date,
            reminder_time=reminder_time,
            color=color,
            times_per_day=times_per_day,
            auto_mark=auto_mark,
            client_ref=client_ref,
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
        start_date: date | None = None,
        times_per_day: int = 1,
        auto_mark: bool = False,
    ) -> None:
        """Заменить параметры задачи (всё, что задаётся в форме привычки)."""
        task.times_per_day = times_per_day
        task.auto_mark = auto_mark
        task.name = name
        task.frequency_type = frequency_type
        task.days = days
        task.start_date = start_date
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

    async def get_task_by_ref(self, user_id: int, client_ref: str) -> Task | None:
        """Задача пользователя, созданная устройством под этим id (/sync), — в том числе
        уже удалённая (повтор создания не должен её воскрешать); нет — None."""
        result = await self.session.execute(
            select(Task)
            .where(Task.user_id == user_id, Task.client_ref == client_ref)
            .order_by(Task.id)
            .limit(1)
        )
        return result.scalar_one_or_none()

    def savepoint(self) -> AsyncSessionTransaction:
        """Вложенная транзакция (SAVEPOINT): `async with repo.savepoint(): ...` — при
        исключении внутри откатывается только сделанное в блоке (операции /sync
        применяются по одной, и ошибка одной не отменяет остальные)."""
        return self.session.begin_nested()

    async def soft_delete_task(self, task: Task) -> None:
        """Мягкое удаление: пометить задачу неактивной и запомнить когда (аналитика).

        Логи остаются в базе, но неактивная задача нигде не показывается, а её
        название снова свободно для новой привычки.
        """
        task.is_active = False
        task.deleted_at = utc_now()
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

    async def get_auto_mark_tasks(self) -> list[Task]:
        """Активные незамороженные привычки «раз в день» с «Отмечать автоматически» —
        вместе с владельцем (его пояс определяет день)."""
        result = await self.session.execute(
            select(Task)
            .where(
                Task.is_active.is_(True),
                Task.auto_mark.is_(True),
                Task.frozen_since.is_(None),
                Task.times_per_day == 1,
            )
            .options(selectinload(Task.user))
            .order_by(Task.id)
        )
        return list(result.scalars().all())

    async def get_users_with_checkin_reminder_at(self, times: Collection[time]) -> list[User]:
        """Незаблокированные администратором пользователи с напоминанием «Пора отметить
        привычки» в одно из `times`."""
        if not times:
            return []
        result = await self.session.execute(
            select(User)
            .where(User.checkin_reminder_time.in_(sorted(times)), User.blocked_at.is_(None))
            .order_by(User.telegram_id)
        )
        return list(result.scalars().all())

    async def get_active_tasks_of(self, user_ids: Collection[int]) -> list[Task]:
        """Активные задачи этих пользователей (по пачкам, как отметки)."""
        tasks: list[Task] = []
        for batch in _batches(set(user_ids)):
            result = await self.session.execute(
                select(Task)
                .where(Task.user_id.in_(batch), Task.is_active.is_(True))
                .order_by(Task.id)
            )
            tasks += result.scalars().all()
        return tasks

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
        """Вернуть лог на дату, создав его со статусом pending при отсутствии.

        Безопасно к гонке, как `get_or_create_user`: отметку одной привычки можно нажать
        сразу с двух устройств (или повторить после таймаута запроса), и тогда лог за день
        вставляют два запроса одновременно. Вставка идёт в SAVEPOINT, и проигравший
        уникальное ограничение (task_id, scheduled_date) перечитывает чужую запись, а не
        падает ошибкой.
        """
        log = await self.get_log(task_id, scheduled_date)
        if log is not None:
            return log
        try:
            async with self.session.begin_nested():
                log = TaskLog(
                    task_id=task_id,
                    user_id=user_id,
                    scheduled_date=scheduled_date,
                    status=TaskStatus.pending,
                )
                self.session.add(log)
                await self.session.flush()
            return log
        except IntegrityError:
            # Лог успели создать в параллельном запросе — перечитываем.
            log = await self.get_log(task_id, scheduled_date)
            if log is None:  # крайне маловероятно
                raise
            return log

    async def set_log_status(self, log: TaskLog, status: TaskStatus) -> None:
        """Установить статус лога и зафиксировать момент отметки (UTC, как и остальные
        отметки времени в базе — без пояса)."""
        log.status = status
        log.marked_at = utc_now()
        await self.session.flush()

    async def set_log_count(self, log: TaskLog, count: int | None) -> None:
        """Запомнить, сколько раз привычка выполнена за день (None — обычная отметка)."""
        log.count = count
        await self.session.flush()

    async def get_day_counts(self, task_ids: Collection[int], day: date) -> dict[int, int]:
        """Сколько раз задачи выполнены за день `day` (TaskLog.count): id задачи → число;
        задач без счёта за этот день в ответе нет."""
        counts: dict[int, int] = {}
        for batch in _batches(list(task_ids)):
            result = await self.session.execute(
                select(TaskLog.task_id, TaskLog.count).where(
                    TaskLog.task_id.in_(batch),
                    TaskLog.scheduled_date == day,
                    TaskLog.count.is_not(None),
                )
            )
            for task_id, count in result.tuples():
                counts[task_id] = count
        return counts

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

    async def get_freezes(self, task_ids: Collection[int]) -> dict[int, list[tuple[date, date]]]:
        """Прошедшие заморозки задач: id задачи → периоды (первый день, день разморозки)."""
        freezes: dict[int, list[tuple[date, date]]] = {task_id: [] for task_id in task_ids}
        for batch in _batches(freezes):
            result = await self.session.execute(
                select(TaskFreeze.task_id, TaskFreeze.start_date, TaskFreeze.end_date)
                .where(TaskFreeze.task_id.in_(batch))
                .order_by(TaskFreeze.start_date)
            )
            for task_id, start, end in result.tuples():
                freezes[task_id].append((start, end))
        return freezes

    async def freeze_task(self, task: Task, day: date) -> None:
        """Заморозить задачу с дня `day`. Уже замороженная остаётся как есть."""
        if task.frozen_since is None:
            task.frozen_since = day
            await self.session.flush()

    async def unfreeze_task(self, task: Task, day: date) -> None:
        """Разморозить задачу: день `day` уже обычный. Заморозка, не покрывшая ни одного
        дня (разморозили в тот же день), не сохраняется."""
        start = task.frozen_since
        if start is None:
            return
        if day > start:
            self.session.add(
                TaskFreeze(task_id=task.id, user_id=task.user_id, start_date=start, end_date=day)
            )
        task.frozen_since = None
        await self.session.flush()

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

    async def get_logged_task_days(
        self, task_days: Collection[tuple[int, date]]
    ) -> set[tuple[int, date]]:
        """У каких из пар (id задачи, дата) есть запись за день — любая: отметка или снятая
        отметка."""
        days = {day for _, day in task_days}
        logged: set[tuple[int, date]] = set()
        for batch in _batches({task_id for task_id, _ in task_days}):
            result = await self.session.execute(
                select(TaskLog.task_id, TaskLog.scheduled_date).where(
                    TaskLog.task_id.in_(batch),
                    TaskLog.scheduled_date.in_(sorted(days)),
                )
            )
            logged.update((task_id, day) for task_id, day in result.tuples())
        return logged & set(task_days)

    async def add_done_log(self, task: Task, day: date) -> None:
        """Отметить задачу выполненной за день, на который записи ещё нет."""
        log = await self.get_or_create_log(task.id, task.user_id, day)
        if log.status != TaskStatus.done:
            await self.set_log_status(log, TaskStatus.done)

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

    @staticmethod
    def _users_condition(
        query: str | None,
        audience: Mapping[str, str],
        moment: datetime,
        ids: Mapping[str, Collection[int]],
    ) -> Any:
        """Пользователи под поиском и фильтром (условие WHERE)."""
        condition = _audience_condition(audience, moment, ids)
        text = (query or "").strip().lstrip("@")
        if text:
            pattern = _like_pattern(text)
            conditions = [
                User.first_name.ilike(pattern, escape="\\"),
                User.username.ilike(pattern, escape="\\"),
            ]
            if text.isdigit():
                conditions.append(cast(User.telegram_id, String).like(f"{text}%"))
            condition = and_(condition, or_(*conditions))
        return condition

    async def search_users(
        self,
        query: str | None,
        audience: Mapping[str, str],
        moment: datetime,
        offset: int,
        limit: int,
        ids: Mapping[str, Collection[int]] | None = None,
    ) -> list[User]:
        """Пользователи для админ-панели, новые сначала: страница `limit` с `offset`.

        Запрос ищет по имени и @username без учёта регистра (в том числе кириллицы —
        см. database.py), а цифры — ещё и по началу id Telegram; фильтр `audience` — см.
        audience.py. Страницы — по смещению, а не по курсору: у `created_at` из разных
        источников разный формат в SQLite, и сравнение «после такой-то записи» ненадёжно.
        """
        statement = (
            select(User)
            .where(self._users_condition(query, audience, moment, ids or {}))
            .order_by(User.created_at.desc(), User.telegram_id.desc())
        )
        result = await self.session.execute(statement.offset(offset).limit(limit))
        return list(result.scalars().all())

    async def count_users(
        self,
        query: str | None,
        audience: Mapping[str, str],
        moment: datetime,
        ids: Mapping[str, Collection[int]] | None = None,
    ) -> int:
        """Сколько пользователей под поиском и фильтром."""
        return await self.session.scalar(
            select(func.count())
            .select_from(User)
            .where(self._users_condition(query, audience, moment, ids or {}))
        ) or 0

    # ------------------------------------------------------------------ #
    #  Analytics: what is recorded
    # ------------------------------------------------------------------ #

    async def log_action(
        self,
        user_id: int,
        kind: str,
        *,
        ref_id: int | None = None,
        detail: str | None = None,
        at: datetime | None = None,
    ) -> None:
        """Записать действие пользователя в ленту (models.ActivityLog)."""
        self.session.add(
            ActivityLog(
                user_id=user_id,
                kind=kind,
                ref_id=ref_id,
                detail=(detail or None) and detail[:64],
                created_at=at or utc_now(),
            )
        )
        await self.session.flush()

    async def record_checkin_day(self, user_id: int, now: datetime) -> None:
        """День (по Алматы) с отметкой привычки, если его ещё нет. Безопасно к гонке, как
        `_record_activity`."""
        day = local_day(now)
        if await self.session.get(CheckinDay, (user_id, day)) is not None:
            return
        try:
            async with self.session.begin_nested():
                self.session.add(CheckinDay(user_id=user_id, day=day))
                await self.session.flush()
        except IntegrityError:
            pass  # запись уже вставил параллельный запрос

    async def set_source(self, user: User, source: tuple[str, str | None]) -> None:
        """Запомнить источник пользователя (вызывающий проверяет, что его ещё нет)."""
        user.source, user.source_tag = source
        await self.session.flush()

    async def set_test(self, user: User, is_test: bool) -> None:
        """Отметить тестовый аккаунт (он не входит в аналитику) или снять отметку."""
        user.is_test = is_test
        await self.session.flush()

    async def get_config(self) -> dict[str, str]:
        """Настройки панели (models.AppConfig): ключ → значение."""
        result = await self.session.execute(select(AppConfig.key, AppConfig.value))
        return {key: value for key, value in result.tuples()}

    async def set_config(self, values: Mapping[str, str]) -> None:
        """Изменить настройки панели."""
        for key, value in values.items():
            row = await self.session.get(AppConfig, key)
            if row is None:
                self.session.add(AppConfig(key=key, value=value))
            else:
                row.value = value
        await self.session.flush()

    async def create_segment(self, title: str, user_ids: list[int], created_by: int) -> Segment:
        """Сохранить группу людей из аналитики."""
        segment = Segment(title=title, user_ids=user_ids, created_by=created_by)
        self.session.add(segment)
        await self.session.flush()
        return segment

    async def get_segment(self, segment_id: int) -> Segment | None:
        """Группа людей по id или None."""
        return await self.session.get(Segment, segment_id)

    # ------------------------------------------------------------------ #
    #  Analytics: what is read (backend/analytics/)
    # ------------------------------------------------------------------ #

    async def analytics_users(self) -> list[Any]:
        """Все пользователи — колонки, которые нужны аналитике, и признак администратора."""
        is_admin = exists().where(Admin.telegram_id == User.telegram_id)
        result = await self.session.execute(
            select(
                User.telegram_id,
                User.created_at,
                User.app_opened_at,
                User.last_seen_at,
                User.bot_blocked_at,
                User.blocked_at,
                User.first_checkin_at,
                User.source,
                User.source_tag,
                User.signup_platform,
                User.device,
                User.language,
                User.timezone,
                User.timezone_city,
                User.theme,
                User.mark_yesterday,
                User.checkin_reminder_time,
                User.install_offer_sent_at,
                User.is_test,
                is_admin.label("is_admin"),
            )
        )
        return list(result.all())

    async def activity_pairs(self) -> list[tuple[int, date]]:
        """Дни, в которые пользователи открывали приложение: (пользователь, день)."""
        result = await self.session.execute(select(UserActivity.user_id, UserActivity.day))
        return [(user_id, _as_date(day)) for user_id, day in result.tuples()]

    async def checkin_pairs(self) -> list[tuple[int, date]]:
        """Дни, в которые пользователи отмечали привычки: (пользователь, день)."""
        result = await self.session.execute(select(CheckinDay.user_id, CheckinDay.day))
        return [(user_id, _as_date(day)) for user_id, day in result.tuples()]

    async def analytics_tasks(self) -> list[Any]:
        """Все привычки (и удалённые): расписание, напоминание, создание и удаление."""
        result = await self.session.execute(
            select(
                Task.id,
                Task.user_id,
                Task.name,
                Task.frequency_type,
                Task.days,
                Task.start_date,
                Task.reminder_time,
                Task.created_at,
                Task.is_active,
                Task.deleted_at,
            )
        )
        return list(result.all())

    async def done_logs(
        self, since: date | None = None, user_ids: Collection[int] | None = None
    ) -> list[tuple[int, int, date, datetime | None]]:
        """Отметки выполнения: (привычка, пользователь, день привычки, когда отмечено) —
        начиная с дня `since` и только у `user_ids`, если они заданы."""
        query = select(
            TaskLog.task_id, TaskLog.user_id, TaskLog.scheduled_date, TaskLog.marked_at
        ).where(TaskLog.status == TaskStatus.done)
        if since is not None:
            query = query.where(TaskLog.scheduled_date >= since)
        if user_ids is not None:
            rows: list[tuple[int, int, date, datetime | None]] = []
            for batch in _batches(set(user_ids)):
                result = await self.session.execute(query.where(TaskLog.user_id.in_(batch)))
                rows += [(t, u, _as_date(d), m) for t, u, d, m in result.tuples()]
            return rows
        result = await self.session.execute(query)
        return [(t, u, _as_date(d), m) for t, u, d, m in result.tuples()]

    async def actions(
        self,
        kinds: Collection[str],
        since: datetime | None = None,
        user_id: int | None = None,
    ) -> list[tuple[int, str, int | None, str | None, datetime]]:
        """Действия из ленты: (пользователь, что, ref_id, detail, когда), по времени."""
        query = select(
            ActivityLog.user_id,
            ActivityLog.kind,
            ActivityLog.ref_id,
            ActivityLog.detail,
            ActivityLog.created_at,
        ).where(ActivityLog.kind.in_(list(kinds)))
        if since is not None:
            query = query.where(ActivityLog.created_at >= since)
        if user_id is not None:
            query = query.where(ActivityLog.user_id == user_id)
        result = await self.session.execute(query.order_by(ActivityLog.created_at, ActivityLog.id))
        return [tuple(row) for row in result.tuples()]  # type: ignore[misc]

    async def user_actions_page(self, user_id: int, offset: int, limit: int) -> list[ActivityLog]:
        """Лента действий пользователя, новые сначала: страница `limit` с `offset`."""
        result = await self.session.scalars(
            select(ActivityLog)
            .where(ActivityLog.user_id == user_id)
            .order_by(ActivityLog.created_at.desc(), ActivityLog.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(result.all())

    async def task_names(self, task_ids: Collection[int]) -> dict[int, str]:
        """Названия привычек (и удалённых) по id."""
        names: dict[int, str] = {}
        for batch in _batches(set(task_ids)):
            result = await self.session.execute(
                select(Task.id, Task.name).where(Task.id.in_(batch))
            )
            names.update({task_id: name for task_id, name in result.tuples()})
        return names

    async def push_user_ids(self) -> set[int]:
        """Пользователи хотя бы с одной подпиской на уведомления."""
        result = await self.session.scalars(select(PushSubscription.user_id).distinct())
        return set(result.all())

    async def first_web_sessions(self) -> dict[int, datetime]:
        """Когда аккаунт впервые вошёл в веб-приложение (по живым сессиям): id → момент."""
        result = await self.session.execute(
            select(WebSession.user_id, func.min(WebSession.created_at)).group_by(
                WebSession.user_id
            )
        )
        return {user_id: moment for user_id, moment in result.tuples()}

    async def funnel_events(
        self, names: Collection[str], since: datetime | None, until: datetime
    ) -> list[tuple[str, str | None, int | None, str | None, datetime]]:
        """События веб-воронки: (событие, устройство, аккаунт, src, когда)."""
        query = select(
            Event.event, Event.anon_id, Event.user_id, Event.src, Event.created_at
        ).where(Event.event.in_(list(names)), Event.created_at < until)
        if since is not None:
            query = query.where(Event.created_at >= since)
        result = await self.session.execute(query)
        return [tuple(row) for row in result.tuples()]  # type: ignore[misc]

    async def first_event_src(self, user_id: int) -> str | None:
        """`src` самого раннего события воронки аккаунта (источник веб-гостя)."""
        return await self.session.scalar(
            select(Event.src)
            .where(Event.user_id == user_id, Event.src.is_not(None))
            .order_by(Event.created_at, Event.id)
            .limit(1)
        )

    async def all_broadcasts(self) -> list[Broadcast]:
        """Все рассылки, новые сначала."""
        result = await self.session.scalars(select(Broadcast).order_by(Broadcast.id.desc()))
        return list(result.all())

    async def admin_ids(self) -> set[int]:
        """id всех администраторов."""
        return set((await self.session.scalars(select(Admin.telegram_id))).all())

    async def user_activity_days(self, user_id: int) -> list[date]:
        """Дни, в которые пользователь открывал приложение, по порядку."""
        result = await self.session.scalars(
            select(UserActivity.day)
            .where(UserActivity.user_id == user_id)
            .order_by(UserActivity.day)
        )
        return [_as_date(day) for day in result.all()]

    async def user_tasks(self, user_id: int) -> list[Task]:
        """Все привычки пользователя, и удалённые, по порядку создания."""
        result = await self.session.scalars(
            select(Task).where(Task.user_id == user_id).order_by(Task.id)
        )
        return list(result.all())

    async def user_checkin_days(self, user_id: int) -> list[date]:
        """Дни (по Алматы), в которые пользователь отмечал привычки, по порядку."""
        result = await self.session.scalars(
            select(CheckinDay.day).where(CheckinDay.user_id == user_id).order_by(CheckinDay.day)
        )
        return [_as_date(day) for day in result.all()]

    async def active_task_schedules(self) -> list[TaskSchedule]:
        """Расписания всех активных привычек (без названий и отметок)."""
        result = await self.session.execute(
            select(
                Task.id, Task.created_at, Task.frequency_type, Task.days, Task.start_date
            ).where(Task.is_active.is_(True))
        )
        return [
            TaskSchedule(
                id=task_id,
                created_on=created.date(),
                frequency_type=kind,
                days=days,
                start_date=start,
            )
            for task_id, created, kind, days, start in result.tuples()
        ]

    # ------------------------------------------------------------------ #
    #  Broadcasts
    # ------------------------------------------------------------------ #

    async def count_recipients(
        self,
        audience: Mapping[str, str],
        moment: datetime,
        exclude_user_id: int | None = None,
        ids: Mapping[str, Collection[int]] | None = None,
    ) -> int:
        """Сколько получателей у рассылки с фильтром `audience` в момент `moment` (`ids` —
        см. _audience_condition)."""
        return await self.session.scalar(
            select(func.count())
            .select_from(User)
            .where(_recipient_condition(audience, moment, exclude_user_id, ids or {}))
        ) or 0

    async def recipients_after(
        self,
        audience: Mapping[str, str],
        moment: datetime,
        exclude_user_id: int | None,
        after_id: int,
        limit: int,
        ids: Mapping[str, Collection[int]] | None = None,
    ) -> list[tuple[int, str]]:
        """Следующие получатели рассылки по возрастанию id — после `after_id`: (id, язык
        интерфейса — на нём подпись кнопки под рассылкой)."""
        result = await self.session.execute(
            select(User.telegram_id, User.language)
            .where(
                _recipient_condition(audience, moment, exclude_user_id, ids or {}),
                User.telegram_id > after_id,
            )
            .order_by(User.telegram_id)
            .limit(limit)
        )
        return [(user_id, language) for user_id, language in result.tuples()]

    async def create_broadcast(
        self,
        *,
        created_by: int,
        audience: str,
        text: str | None,
        media_type: str | None,
        media_file_id: str | None,
        button: str | None,
        total: int,
    ) -> Broadcast:
        """Поставить рассылку в очередь бота (`audience` — строка фильтра, audience.py)."""
        broadcast = Broadcast(
            created_by=created_by,
            audience=audience,
            text=text,
            media_type=media_type,
            media_file_id=media_file_id,
            button=button,
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

    # ------------------------------------------------------------------ #
    #  Web app: accounts
    # ------------------------------------------------------------------ #

    async def create_web_user(self, language: str, now: datetime) -> User:
        """A new web-only account (guest) with a random negative id — it never collides
        with a Telegram id. Retries on the (astronomically unlikely) id clash."""
        for _ in range(_WEB_ID_ATTEMPTS):
            user_id = -(secrets.randbelow(_WEB_ID_MAX) + 1)
            if await self.get_user(user_id) is not None:
                continue
            user = User(
                telegram_id=user_id, language=language, app_opened_at=now, signup_platform="web"
            )
            self.session.add(user)
            await self.session.flush()
            return user
        raise RuntimeError("Could not allocate a web user id")

    async def clone_user(
        self, source: User, new_id: int, username: str | None, first_name: str | None
    ) -> User:
        """A new account `new_id` with the settings of `source` (habits are moved
        separately, see move_user_data)."""
        user = User(
            telegram_id=new_id,
            username=username,
            first_name=first_name,
            timezone=source.timezone,
            timezone_city=source.timezone_city,
            language=source.language,
            theme=source.theme,
            mark_yesterday=source.mark_yesterday,
            telegram_notifications=source.telegram_notifications,
            app_opened_at=source.app_opened_at,
            last_seen_at=source.last_seen_at,
            first_checkin_at=source.first_checkin_at,
            # For analytics it is the same person: came at the same time, from the same place.
            created_at=source.created_at,
            source=source.source,
            source_tag=source.source_tag,
            signup_platform=source.signup_platform or "web",
            device=source.device,
            is_test=source.is_test,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def has_any_task(self, user_id: int) -> bool:
        """Has the account ever had a habit (deleted ones count)."""
        return bool(await self.session.scalar(select(exists().where(Task.user_id == user_id))))

    async def user_has_data(self, user_id: int) -> bool:
        """Has the account ever had a habit (even a deleted one) or a review."""
        return bool(
            await self.session.scalar(
                select(
                    or_(
                        exists().where(Task.user_id == user_id),
                        exists().where(Review.user_id == user_id),
                    )
                )
            )
        )

    async def move_user_data(self, source: User, target: User) -> User:
        """Move everything of `source` into `target`, delete `source` and return the
        target re-read from the database.

        Nothing is lost: habits, check-ins, reviews, activity days, logins, web sessions,
        push subscriptions and funnel events all move. An active habit whose name the
        target already uses gets a suffix («Бег (2)») instead of being dropped. Settings
        stay the target's; what the target lacks (time zone, first check-in) is taken
        from the source.
        """
        source_id, target_id = source.telegram_id, target.telegram_id
        taken = {
            name.strip().lower()
            for name in (
                await self.session.scalars(
                    select(Task.name).where(Task.user_id == target_id, Task.is_active.is_(True))
                )
            )
        }
        for task in await self.get_active_tasks(source_id):
            name, number = task.name, 2
            while name.strip().lower() in taken:
                suffix = f" ({number})"
                name = task.name[: HABIT_NAME_MAX_LENGTH - len(suffix)] + suffix
                number += 1
            task.name = name
            taken.add(name.strip().lower())

        if target.timezone is None and source.timezone is not None:
            target.timezone, target.timezone_city = source.timezone, source.timezone_city
        for field in ("first_checkin_at", "app_opened_at"):
            values = [value for value in (getattr(source, field), getattr(target, field)) if value]
            setattr(target, field, min(values) if values else None)
        if target.install_offer_sent_at is None:
            target.install_offer_sent_at = source.install_offer_sent_at
        if target.source is None and source.source is not None:
            target.source, target.source_tag = source.source, source.source_tag
        await self.session.flush()

        for model in (
            Task, TaskLog, TaskFreeze, Review, WebSession, PushSubscription, Event, ActivityLog
        ):
            await self.session.execute(
                update(model)
                .where(model.user_id == source_id)
                .values(user_id=target_id)
                .execution_options(synchronize_session=False)
            )
        # Activity days are keyed by (user, day): move the days the target lacks.
        await self.session.execute(
            update(UserActivity)
            .where(
                UserActivity.user_id == source_id,
                UserActivity.day.not_in(
                    select(UserActivity.day).where(UserActivity.user_id == target_id)
                ),
            )
            .values(user_id=target_id)
            .execution_options(synchronize_session=False)
        )
        await self.session.execute(delete(UserActivity).where(UserActivity.user_id == source_id))
        # Check-in days are keyed the same way.
        await self.session.execute(
            update(CheckinDay)
            .where(
                CheckinDay.user_id == source_id,
                CheckinDay.day.not_in(
                    select(CheckinDay.day).where(CheckinDay.user_id == target_id)
                ),
            )
            .values(user_id=target_id)
            .execution_options(synchronize_session=False)
        )
        await self.session.execute(delete(CheckinDay).where(CheckinDay.user_id == source_id))
        await self.session.execute(delete(User).where(User.telegram_id == source_id))
        # Bulk updates bypass the identity map: drop stale objects, re-read the target.
        self.session.expunge_all()
        merged = await self.get_user(target_id)
        assert merged is not None
        return merged

    async def mark_first_checkin(self, user: User, now: datetime) -> bool:
        """Remember the user's first check-in ever. True — this is it (it was not set)."""
        if user.first_checkin_at is not None:
            return False
        result = await self.session.execute(
            update(User)
            .where(User.telegram_id == user.telegram_id, User.first_checkin_at.is_(None))
            .values(first_checkin_at=now)
            .execution_options(synchronize_session=False)
        )
        user.first_checkin_at = now
        return result.rowcount > 0

    async def mark_install_offer_sent(self, user_id: int, now: datetime) -> bool:
        """Claim the one-time install offer for the user. True — not sent before."""
        result = await self.session.execute(
            update(User)
            .where(User.telegram_id == user_id, User.install_offer_sent_at.is_(None))
            .values(install_offer_sent_at=now)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount > 0

    # ------------------------------------------------------------------ #
    #  Web app: sessions and one-time codes
    # ------------------------------------------------------------------ #

    async def create_session(
        self,
        token_hash: str,
        user_id: int,
        user_agent: str | None,
        now: datetime,
        expires_at: datetime,
    ) -> WebSession:
        """Start a web session."""
        session = WebSession(
            token_hash=token_hash,
            user_id=user_id,
            user_agent=(user_agent or "")[:255] or None,
            created_at=now,
            last_used_at=now,
            expires_at=expires_at,
        )
        self.session.add(session)
        await self.session.flush()
        return session

    async def get_session(self, token_hash: str, now: datetime) -> WebSession | None:
        """A web session that has not expired."""
        return await self.session.scalar(
            select(WebSession).where(
                WebSession.token_hash == token_hash, WebSession.expires_at > now
            )
        )

    async def count_user_sessions(self, user_id: int, now: datetime, since: datetime) -> int:
        """Live web sessions of the account: not expired and started after `since` (older
        ones hit SESSION_MAX_AGE) — the devices logged in to the web app."""
        return await self.session.scalar(
            select(func.count()).where(
                WebSession.user_id == user_id,
                WebSession.expires_at > now,
                WebSession.created_at > since,
            )
        ) or 0

    async def delete_session(self, token_hash: str) -> None:
        """End a web session (log out, or replaced after switching accounts)."""
        await self.session.execute(delete(WebSession).where(WebSession.token_hash == token_hash))

    async def delete_user_sessions(self, user_id: int) -> None:
        """End every web session of the account (log out everywhere, blocked)."""
        await self.session.execute(delete(WebSession).where(WebSession.user_id == user_id))

    async def create_code(
        self,
        code_hash: str,
        kind: str,
        user_id: int | None,
        payload: str | None,
        now: datetime,
        expires_at: datetime,
    ) -> AuthCode:
        """Store a one-time code; long-expired codes are cleaned up on the way."""
        await self.session.execute(
            delete(AuthCode).where(AuthCode.expires_at < now - timedelta(days=1))
        )
        code = AuthCode(
            code_hash=code_hash,
            kind=kind,
            user_id=user_id,
            payload=payload,
            created_at=now,
            expires_at=expires_at,
        )
        self.session.add(code)
        await self.session.flush()
        return code

    async def get_code(self, code_hash: str, kind: str, now: datetime) -> AuthCode | None:
        """An unused, unexpired one-time code of `kind`."""
        return await self.session.scalar(
            select(AuthCode).where(
                AuthCode.code_hash == code_hash,
                AuthCode.kind == kind,
                AuthCode.used_at.is_(None),
                AuthCode.expires_at > now,
            )
        )

    async def replace_code_payload(
        self, code: AuthCode, expected: str | None, payload: str
    ) -> bool:
        """Change an unused code's payload only if it still is `expected` — nobody changed
        it meanwhile (compare-and-set). False — it was changed or spent in between."""
        unchanged = AuthCode.payload.is_(None) if expected is None else AuthCode.payload == expected
        result = await self.session.execute(
            update(AuthCode)
            .where(AuthCode.id == code.id, AuthCode.used_at.is_(None), unchanged)
            .values(payload=payload)
            .execution_options(synchronize_session=False)
        )
        code.payload = payload
        return result.rowcount > 0

    async def use_code(self, code: AuthCode, now: datetime) -> bool:
        """Spend a one-time code. False — it was spent meanwhile (a parallel request)."""
        result = await self.session.execute(
            update(AuthCode)
            .where(AuthCode.id == code.id, AuthCode.used_at.is_(None))
            .values(used_at=now)
            .execution_options(synchronize_session=False)
        )
        code.used_at = now
        return result.rowcount > 0

    # ------------------------------------------------------------------ #
    #  Web app: push subscriptions
    # ------------------------------------------------------------------ #

    async def save_push_subscription(
        self, user_id: int, endpoint: str, p256dh: str, auth: str, user_agent: str | None
    ) -> bool:
        """Store the device's subscription for the account (the endpoint identifies the
        device: re-subscribing moves it to the current account). Another account's
        subscription moves only with its own keys — the same browser sends them again,
        while someone who merely learned the address could only break its delivery.
        False — refused."""
        subscription = await self.session.scalar(
            select(PushSubscription).where(PushSubscription.endpoint == endpoint)
        )
        if subscription is None:
            self.session.add(
                PushSubscription(
                    user_id=user_id,
                    endpoint=endpoint,
                    p256dh=p256dh,
                    auth=auth,
                    user_agent=(user_agent or "")[:255] or None,
                )
            )
        elif subscription.user_id != user_id and (
            subscription.p256dh != p256dh or subscription.auth != auth
        ):
            return False
        else:
            subscription.user_id = user_id
            subscription.p256dh = p256dh
            subscription.auth = auth
        await self.session.flush()
        return True

    async def delete_push_subscriptions(
        self, endpoints: Collection[str], user_id: int | None = None
    ) -> None:
        """Forget subscriptions: the push service said they are gone (404/410), or the
        device unsubscribed (`user_id` — only the account's own)."""
        if not endpoints:
            return
        statement = delete(PushSubscription).where(
            PushSubscription.endpoint.in_(list(endpoints))
        )
        if user_id is not None:
            statement = statement.where(PushSubscription.user_id == user_id)
        await self.session.execute(statement)

    async def delete_user_push_subscriptions(self, user_id: int) -> None:
        """Forget every push subscription of the account (log out everywhere)."""
        await self.session.execute(
            delete(PushSubscription).where(PushSubscription.user_id == user_id)
        )

    async def push_subscriptions_for(
        self, user_ids: Collection[int]
    ) -> dict[int, list[PushSubscription]]:
        """Push subscriptions of the users: user id → subscriptions (users without
        subscriptions are absent)."""
        found: dict[int, list[PushSubscription]] = {}
        for batch in _batches(set(user_ids)):
            result = await self.session.scalars(
                select(PushSubscription)
                .where(PushSubscription.user_id.in_(batch))
                .order_by(PushSubscription.id)
            )
            for subscription in result:
                found.setdefault(subscription.user_id, []).append(subscription)
        return found

    async def has_push_subscription(self, user_id: int) -> bool:
        """Does the account have at least one push subscription."""
        return bool(
            await self.session.scalar(select(exists().where(PushSubscription.user_id == user_id)))
        )

    async def mark_push_delivered(self, endpoints: Collection[str], now: datetime) -> None:
        """Remember the last successful push per subscription."""
        if endpoints:
            await self.session.execute(
                update(PushSubscription)
                .where(PushSubscription.endpoint.in_(list(endpoints)))
                .values(last_success_at=now)
            )

    # ------------------------------------------------------------------ #
    #  Web app: funnel events
    # ------------------------------------------------------------------ #

    async def add_event(
        self,
        event: str,
        *,
        user_id: int | None = None,
        anon_id: str | None = None,
        platform: str | None = None,
        browser_context: str | None = None,
        src: str | None = None,
        props: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> None:
        """Record a funnel event."""
        self.session.add(
            Event(
                event=event,
                user_id=user_id,
                anon_id=anon_id,
                platform=platform,
                browser_context=browser_context,
                src=src,
                props=props,
                created_at=now or utc_now(),
            )
        )
        await self.session.flush()

    async def has_event(self, event: str, user_id: int) -> bool:
        """Has the account already got this event (for "first …" events)."""
        return bool(
            await self.session.scalar(
                select(exists().where(Event.event == event, Event.user_id == user_id))
            )
        )

    async def event_counts(
        self, since: datetime, until: datetime
    ) -> list[tuple[str, str | None, str | None, int, int]]:
        """Funnel counts in [since, until): (event, platform, src, events, distinct
        devices or accounts)."""
        who = func.coalesce(Event.anon_id, cast(Event.user_id, String))
        result = await self.session.execute(
            select(
                Event.event,
                Event.platform,
                Event.src,
                func.count(),
                func.count(func.distinct(who)),
            )
            .where(Event.created_at >= since, Event.created_at < until)
            .group_by(Event.event, Event.platform, Event.src)
        )
        return [
            (event, platform, src, int(total), int(distinct))
            for event, platform, src, total, distinct in result.tuples()
        ]
