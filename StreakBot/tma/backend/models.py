"""ORM-модели: User, Task, TaskLog и данные админ-панели (Admin, Review, UserActivity,
Broadcast).

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
    Text,
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
    HABIT_NAME_MAX_LENGTH,
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


class BroadcastStatus(str, enum.Enum):
    """Состояние рассылки: ждёт бота, рассылается, разослана."""

    pending = "pending"
    sending = "sending"
    done = "done"


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

    # Первый запрос к API — пользователь открыл приложение. None — только запустил бота
    # (/start записывает пользователя, см. bot/handlers/start.py).
    app_opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Последний запрос к API, с точностью LAST_SEEN_RESOLUTION_SECONDS (см.
    # Repository.touch_user). Индекс: по нему считаются активные и сегменты рассылки.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # Пользователь заблокировал бота (Telegram прислал my_chat_member «kicked» или
    # ответил 403 на отправку); None — не блокировал или уже разблокировал.
    bot_blocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Заблокирован администратором: API отвечает 403, напоминания и рассылки не приходят.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Время — UTC без пояса, как и остальные отметки времени в базе. Индекс: список
    # пользователей в админ-панели отсортирован по дате регистрации.
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )

    tasks: Mapped[list["Task"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    reviews: Mapped[list["Review"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Task(Base):
    """Задача (привычка) пользователя."""

    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(HABIT_NAME_MAX_LENGTH), nullable=False)

    frequency_type: Mapped[FrequencyType] = mapped_column(
        Enum(FrequencyType, native_enum=False, length=20), nullable=False
    )
    # Для specific_days: строка вида "mon,wed,fri".
    days: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Время напоминания в поясе пользователя; None — без напоминания. Напоминание
    # присылает бот (bot/reminders.py) в запланированные дни, если привычка не выполнена.
    # Индекс: бот каждую минуту выбирает привычки по времени напоминания.
    reminder_time: Mapped[time | None] = mapped_column(Time, nullable=True, index=True)
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


class Admin(Base):
    """Администратор: видит в настройках вход в админ-панель, API пускает его в /admin.

    Не ссылается на `users`: администратора можно добавить по id Telegram ещё до того,
    как он откроет приложение.
    """

    __tablename__ = "admins"

    telegram_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # Кто добавил; None — первый администратор (SEED_ADMIN_IDS).
    added_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class Review(Base):
    """Отзыв пользователя (настройки → «Написать отзыв») и ответ администратора на него.

    Ответ приходит пользователю сообщением бота; здесь хранится последний.
    """

    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    reply_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    replied_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    replied_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    user: Mapped["User"] = relationship(back_populates="reviews")


class UserActivity(Base):
    """День, в который пользователь открывал приложение (день по UTC).

    Одна запись на пользователя и день — из них считаются DAU/WAU/MAU и график
    активности. Записывает `Repository.touch_user` при первом запросе за день.
    """

    __tablename__ = "user_activity"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), primary_key=True
    )
    day: Mapped[date] = mapped_column(Date, primary_key=True, index=True)


class Broadcast(Base):
    """Рассылка из админ-панели. API создаёт её, бот рассылает (bot/broadcasts.py).

    Получатели — пользователи сегмента по возрастанию id; `cursor` — id последнего
    обработанного, поэтому после перезапуска бот продолжает с того же места.
    Медиа уже загружено в Telegram (копия ушла автору рассылки) — хранится его file_id.
    """

    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Ключ сегмента получателей (constants.BROADCAST_SEGMENTS).
    segment: Mapped[str] = mapped_column(String(32), nullable=False)
    # Текст сообщения или подпись к медиа; None — медиа без подписи.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # "photo" / "video"; None — только текст.
    media_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    media_file_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[BroadcastStatus] = mapped_column(
        Enum(BroadcastStatus, native_enum=False, length=16),
        default=BroadcastStatus.pending,
        nullable=False,
        index=True,
    )
    # Получателей на момент создания; доставлено и не доставлено по мере рассылки.
    total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cursor: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
