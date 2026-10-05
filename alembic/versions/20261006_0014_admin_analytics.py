"""Admin analytics: sources, platforms, action log, check-in days, segments

- `users.source`, `users.source_tag` — откуда пришёл (метка ссылки), запоминается при
  первом приходе; `users.signup_platform` — telegram / web; `users.device` — ios /
  android / desktop; `users.is_test` — тестовый аккаунт (не входит в аналитику);
- `tasks.deleted_at` — когда привычку удалили;
- `checkin_days` — дни (по Алматы) с отметками привычек;
- `activity_log` — действия пользователей (лента профиля, напоминания, рассылки, откуда
  открыли приложение);
- `segments` — группы людей из аналитики (для списка и рассылки);
- `app_config` — пороги активации и момент, с которого собираются новые данные;
- `broadcasts.audience` — длиннее (новые признаки фильтра).

Всё, что можно восстановить по старым данным, восстанавливается здесь: платформа,
устройство, источник веб-пользователей (по событиям воронки), дни отметок и лента
(созданные привычки, отметки, отзывы, блокировки бота, подписки на уведомления, привязка
входа, предложение установить приложение).

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-06 10:00:00

"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Sequence, Union

import pytz
import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ZONE = pytz.timezone("Asia/Almaty")
_INTERNAL_SOURCES = {"direct", "bot", "settings", "install", "unknown"}


def _moment(value: Any) -> datetime | None:
    """Время из базы: у SQLite — строка, у PostgreSQL — datetime."""
    if value is None or isinstance(value, datetime):
        return value
    return datetime.fromisoformat(str(value))


def _local_day(moment: datetime) -> date:
    return pytz.utc.localize(moment).astimezone(_ZONE).date()


def _platform(user_agent: str | None) -> str | None:
    agent = (user_agent or "").lower()
    if not agent:
        return None
    if "iphone" in agent or "ipad" in agent or "ipod" in agent:
        return "ios"
    if "android" in agent:
        return "android"
    return "desktop"


def _split_source(src: str) -> tuple[str, str | None]:
    source, _, tag = src.partition("_")
    return source[:16], (tag[:32] or None)


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("source", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("source_tag", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("signup_platform", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("device", sa.String(length=16), nullable=True))
        batch_op.add_column(
            sa.Column("is_test", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("deleted_at", sa.DateTime(), nullable=True))
    with op.batch_alter_table("broadcasts") as batch_op:
        batch_op.alter_column(
            "audience", type_=sa.String(length=300), existing_type=sa.String(length=200)
        )

    op.create_table(
        "checkin_days",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "day"),
    )
    op.create_index("ix_checkin_days_day", "checkin_days", ["day"])
    op.create_table(
        "activity_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("ref_id", sa.BigInteger(), nullable=True),
        sa.Column("detail", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_activity_log_kind_created", "activity_log", ["kind", "created_at"])
    op.create_index("ix_activity_log_user_created", "activity_log", ["user_id", "created_at"])
    op.create_table(
        "segments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("user_ids", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "app_config",
        sa.Column("key", sa.String(length=48), primary_key=True),
        sa.Column("value", sa.String(length=255), nullable=False),
    )

    _backfill(op.get_bind())


def _backfill(bind: sa.engine.Connection) -> None:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    users = {
        row.telegram_id: row
        for row in bind.execute(
            sa.text("SELECT telegram_id, bot_blocked_at, install_offer_sent_at FROM users")
        )
    }

    # Платформа: веб-гость — отрицательный id. Гость, привязавший Telegram, получил новую
    # строку (клон) в момент привязки — она создана тогда же, когда событие account_linked.
    linked = {
        row.user_id: _moment(row.created_at)
        for row in bind.execute(
            sa.text(
                "SELECT user_id, MIN(created_at) AS created_at FROM events "
                "WHERE event = 'account_linked' AND user_id IS NOT NULL GROUP BY user_id"
            )
        )
    }
    created = {
        row.telegram_id: _moment(row.created_at)
        for row in bind.execute(sa.text("SELECT telegram_id, created_at FROM users"))
    }
    for user_id in users:
        platform = "web" if user_id < 0 else "telegram"
        link_moment = linked.get(user_id)
        made = created.get(user_id)
        if user_id > 0 and link_moment and made and abs((made - link_moment).total_seconds()) < 120:
            platform = "web"
        bind.execute(
            sa.text("UPDATE users SET signup_platform = :p WHERE telegram_id = :id"),
            {"p": platform, "id": user_id},
        )

    # Устройство: последний User-Agent веб-сессии или подписки, иначе платформа событий.
    devices: dict[int, tuple[datetime, str]] = {}

    def offer(user_id: int, moment: Any, device: str | None) -> None:
        when = _moment(moment) or datetime.min
        if device and user_id in users and (user_id not in devices or devices[user_id][0] < when):
            devices[user_id] = (when, device)

    for row in bind.execute(sa.text("SELECT user_id, user_agent, last_used_at FROM web_sessions")):
        offer(row.user_id, row.last_used_at, _platform(row.user_agent))
    for row in bind.execute(
        sa.text("SELECT user_id, user_agent, created_at FROM push_subscriptions")
    ):
        offer(row.user_id, row.created_at, _platform(row.user_agent))
    for row in bind.execute(
        sa.text(
            "SELECT user_id, platform, created_at FROM events "
            "WHERE user_id IS NOT NULL AND platform IS NOT NULL"
        )
    ):
        if row.user_id not in devices:
            offer(row.user_id, row.created_at, row.platform)
    for user_id, (_, device) in devices.items():
        bind.execute(
            sa.text("UPDATE users SET device = :d WHERE telegram_id = :id"),
            {"d": device, "id": user_id},
        )

    # Источник веб-пользователей — `src` их первого события воронки.
    sources: dict[int, str] = {}
    for row in bind.execute(
        sa.text(
            "SELECT user_id, src FROM events WHERE user_id IS NOT NULL AND src IS NOT NULL "
            "ORDER BY created_at, id"
        )
    ):
        if row.user_id in users and row.user_id not in sources:
            sources[row.user_id] = row.src
    for user_id, src in sources.items():
        if src in _INTERNAL_SOURCES:
            continue
        source, tag = _split_source(src)
        bind.execute(
            sa.text("UPDATE users SET source = :s, source_tag = :t WHERE telegram_id = :id"),
            {"s": source, "t": tag, "id": user_id},
        )

    # Дни отметок и лента: отметки выполнения.
    checkin_days: set[tuple[int, date]] = set()
    log_rows: list[dict[str, Any]] = []
    for row in bind.execute(
        sa.text(
            "SELECT task_id, user_id, marked_at FROM task_logs "
            "WHERE status = 'done' AND marked_at IS NOT NULL"
        )
    ):
        moment = _moment(row.marked_at)
        if row.user_id not in users or moment is None:
            continue
        checkin_days.add((row.user_id, _local_day(moment)))
        log_rows.append(
            {"u": row.user_id, "k": "checkin", "r": row.task_id, "d": None, "c": moment}
        )
    if checkin_days:
        bind.execute(
            sa.text("INSERT INTO checkin_days (user_id, day) VALUES (:u, :d)"),
            [{"u": user_id, "d": day} for user_id, day in sorted(checkin_days)],
        )

    for row in bind.execute(sa.text("SELECT id, user_id, created_at FROM tasks")):
        log_rows.append(
            {"u": row.user_id, "k": "habit_created", "r": row.id, "d": None,
             "c": _moment(row.created_at)}
        )
    for row in bind.execute(sa.text("SELECT id, user_id, created_at FROM reviews")):
        log_rows.append(
            {"u": row.user_id, "k": "review", "r": row.id, "d": None, "c": _moment(row.created_at)}
        )
    for row in bind.execute(sa.text("SELECT user_id, created_at FROM push_subscriptions")):
        log_rows.append(
            {"u": row.user_id, "k": "push_on", "r": None, "d": None, "c": _moment(row.created_at)}
        )
    for user_id, moment in linked.items():
        log_rows.append({"u": user_id, "k": "linked", "r": None, "d": "telegram", "c": moment})
    for user_id, row in users.items():
        if row.bot_blocked_at is not None:
            log_rows.append(
                {"u": user_id, "k": "bot_blocked", "r": None, "d": None,
                 "c": _moment(row.bot_blocked_at)}
            )
        if row.install_offer_sent_at is not None:
            log_rows.append(
                {"u": user_id, "k": "install_offer_sent", "r": None, "d": None,
                 "c": _moment(row.install_offer_sent_at)}
            )
    log_rows = [row for row in log_rows if row["c"] is not None]
    log_rows.sort(key=lambda row: row["c"])
    if log_rows:
        bind.execute(
            sa.text(
                "INSERT INTO activity_log (user_id, kind, ref_id, detail, created_at) "
                "VALUES (:u, :k, :r, :d, :c)"
            ),
            log_rows,
        )

    bind.execute(
        sa.text("INSERT INTO app_config (key, value) VALUES (:k, :v)"),
        [
            {"k": "tracking_since", "v": now.isoformat(timespec="seconds")},
            {"k": "activation_window_days", "v": "3"},
            {"k": "activation_min_days", "v": "2"},
        ],
    )


def downgrade() -> None:
    op.drop_table("app_config")
    op.drop_table("segments")
    op.drop_index("ix_activity_log_user_created", table_name="activity_log")
    op.drop_index("ix_activity_log_kind_created", table_name="activity_log")
    op.drop_table("activity_log")
    op.drop_index("ix_checkin_days_day", table_name="checkin_days")
    op.drop_table("checkin_days")
    with op.batch_alter_table("broadcasts") as batch_op:
        batch_op.alter_column(
            "audience", type_=sa.String(length=200), existing_type=sa.String(length=300)
        )
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("deleted_at")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("is_test")
        batch_op.drop_column("device")
        batch_op.drop_column("signup_platform")
        batch_op.drop_column("source_tag")
        batch_op.drop_column("source")
