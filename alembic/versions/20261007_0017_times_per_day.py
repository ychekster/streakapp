"""Habit done several times a day

- `tasks.times_per_day` — сколько раз в день нужно выполнить привычку (1 — обычная
  привычка: одно нажатие — день выполнен).
- `task_logs.count` — сколько раз привычка выполнена за день (у обычных отметок — NULL).

Существующие привычки — один раз в день.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-07 20:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(
            sa.Column("times_per_day", sa.Integer(), nullable=False, server_default="1")
        )
    with op.batch_alter_table("task_logs") as batch_op:
        batch_op.add_column(sa.Column("count", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("task_logs") as batch_op:
        batch_op.drop_column("count")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("times_per_day")
