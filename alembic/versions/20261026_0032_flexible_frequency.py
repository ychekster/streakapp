"""Гибкий график: N раз за неделю / месяц / год

- `tasks.period` (`week` / `month` / `year`) и `tasks.period_times` — у привычек с
  частотой `flexible`; у остальных — NULL.
- Те же поля в `task_schedule_periods` (прежние расписания).

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-26 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0032"
down_revision: Union[str, None] = "0031"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table in ("tasks", "task_schedule_periods"):
        with op.batch_alter_table(table) as batch:
            batch.add_column(sa.Column("period", sa.String(length=8), nullable=True))
            batch.add_column(sa.Column("period_times", sa.Integer(), nullable=True))


def downgrade() -> None:
    for table in ("tasks", "task_schedule_periods"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("period_times")
            batch.drop_column("period")
