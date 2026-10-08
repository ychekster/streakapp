"""Several reminders per habit

- `task_reminders` — напоминания привычки после первого: первое (самое раннее) остаётся в
  `tasks.reminder_time`, остальные — здесь, по строке на время. Индекс по времени — бот
  каждую минуту выбирает по нему, как по `tasks.reminder_time` (0007).

Существующим привычкам ничего не переносится: у них по одному напоминанию.

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-08 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "task_reminders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("time", sa.Time(), nullable=False),
    )
    op.create_index("ix_task_reminders_task_id", "task_reminders", ["task_id"])
    op.create_index("ix_task_reminders_user_id", "task_reminders", ["user_id"])
    op.create_index("ix_task_reminders_time", "task_reminders", ["time"])


def downgrade() -> None:
    op.drop_index("ix_task_reminders_time", table_name="task_reminders")
    op.drop_index("ix_task_reminders_user_id", table_name="task_reminders")
    op.drop_index("ix_task_reminders_task_id", table_name="task_reminders")
    op.drop_table("task_reminders")
