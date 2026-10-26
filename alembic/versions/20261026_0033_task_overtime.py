"""«Сверх плана»: привычку «несколько раз в день» можно выполнить больше цели

- `tasks.overtime` — счёт не останавливается на цели (до OVERTIME_MAX_COUNT); только
  при `times_per_day` > 1.

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-26 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0033"
down_revision: Union[str, None] = "0032"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(
            sa.Column("overtime", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("overtime")
