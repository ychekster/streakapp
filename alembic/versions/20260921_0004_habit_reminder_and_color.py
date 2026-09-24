"""Habit reminders and colors

Привычки снова умеют напоминать о себе — теперь напоминание настраивается в Mini App,
а присылает его бот. И у каждой привычки появился свой цвет (тема):

- `tasks.reminder_time` — время напоминания в поясе пользователя (NULL — без
  напоминания). Прежние значения этой колонки удалила миграция 0003, поэтому
  напоминания, заведённые в старом боте, не оживают;
- `tasks.color` — ключ палитры (`blue`, `green`, …); существующие привычки
  получают синий — так они выглядели до появления выбора цвета.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-21 00:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("reminder_time", sa.Time(), nullable=True))
        batch_op.add_column(
            sa.Column("color", sa.String(length=20), nullable=False, server_default="blue")
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("color")
        batch_op.drop_column("reminder_time")
