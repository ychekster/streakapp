"""Задачи (бета): «Начинать с задач»

- `users.open_on_todos` — при включённых задачах приложение открывается на вкладке
  «Задачи»; по умолчанию — на «Привычках».

Revision ID: 0042
Revises: 0041
Create Date: 2026-11-03 20:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0042"
down_revision: Union[str, None] = "0041"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("open_on_todos", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("open_on_todos")
