"""Админ-панель в веб-приложении: доверенное устройство

- `web_sessions.admin_trusted_at` — администратор разрешил админ-панель на этом
  устройстве кнопкой под сообщением бота; NULL — сессия прав администратора не даёт.

Revision ID: 0044
Revises: 0043
Create Date: 2026-11-05 20:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0044"
down_revision: Union[str, None] = "0043"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("web_sessions") as batch:
        batch.add_column(sa.Column("admin_trusted_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("web_sessions") as batch:
        batch.drop_column("admin_trusted_at")
