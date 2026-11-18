"""«Названия папок»: во «Все привычки» привычки блоками по папкам

- `users.folder_names` — во «Все привычки» привычки блоками с названиями папок (привычка
  в двух папках — в обоих); по умолчанию выключено. Свайп между папками теперь всегда
  включён, `users.folder_swipe` остаётся ради старых клиентов.

Revision ID: 0049
Revises: 0048
Create Date: 2026-11-18 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0049"
down_revision: Union[str, None] = "0048"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("folder_names", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("folder_names")
