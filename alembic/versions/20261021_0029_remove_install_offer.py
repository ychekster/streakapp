"""Без предложения установить приложение

Бот больше не предлагает установить веб-приложение после первой отметки:
- `users.install_offer_sent_at` удаляется;
- записи `install_offer_sent` из ленты действий удаляются, а у открытий приложения из
  этого предложения (`app_open`, `detail = install_offer`) источник стирается.

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-21 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("DELETE FROM activity_log WHERE kind = 'install_offer_sent'")
    op.execute(
        "UPDATE activity_log SET detail = NULL WHERE kind = 'app_open' AND detail = 'install_offer'"
    )
    with op.batch_alter_table("users") as batch:
        batch.drop_column("install_offer_sent_at")


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("install_offer_sent_at", sa.DateTime(), nullable=True))
