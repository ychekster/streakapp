"""«Цель по времени» и таймер

- `tasks.goal_unit` — в чём цель привычки: times (разы) или seconds (цель и счёт дня — в
  секундах, время копит таймер). Уже существующим — times.
- `task_schedule_periods.goal_unit` — то же у прежних расписаний.
- `running_timers` — идущий таймер пользователя (не больше одного): привычка, день, с
  какого момента идёт и когда наберётся цель (уведомление бота).

Revision ID: 0036
Revises: 0035
Create Date: 2026-10-27 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0036"
down_revision: Union[str, None] = "0035"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(
            sa.Column("goal_unit", sa.String(length=8), server_default="times", nullable=False)
        )
    with op.batch_alter_table("task_schedule_periods") as batch:
        batch.add_column(
            sa.Column("goal_unit", sa.String(length=8), server_default="times", nullable=False)
        )
    op.create_table(
        "running_timers",
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("notify_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.create_index("ix_running_timers_notify_at", "running_timers", ["notify_at"])


def downgrade() -> None:
    op.drop_index("ix_running_timers_notify_at", table_name="running_timers")
    op.drop_table("running_timers")
    with op.batch_alter_table("task_schedule_periods") as batch:
        batch.drop_column("goal_unit")
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("goal_unit")
