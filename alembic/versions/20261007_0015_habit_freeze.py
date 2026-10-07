"""Habit freeze

- `tasks.frozen_since` — с какого дня привычка заморожена (NULL — не заморожена): пропуски
  не прерывают серию, отмечать нельзя, напоминания не приходят.
- `task_freezes` — прошедшие заморозки (`start_date` … `end_date`, не включая его): их
  дни показываются в сетке привычки и после разморозки.

Существующие привычки не заморожены.

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-07 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("frozen_since", sa.Date(), nullable=True))
    op.create_table(
        "task_freezes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
    )
    op.create_index("ix_task_freezes_task_id", "task_freezes", ["task_id"])
    op.create_index("ix_task_freezes_user_id", "task_freezes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_task_freezes_user_id", table_name="task_freezes")
    op.drop_index("ix_task_freezes_task_id", table_name="task_freezes")
    op.drop_table("task_freezes")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("frozen_since")
