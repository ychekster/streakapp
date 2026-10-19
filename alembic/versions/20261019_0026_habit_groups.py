"""Совместные привычки

- `habit_groups` — совместная привычка: владелец и код ссылки-приглашения.
- `habit_group_members` — участники: их привычка (`task_id`), участвует ли сейчас
  (`active`), «Отметки участников» (`notify_marks`), когда вступил.
- `habit_group_periods` — периоды участия (даты в поясе участника, конец не включается).
- `task_logs.group_notified_at` — когда остальным ушло уведомление об отметке.
  Существующим — NULL.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-19 13:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "habit_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "owner_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("invite_code", sa.String(length=16), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_habit_groups_owner_id", "habit_groups", ["owner_id"])
    op.create_table(
        "habit_group_members",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("group_id", sa.Integer(), sa.ForeignKey("habit_groups.id"), nullable=False),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("notify_marks", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("joined_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_member"),
    )
    op.create_index("ix_habit_group_members_group_id", "habit_group_members", ["group_id"])
    op.create_index("ix_habit_group_members_user_id", "habit_group_members", ["user_id"])
    op.create_index("ix_habit_group_members_task_id", "habit_group_members", ["task_id"])
    op.create_table(
        "habit_group_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "member_id",
            sa.Integer(),
            sa.ForeignKey("habit_group_members.id"),
            nullable=False,
        ),
        sa.Column("start_on", sa.Date(), nullable=False),
        sa.Column("end_on", sa.Date(), nullable=True),
    )
    op.create_index("ix_habit_group_periods_member_id", "habit_group_periods", ["member_id"])
    with op.batch_alter_table("task_logs") as batch:
        batch.add_column(sa.Column("group_notified_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("task_logs") as batch:
        batch.drop_column("group_notified_at")
    op.drop_index("ix_habit_group_periods_member_id", table_name="habit_group_periods")
    op.drop_table("habit_group_periods")
    op.drop_index("ix_habit_group_members_task_id", table_name="habit_group_members")
    op.drop_index("ix_habit_group_members_user_id", table_name="habit_group_members")
    op.drop_index("ix_habit_group_members_group_id", table_name="habit_group_members")
    op.drop_table("habit_group_members")
    op.drop_index("ix_habit_groups_owner_id", table_name="habit_groups")
    op.drop_table("habit_groups")
