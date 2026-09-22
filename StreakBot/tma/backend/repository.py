"""Репозиторий — единственная точка доступа к БД (Repository pattern).

Роутеры и сервисы не пишут SQL напрямую: вся работа с данными идёт через
методы этого класса. Каждый экземпляр привязан к одной async-сессии.
"""

from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from tma.backend.constants import DEFAULT_HABIT_COLOR
from tma.backend.models import (
    FrequencyType,
    Task,
    TaskLog,
    TaskStatus,
    User,
)


class Repository:
    """CRUD-методы для User, Task и TaskLog поверх одной сессии."""

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
        не дубликат). Сравнение делается в Python: SQLite `lower()` не приводит к
        нижнему регистру кириллицу, поэтому полагаться на него нельзя.
        """
        target = name.strip().lower()
        query = select(Task.name).where(Task.user_id == user_id, Task.is_active.is_(True))
        if exclude_task_id is not None:
            query = query.where(Task.id != exclude_task_id)
        result = await self.session.execute(query)
        return any((task_name or "").strip().lower() == target for task_name in result.scalars())

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

    async def get_active_tasks_with_reminders(self) -> list[Task]:
        """Активные задачи всех пользователей с напоминанием — вместе с владельцем
        (его пояс нужен, чтобы понять, наступило ли время напоминания)."""
        result = await self.session.execute(
            select(Task)
            .where(Task.is_active.is_(True), Task.reminder_time.is_not(None))
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
        """Установить статус лога и зафиксировать момент отметки."""
        log.status = status
        log.marked_at = datetime.utcnow()
        await self.session.flush()

    async def get_logs_for_task(self, task_id: int) -> list[TaskLog]:
        """Вернуть все логи задачи, отсортированные по дате (DESC)."""
        result = await self.session.execute(
            select(TaskLog)
            .where(TaskLog.task_id == task_id)
            .order_by(TaskLog.scheduled_date.desc())
        )
        return list(result.scalars().all())
