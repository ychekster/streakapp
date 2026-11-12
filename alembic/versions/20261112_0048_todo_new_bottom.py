"""Задачи: «Новые задачи» сверху или снизу

- `users.todo_new_bottom` — новая задача встаёт в конец блока (True) или в начало
  (False, как было).

Revision ID: 0048
Revises: 0047
Create Date: 2026-11-12 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0048"
down_revision: Union[str, None] = "0047"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("todo_new_bottom", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("todo_new_bottom")
