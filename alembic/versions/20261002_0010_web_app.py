"""Web app (PWA): web sessions, one-time codes, push, funnel events

Additive only — no existing row is changed except two new nullable user columns:

- `users.first_checkin_at` — first time the user marked a habit as done. Backfilled from
  existing `done` logs, so users who already checked in never get the one-time
  "install the app" offer from the bot;
- `users.install_offer_sent_at` — when the bot sent that offer;
- `web_sessions` — web logins (hashed tokens);
- `auth_codes` — short-lived single-use codes (handoff, bot login);
- `push_subscriptions` — Web Push subscriptions per device;
- `events` — funnel analytics.

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-02 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("first_checkin_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("install_offer_sent_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE users SET first_checkin_at = (
            SELECT MIN(COALESCE(task_logs.marked_at, task_logs.created_at)) FROM task_logs
            WHERE task_logs.user_id = users.telegram_id AND task_logs.status = 'done'
        )
        """
    )

    op.create_table(
        "web_sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_web_sessions_user_id", "web_sessions", ["user_id"])

    op.create_table(
        "auth_codes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("payload", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_auth_codes_expires_at", "auth_codes", ["expires_at"])

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("endpoint", sa.String(1024), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(255), nullable=False),
        sa.Column("auth", sa.String(255), nullable=False),
        sa.Column("user_agent", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])

    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("event", sa.String(48), nullable=False),
        sa.Column("user_id", sa.BigInteger(), nullable=True),
        sa.Column("anon_id", sa.String(64), nullable=True),
        sa.Column("platform", sa.String(16), nullable=True),
        sa.Column("browser_context", sa.String(16), nullable=True),
        sa.Column("src", sa.String(32), nullable=True),
        sa.Column("props", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_events_event", "events", ["event"])
    op.create_index("ix_events_user_id", "events", ["user_id"])
    op.create_index("ix_events_anon_id", "events", ["anon_id"])
    op.create_index("ix_events_created_at", "events", ["created_at"])


def downgrade() -> None:
    # Web-only accounts (negative ids) and their data stay in users/tasks: a downgrade
    # removes only the new tables and columns, never habits.
    op.drop_table("events")
    op.drop_table("push_subscriptions")
    op.drop_table("auth_codes")
    op.drop_table("web_sessions")
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("install_offer_sent_at")
        batch_op.drop_column("first_checkin_at")
