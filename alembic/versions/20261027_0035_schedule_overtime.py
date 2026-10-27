"""«Сверх плана» в прежних расписаниях: прошлый день отмечается по своим настройкам

- `task_schedule_periods.overtime` — была ли у расписания «Сверх плана» (больше цели в
  его дни). Уже записанным расписаниям «несколько раз в день» — как сейчас у привычки.

Revision ID: 0035
Revises: 0034
Create Date: 2026-10-27 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0035"
down_revision: Union[str, None] = "0034"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("task_schedule_periods") as batch:
        batch.add_column(
            sa.Column("overtime", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
    op.execute(
        "UPDATE task_schedule_periods SET overtime = ("
        "SELECT tasks.overtime FROM tasks WHERE tasks.id = task_schedule_periods.task_id"
        ") WHERE times_per_day > 1"
    )


def downgrade() -> None:
    with op.batch_alter_table("task_schedule_periods") as batch:
        batch.drop_column("overtime")
