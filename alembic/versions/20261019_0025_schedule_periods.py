"""История расписания привычек

- `task_schedule_periods` — прежние расписания привычки: каждое действовало до дня `until`
  (не включая его). Прошлые дни оцениваются по расписанию, которое было в тот день, —
  смена расписания больше не переписывает прошлое. У существующих привычек истории нет:
  их прошлое считается по текущему расписанию до первой смены.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-19 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_schedule_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("until", sa.Date(), nullable=False),
        sa.Column("frequency_type", sa.String(length=20), nullable=False),
        sa.Column("days", sa.String(length=64), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("times_per_day", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_task_schedule_periods_task_id", "task_schedule_periods", ["task_id"])
    op.create_index("ix_task_schedule_periods_user_id", "task_schedule_periods", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_task_schedule_periods_user_id", table_name="task_schedule_periods")
    op.drop_index("ix_task_schedule_periods_task_id", table_name="task_schedule_periods")
    op.drop_table("task_schedule_periods")
