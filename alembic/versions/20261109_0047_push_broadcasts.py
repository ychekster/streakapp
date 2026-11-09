"""Рассылка пушами

- `broadcasts.channel` — канал рассылки: `telegram` (сообщение бота, как раньше) или
  `push` (уведомление веб-приложения тем, у кого включены уведомления);
- `broadcasts.title` — заголовок push (у рассылки в Telegram — NULL).

Revision ID: 0047
Revises: 0046
Create Date: 2026-11-09 13:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0047"
down_revision: Union[str, None] = "0046"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("broadcasts") as batch:
        batch.add_column(
            sa.Column(
                "channel", sa.String(length=16), nullable=False, server_default="telegram"
            )
        )
        batch.add_column(sa.Column("title", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("broadcasts") as batch:
        batch.drop_column("title")
        batch.drop_column("channel")
