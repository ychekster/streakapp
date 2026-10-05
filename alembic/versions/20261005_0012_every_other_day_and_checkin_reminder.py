"""Every other day habits and the check-in reminder

- `tasks.start_date` — первый день привычки «через день» (дальше — каждый второй день от
  него); у остальных привычек NULL. Новое значение `frequency_type` («every_other_day»)
  отдельной миграции не требует: колонка — VARCHAR без CHECK (см. 0002);
- `users.checkin_reminder_time` / `users.checkin_reminder_days` — напоминание «Пора
  отметить привычки» из настроек: время в поясе пользователя (NULL — выключено) и дни
  недели («mon,wed,fri»). Индекс по времени — бот каждую минуту выбирает по нему, как
  по `tasks.reminder_time` (0007).

Revision ID: 0012
Revises: 0011
Create Date: 2026-10-05 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("start_date", sa.Date(), nullable=True))
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("checkin_reminder_time", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("checkin_reminder_days", sa.String(length=64), nullable=True))
        batch_op.create_index(
            "ix_users_checkin_reminder_time", ["checkin_reminder_time"], unique=False
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_checkin_reminder_time")
        batch_op.drop_column("checkin_reminder_days")
        batch_op.drop_column("checkin_reminder_time")
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("start_date")
