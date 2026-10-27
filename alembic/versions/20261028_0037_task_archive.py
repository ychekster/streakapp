"""Архив привычек

- `tasks.archived_at` — когда привычку убрали в архив (NULL — не в архиве). Архивная
  работает как обычная, но в приложении её нет в списке привычек и папках, а напоминания
  по ней не приходят.

Revision ID: 0037
Revises: 0036
Create Date: 2026-10-28 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0037"
down_revision: Union[str, None] = "0036"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.add_column(sa.Column("archived_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("tasks") as batch:
        batch.drop_column("archived_at")
