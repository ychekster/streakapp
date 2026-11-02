"""Задачи (бета)

- таблица `todo_folders` — папки задач (настройки → «Задачи»): название, место в ряду и
  id, который дало папке устройство (/sync).
- таблица `todos` — разовые задачи: текст, папка (null — без папки), когда выполнена
  (null — открыта) и id устройства.
- `users.show_todos` — «Показывать задачи»: вкладка «Задачи» перед «Привычками».

Revision ID: 0038
Revises: 0037
Create Date: 2026-11-02 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0038"
down_revision: Union[str, None] = "0037"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "todo_folders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("name", sa.String(length=24), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("client_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_todo_folders_user_id", "todo_folders", ["user_id"])
    op.create_index("ix_todo_folders_client_ref", "todo_folders", ["client_ref"])
    op.create_table(
        "todos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("todo_folders.id"), nullable=True),
        sa.Column("text", sa.String(length=500), nullable=False),
        sa.Column("done_at", sa.DateTime(), nullable=True),
        sa.Column("client_ref", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_todos_user_id", "todos", ["user_id"])
    op.create_index("ix_todos_client_ref", "todos", ["client_ref"])
    with op.batch_alter_table("users") as batch:
        batch.add_column(
            sa.Column("show_todos", sa.Boolean(), server_default=sa.false(), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("show_todos")
    op.drop_index("ix_todos_client_ref", table_name="todos")
    op.drop_index("ix_todos_user_id", table_name="todos")
    op.drop_table("todos")
    op.drop_index("ix_todo_folders_client_ref", table_name="todo_folders")
    op.drop_index("ix_todo_folders_user_id", table_name="todo_folders")
    op.drop_table("todo_folders")
