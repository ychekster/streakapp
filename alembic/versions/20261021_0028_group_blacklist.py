"""Чёрный список групповых привычек

- `habit_group_members.banned_at` — когда владелец исключил участника; пока не NULL,
  вступить по ссылке-приглашению он не может. Убрали из чёрного списка — NULL.

Существующим — NULL: исключённые раньше в чёрный список не попадают.

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-21 15:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("habit_group_members") as batch:
        batch.add_column(sa.Column("banned_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("habit_group_members") as batch:
        batch.drop_column("banned_at")
