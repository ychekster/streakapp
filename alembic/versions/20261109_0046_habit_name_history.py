"""История названия и описания привычек

- `task_name_periods` — прежние название и описание привычки: каждые действовали до дня
  `until` (не включая его). Окно дня в календаре показывает, как привычка называлась в
  тот день. У существующих привычек истории нет: их прошлое — с текущим названием.

Revision ID: 0046
Revises: 0045
Create Date: 2026-11-09 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0046"
down_revision: Union[str, None] = "0045"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_name_periods",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("until", sa.Date(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.String(length=200), nullable=True),
    )
    op.create_index("ix_task_name_periods_task_id", "task_name_periods", ["task_id"])
    op.create_index("ix_task_name_periods_user_id", "task_name_periods", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_task_name_periods_user_id", table_name="task_name_periods")
    op.drop_index("ix_task_name_periods_task_id", table_name="task_name_periods")
    op.drop_table("task_name_periods")
