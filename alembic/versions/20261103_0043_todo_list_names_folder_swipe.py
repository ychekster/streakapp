"""Задачи (бета): «Скрыть названия списков»; свайп по папкам — по умолчанию

- `users.todo_hide_list_names` — в «Все задачи» и рекомендуемых списках задачи разных
  списков отдельными блоками, без названий; по умолчанию названия видны;
- `users.folder_swipe` — у новых пользователей включено (у прежних — как было).

Revision ID: 0043
Revises: 0042
Create Date: 2026-11-03 21:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0043"
down_revision: Union[str, None] = "0042"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column(
                "todo_hide_list_names", sa.Boolean(), server_default=sa.false(), nullable=False
            )
        )
        batch.alter_column(
            "folder_swipe",
            existing_type=sa.Boolean(),
            existing_nullable=False,
            server_default=sa.true(),
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.alter_column(
            "folder_swipe",
            existing_type=sa.Boolean(),
            existing_nullable=False,
            server_default=sa.false(),
        )
        batch.drop_column("todo_hide_list_names")
