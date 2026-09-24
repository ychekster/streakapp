"""Index on the habit reminder time

Бот каждую минуту выбирает привычки, у которых время напоминания совпадает с
текущей минутой где-нибудь на Земле (tma/backend/services.py, due_reminders). Без
индекса это полный просмотр таблицы `tasks` раз в минуту; с ним — выборка по индексу:

- `ix_tasks_reminder_time` — индекс по `tasks.reminder_time`.

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-22 00:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_tasks_reminder_time", "tasks", ["reminder_time"])


def downgrade() -> None:
    op.drop_index("ix_tasks_reminder_time", table_name="tasks")
