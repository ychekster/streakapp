"""Задачи (бета): рекомендуемые списки и настройки задач

- `todo_folders.kind` — рекомендуемый список (TODO_FOLDER_KINDS: today, scheduled, undated),
  который наполняется сам; NULL — список пользователя;
- `users.todo_folder_swipe` — «Переключение свайпом» в списках задач;
- `users.todo_checks_right` — «Галочки справа» у задач;
- `users.all_todos_position` — место «Все задачи» среди списков (сколько списков перед ней).

Revision ID: 0040
Revises: 0039
Create Date: 2026-11-02 16:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0040"
down_revision: Union[str, None] = "0039"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("todo_folders") as batch:
        batch.add_column(sa.Column("kind", sa.String(length=16), nullable=True))
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("todo_folder_swipe", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch.add_column(
            sa.Column("todo_checks_right", sa.Boolean(), server_default=sa.false(), nullable=False)
        )
        batch.add_column(
            sa.Column("all_todos_position", sa.Integer(), server_default="0", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("all_todos_position")
        batch.drop_column("todo_checks_right")
        batch.drop_column("todo_folder_swipe")
    with op.batch_alter_table("todo_folders") as batch:
        batch.drop_column("kind")
