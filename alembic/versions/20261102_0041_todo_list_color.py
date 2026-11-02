"""Задачи (бета): цвет списка

- `todo_folders.color` — цвет списка (ключ палитры привычек или «#rrggbb»): кружок отметки
  задач списка его цвета; NULL — серый, как у задач без списка.

Revision ID: 0041
Revises: 0040
Create Date: 2026-11-02 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0041"
down_revision: Union[str, None] = "0040"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todo_folders") as batch:
        batch.add_column(sa.Column("color", sa.String(length=20), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("todo_folders") as batch:
        batch.drop_column("color")
