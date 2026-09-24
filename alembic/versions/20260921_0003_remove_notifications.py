"""Remove notifications and in-chat onboarding

Бот больше не присылает уведомлений и не проводит регистрацию в чате — вся работа
идёт в Mini App. Удаляются колонки, которые обслуживали только это:

- `users.morning_time`, `users.evening_time` — время утреннего/вечернего дайджеста;
- `users.is_registered` — флаг завершённого онбординга в боте;
- `users.is_active` — флаг «бот не заблокирован» (для рассылки уведомлений);
- `tasks.reminder_time` — время напоминания о задаче.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-21 00:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Batch-режим пересоздаёт таблицу в SQLite (на PostgreSQL выполняется обычный
    # ALTER TABLE ... DROP COLUMN), сохраняя остальные колонки, индексы и ключи.
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("morning_time")
        batch_op.drop_column("evening_time")
        batch_op.drop_column("is_registered")
        batch_op.drop_column("is_active")

    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_column("reminder_time")


def downgrade() -> None:
    # Возвращаем колонки (сохранённые в них значения при этом не восстанавливаются:
    # время уведомлений и напоминаний пусто, все пользователи — активные и
    # зарегистрированные, чтобы прежний бот не отправил их в онбординг заново).
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("reminder_time", sa.Time(), nullable=True))

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("morning_time", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("evening_time", sa.Time(), nullable=True))
        batch_op.add_column(
            sa.Column("is_registered", sa.Boolean(), nullable=False, server_default=sa.true())
        )
        batch_op.add_column(
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true())
        )
