"""Типы привычек в папке

- `folders.habit_types` — JSON-список типов (`group` — групповые, `personal` — личные):
  все привычки такого типа попадают в папку сами, и новые тоже. Уже созданным папкам —
  пустой список.

Revision ID: 0031
Revises: 0030
Create Date: 2026-10-21 21:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0031"
down_revision: Union[str, None] = "0030"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("folders") as batch:
        batch.add_column(
            sa.Column("habit_types", sa.JSON(), server_default="[]", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("folders") as batch:
        batch.drop_column("habit_types")
