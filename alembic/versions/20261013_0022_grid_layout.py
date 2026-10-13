"""«Вид серий» in settings

- `users.grid_layout` — как сетка привычки раскладывает дни: "rolling" (сегодня в правом
  нижнем кружке, дни сдвигаются) или "fixed" (с дня создания от левого верхнего кружка).
  Существующим пользователям — "rolling", как было.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-13 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("grid_layout", sa.String(16), server_default="rolling", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("grid_layout")
