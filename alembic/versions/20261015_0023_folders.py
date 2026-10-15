"""Папки привычек

- таблица `folders` — папки пользователя (настройки → «Папки»): название, место в ряду
  папок, id привычек в папке (JSON-список) и id, который дало папке устройство (/sync).
- `users.all_habits_position` — место папки «Все привычки» среди папок (сколько папок
  стоит перед ней). Существующим пользователям — 0: она первая.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-15 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "folders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("name", sa.String(length=24), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("task_ids", sa.JSON(), nullable=False),
        sa.Column("client_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_folders_user_id", "folders", ["user_id"])
    op.create_index("ix_folders_client_ref", "folders", ["client_ref"])
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("all_habits_position", sa.Integer(), server_default="0", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("all_habits_position")
    op.drop_index("ix_folders_client_ref", table_name="folders")
    op.drop_index("ix_folders_user_id", table_name="folders")
    op.drop_table("folders")
