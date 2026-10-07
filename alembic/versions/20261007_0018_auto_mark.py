"""Habit auto check-off

- `tasks.auto_mark` — «Автоотметка»: привычка без напоминания отмечается
  выполненной с началом дня, с напоминанием — сразу после него (бот, bot/reminders.py).

Существующим привычкам выключено.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-07 22:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(
            sa.Column("auto_mark", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("auto_mark")
