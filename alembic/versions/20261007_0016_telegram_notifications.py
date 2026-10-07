"""Telegram notifications setting

- `users.telegram_notifications` — бот присылает в Telegram напоминания и рассылки
  (настройка «Уведомления» в Mini App). Выключено — не присылает; push в веб-приложении
  это не меняет.

Существующим пользователям уведомления включены.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-07 15:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column(
                "telegram_notifications", sa.Boolean(), nullable=False, server_default=sa.true()
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("telegram_notifications")
