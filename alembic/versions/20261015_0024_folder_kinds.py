"""Рекомендуемые папки и переключение папок свайпом

- `folders.kind` — рекомендуемая папка (unfinished — невыполненные сегодня, today — на
  сегодня): наполняется сама; NULL — привычки выбраны пользователем. Существующим — NULL.
- `users.folder_swipe` — «Переключение свайпом» (настройки → «Папки»): свайп по списку
  привычек открывает соседнюю папку. Существующим — выключено.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-15 15:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("folders") as batch:
        batch.add_column(sa.Column("kind", sa.String(length=16), nullable=True))
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("folder_swipe", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("folder_swipe")
    with op.batch_alter_table("folders") as batch:
        batch.drop_column("kind")
