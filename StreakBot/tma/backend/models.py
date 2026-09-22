"""ORM-модели: User, Task, TaskLog.

Прогресс нигде не хранится как поле — история выполнения вычисляется по записям
TaskLog (см. `services.build_history`). Это исключает рассинхронизацию данных.
"""

from __future__ import annotations

import enum
from datetime import date, datetime, time

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Time,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from tma.backend.constants import (
    DEFAULT_HABIT_COLOR,
    DEFAULT_LANGUAGE,
    DEFAULT_THEME,
    HABIT_COLOR_MAX_LENGTH,
)


class Base(DeclarativeBase):
    """Общий декларативный базовый класс для всех ORM-моделей."""


class FrequencyType(str, enum.Enum):
    """Тип расписания задачи."""

    daily = "daily"                  # каждый день
    specific_days = "specific_days"  # конкретные дни недели


class TaskStatus(str, enum.Enum):
    """Статус выполнения задачи на конкретную дату.

    Приложение ставит только `pending` и `done`. `skipped` и `missed` проставлял
    прежний бот — они остаются в enum, чтобы читались исторические записи.
    """

    pending = "pending"   # создана, ещё не отмечена (или отметку сняли)
    done = "done"         # пользователь отметил выполнение
    skipped = "skipped"   # историческое: пользователь отметил «не выполнено»
    missed = "missed"     # историческое: не отмечена до конца дня


class User(Base):
    """Пользователь Telegram и его настройки."""

    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    username: Mapped[str | None] = mapped_column(String(64), nullable=True)
    first_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # Пояс определяет, какой день считается «сегодня». None — UTC.
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Город пояса — id в справочнике городов (cities.py); меняется вместе с поясом.
    # None — пояс выбран до появления справочника или смещением UTC±N.
    timezone_city: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Язык интерфейса (constants.LANGUAGES); на нём же бот пишет напоминания.
    language: Mapped[str] = mapped_column(
        String(8), default=DEFAULT_LANGUAGE, server_default=DEFAULT_LANGUAGE, nullable=False
    )
    # Тема оформления (constants.THEMES). Применяет её фронтенд.
    theme: Mapped[str] = mapped_column(
        String(16), default=DEFAULT_THEME, server_default=DEFAULT_THEME, nullable=False
    )
    # «Отмечать за вчера»: отметки ставятся за вчерашний день (см. services.user_today).
    mark_yesterday: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Task(Base):
    """Задача (привычка) пользователя."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    frequency_type: Mapped[FrequencyType] = mapped_column(
        Enum(FrequencyType, native_enum=False, length=20), nullable=False
    )
    # Для specific_days: строка вида "mon,wed,fri".
    days: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Время напоминания в поясе пользователя; None — без напоминания. Напоминание
    # присылает бот (bot/reminders.py) в запланированные дни, если привычка не выполнена.
    reminder_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    # Цвет (тема) привычки — ключ палитры из constants.HABIT_COLORS.
    color: Mapped[str] = mapped_column(
        String(HABIT_COLOR_MAX_LENGTH),
        default=DEFAULT_HABIT_COLOR,
        server_default=DEFAULT_HABIT_COLOR,
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="tasks")
    logs: Mapped[list["TaskLog"]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class TaskLog(Base):
    """Запись о статусе задачи на конкретную дату.

    Уникальность (task_id, scheduled_date) гарантирует одну запись на день.
    """

    __tablename__ = "task_logs"
    __table_args__ = (
        UniqueConstraint("task_id", "scheduled_date", name="uq_tasklog_task_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tasks.id"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=20),
        default=TaskStatus.pending,
        nullable=False,
    )
    marked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    task: Mapped["Task"] = relationship(back_populates="logs")
