"""Admin panel: activity tracking, admins, reviews, broadcasts

Для админ-панели:

- `users.app_opened_at` — первое открытие приложения (None — только запустил бота),
  `users.last_seen_at` — последний запрос к API, `users.bot_blocked_at` — пользователь
  заблокировал бота, `users.blocked_at` — заблокирован администратором; индексы
  `ix_users_last_seen_at` (активные, сегменты рассылки) и `ix_users_created_at` (список
  пользователей новые сначала);
- `admins` — администраторы; первый — 6422071424 (constants.SEED_ADMIN_IDS);
- `reviews` — отзывы из настроек и ответы на них;
- `user_activity` — дни, в которые пользователь открывал приложение (DAU/WAU/MAU);
- `broadcasts` — рассылки: их ставит API, рассылает бот.

Данные существующих пользователей восстанавливаются, насколько это возможно:
- когда пользователь открыл приложение, база не хранила. Раньше пользователей заводил и
  прежний бот, поэтому точно отличить открывших приложение нельзя; все существующие
  считаются открывшими (`app_opened_at = created_at`) — лучше не прислать рассылку «ещё
  не открывали приложение» тому, кто им пользуется;
- последний визит — самое позднее из `updated_at` и отметок привычек;
- дни активности — дни регистрации и дни, в которые ставились отметки (`marked_at`),
  поэтому графики активности сразу показывают историю.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-22 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Первый администратор (как constants.SEED_ADMIN_IDS; миграция не импортирует код
# приложения, чтобы не меняться вместе с ним).
_SEED_ADMIN_ID = 6422071424
# Значения enum'а статуса рассылки (VARCHAR, native_enum=False в модели).
_BROADCAST_STATUS = ("pending", "sending", "done")


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("app_opened_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("last_seen_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("bot_blocked_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("blocked_at", sa.DateTime(), nullable=True))
    op.create_index("ix_users_last_seen_at", "users", ["last_seen_at"])
    op.create_index("ix_users_created_at", "users", ["created_at"])

    op.execute("UPDATE users SET app_opened_at = created_at, last_seen_at = updated_at")
    op.execute(
        """
        UPDATE users SET last_seen_at = (
            SELECT MAX(task_logs.marked_at) FROM task_logs
            WHERE task_logs.user_id = users.telegram_id
        )
        WHERE (
            SELECT MAX(task_logs.marked_at) FROM task_logs
            WHERE task_logs.user_id = users.telegram_id
        ) > last_seen_at
        """
    )

    op.create_table(
        "admins",
        sa.Column("telegram_id", sa.BigInteger(), primary_key=True),
        sa.Column("added_by", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.execute(f"INSERT INTO admins (telegram_id) VALUES ({_SEED_ADMIN_ID})")

    op.create_table(
        "reviews",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("reply_text", sa.Text(), nullable=True),
        sa.Column("replied_at", sa.DateTime(), nullable=True),
        sa.Column("replied_by", sa.BigInteger(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"]),
    )
    op.create_index("ix_reviews_user_id", "reviews", ["user_id"])

    op.create_table(
        "user_activity",
        sa.Column("user_id", sa.BigInteger(), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.telegram_id"]),
    )
    op.create_index("ix_user_activity_day", "user_activity", ["day"])
    # `date(...)` — функция и SQLite, и PostgreSQL; UNION убирает повторы.
    op.execute(
        """
        INSERT INTO user_activity (user_id, day)
        SELECT user_id, date(marked_at) FROM task_logs
        WHERE marked_at IS NOT NULL
          AND user_id IN (SELECT telegram_id FROM users)
        UNION
        SELECT telegram_id, date(created_at) FROM users
        """
    )

    op.create_table(
        "broadcasts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_by", sa.BigInteger(), nullable=False),
        sa.Column("segment", sa.String(length=32), nullable=False),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("media_type", sa.String(length=16), nullable=True),
        sa.Column("media_file_id", sa.String(length=256), nullable=True),
        sa.Column(
            "status",
            sa.Enum(*_BROADCAST_STATUS, native_enum=False, length=16),
            nullable=False,
            server_default="pending",
        ),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cursor", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_broadcasts_status", "broadcasts", ["status"])


def downgrade() -> None:
    op.drop_index("ix_broadcasts_status", table_name="broadcasts")
    op.drop_table("broadcasts")
    op.drop_index("ix_user_activity_day", table_name="user_activity")
    op.drop_table("user_activity")
    op.drop_index("ix_reviews_user_id", table_name="reviews")
    op.drop_table("reviews")
    op.drop_table("admins")
    op.drop_index("ix_users_created_at", table_name="users")
    op.drop_index("ix_users_last_seen_at", table_name="users")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("blocked_at")
        batch_op.drop_column("bot_blocked_at")
        batch_op.drop_column("last_seen_at")
        batch_op.drop_column("app_opened_at")
