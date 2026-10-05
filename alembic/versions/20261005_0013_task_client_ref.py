"""Habit created offline: the device's id for it

- `tasks.client_ref` — id, который устройство дало привычке, созданной без связи
  (`POST /sync`, операция `create`). По нему повтор той же операции (ответ потерялся по
  дороге) не создаёт вторую привычку, а отметки и правки новой привычки, сделанные до
  того, как устройство узнало её настоящий id, находят её. У остальных привычек NULL.

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-05 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.add_column(sa.Column("client_ref", sa.String(length=64), nullable=True))
        batch_op.create_index("ix_tasks_client_ref", ["client_ref"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch_op:
        batch_op.drop_index("ix_tasks_client_ref")
        batch_op.drop_column("client_ref")
