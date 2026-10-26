"""Заметки к дням привычки (окно дня в календаре)

- `day_notes` — текст к дню привычки: одна заметка на день, пустая не хранится.

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-26 20:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0034"
down_revision: Union[str, None] = "0033"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "day_notes",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id"), nullable=False),
        sa.Column(
            "user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False
        ),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("task_id", "day", name="uq_day_note_task_day"),
    )
    op.create_index("ix_day_notes_task_id", "day_notes", ["task_id"])
    op.create_index("ix_day_notes_user_id", "day_notes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_day_notes_user_id", table_name="day_notes")
    op.drop_index("ix_day_notes_task_id", table_name="day_notes")
    op.drop_table("day_notes")
