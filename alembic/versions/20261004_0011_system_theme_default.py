"""System theme by default

Новый пользователь получает системную тему (`system`: как в системе, в Telegram — как в
Telegram) вместо светлой. Меняется только значение по умолчанию у `users.theme`;
сохранённые темы существующих пользователей не трогаются.

Revision ID: 0011
Revises: 0010
Create Date: 2026-10-04 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "theme",
            existing_type=sa.String(length=16),
            existing_nullable=False,
            server_default="system",
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "theme",
            existing_type=sa.String(length=16),
            existing_nullable=False,
            server_default="light",
        )
