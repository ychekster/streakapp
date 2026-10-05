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
    JSON,
    String,
    Text,
    Time,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from backend.constants import (
    AUDIENCE_MAX_LENGTH,
    CLIENT_REF_MAX_LENGTH,
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
    every_other_day = "every_other_day"  # через день, начиная с Task.start_date


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
    """Пользователь и его настройки.

    `telegram_id` is the internal account id. Telegram accounts keep their (positive)
    Telegram id, so the Telegram identity is the id itself. Web-only accounts (guests) get a
    random negative id (see accounts.py), which can never
    collide with a Telegram user id.
    """

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
    # Напоминание «Пора отметить привычки» (настройки): время в поясе пользователя, None —
    # выключено; дни недели — строка вида "mon,wed,fri" (помнятся и при выключенном).
    # Присылает бот (bot/reminders.py); индекс — как у Task.reminder_time.
    checkin_reminder_time: Mapped[time | None] = mapped_column(Time, nullable=True, index=True)
    checkin_reminder_days: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Первый запрос к API — пользователь открыл приложение. None — только запустил бота
    # (/start записывает пользователя, см. bot/handlers/start.py).
    app_opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Последний запрос к API, с точностью LAST_SEEN_RESOLUTION_SECONDS (см.
    # Repository.touch_user). Индекс: по нему считаются активные и фильтры активности.
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    # Пользователь заблокировал бота (Telegram прислал my_chat_member «kicked» или
    # ответил 403 на отправку); None — не блокировал или уже разблокировал.
    bot_blocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Заблокирован администратором: API отвечает 403, напоминания и рассылки не приходят.
    blocked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # First time the user ever marked a habit as done (drives the one-time install offer
    # from the bot, see services.toggle_today). Backfilled by migration 0010.
    first_checkin_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # When the bot sent the "install the app" offer; None — not sent yet.
    install_offer_sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

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
    # Для every_other_day: первый день привычки; дальше — каждый второй день от него.
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)

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
    # Id, который дало привычке устройство, создав её без связи (POST /sync): по нему
    # повтор создания не заводит вторую привычку, а отметки новой привычки её находят.
    client_ref: Mapped[str | None] = mapped_column(
        String(CLIENT_REF_MAX_LENGTH), nullable=True, index=True
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

    Получатели — пользователи под фильтром по возрастанию id; `cursor` — id последнего
    обработанного, поэтому после перезапуска бот продолжает с того же места.
    Медиа уже загружено в Telegram (копия ушла автору рассылки) — хранится его file_id.
    """

    __tablename__ = "broadcasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_by: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Фильтр получателей — строка «признак:значение» через запятую (audience.py); пустая —
    # все пользователи.
    audience: Mapped[str] = mapped_column(
        String(AUDIENCE_MAX_LENGTH), default="", server_default="", nullable=False
    )
    # Кнопка под сообщением (constants.BROADCAST_BUTTONS); None — без кнопки.
    button: Mapped[str | None] = mapped_column(String(16), nullable=True)
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


# --------------------------------------------------------------------------- #
#  Web app (PWA): sessions, one-time codes, push, funnel events
# --------------------------------------------------------------------------- #


class WebSession(Base):
    """A web (PWA) login. The client keeps the random token; only its hash is stored, so a
    database leak does not reveal usable tokens. Expiry slides forward on use."""

    __tablename__ = "web_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    last_used_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class AuthCode(Base):
    """A short-lived, single-use code: Telegram → web handoff or bot login request.
    Stored hashed, like sessions. `user_id` has no foreign key: the account may be merged away meanwhile."""

    __tablename__ = "auth_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # Kind-specific data (JSON text): OAuth mode, confirmed Telegram user, …
    payload: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PushSubscription(Base):
    """A Web Push subscription of one device (browser endpoint + keys)."""

    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.telegram_id"), nullable=False, index=True
    )
    endpoint: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth: Mapped[str] = mapped_column(String(255), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Event(Base):
    """A funnel analytics event (landing → install → first launch → first habit …).

    `user_id` has no foreign key on purpose: the funnel must survive account merges and
    deletions. `anon_id` is a random id the device keeps before an account exists.
    """

    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    anon_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    platform: Mapped[str | None] = mapped_column(String(16), nullable=True)
    browser_context: Mapped[str | None] = mapped_column(String(16), nullable=True)
    src: Mapped[str | None] = mapped_column(String(32), nullable=True)
    props: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False, index=True
    )
