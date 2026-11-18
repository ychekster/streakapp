"""Правки прошлых дней привычки: название, описание, частота и цель одного дня

- таблица `task_day_overrides` — что пользователь поправил в окне дня (удержание дня в
  календаре привычки): название, описание, частоту и цель этого дня вместо настоящих.
  «Сбросить» удаляет строку.

Revision ID: 0050
Revises: 0049
Create Date: 2026-11-18 13:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0050"
down_revision: Union[str, None] = "0049"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_day_overrides",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("description", sa.String(length=200), nullable=True),
        sa.Column("description_set", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("frequency_type", sa.String(length=20), nullable=True),
        sa.Column("days", sa.String(length=64), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("times_per_day", sa.Integer(), nullable=True),
        sa.UniqueConstraint("task_id", "day", name="uq_day_override_task_day"),
    )
    op.create_index("ix_task_day_overrides_task_id", "task_day_overrides", ["task_id"])
    op.create_index("ix_task_day_overrides_user_id", "task_day_overrides", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_task_day_overrides_user_id", table_name="task_day_overrides")
    op.drop_index("ix_task_day_overrides_task_id", table_name="task_day_overrides")
    op.drop_table("task_day_overrides")
