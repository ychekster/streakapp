"""Задачи (бета): дата и напоминание

- `todos.due_date` — день задачи (NULL — без даты);
- `todos.remind_time` — время напоминания в поясе пользователя (NULL — без напоминания);
- `todos.remind_at` — когда прислать напоминание (UTC без пояса); после отправки — NULL.

Revision ID: 0039
Revises: 0038
Create Date: 2026-11-02 14:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0039"
down_revision: Union[str, None] = "0038"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todos") as batch:
        batch.add_column(sa.Column("due_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("remind_time", sa.Time(), nullable=True))
        batch.add_column(sa.Column("remind_at", sa.DateTime(), nullable=True))
    op.create_index("ix_todos_remind_at", "todos", ["remind_at"])


def downgrade() -> None:
    op.drop_index("ix_todos_remind_at", table_name="todos")
    with op.batch_alter_table("todos") as batch:
        batch.drop_column("remind_at")
        batch.drop_column("remind_time")
        batch.drop_column("due_date")
