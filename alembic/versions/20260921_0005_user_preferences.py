"""User preferences: language, theme, mark as yesterday

На экране «Настройки» появились язык, тема оформления и режим «Отмечать за вчера»:

- `users.language` — язык интерфейса (`ru` / `en`). У существующих пользователей —
  `ru`: другого языка у приложения до сих пор не было;
- `users.theme` — тема оформления (`light` / `dark` / `system`), у всех — `light`, как
  приложение выглядело до сих пор;
- `users.mark_yesterday` — отметки ставятся за вчерашний день; по умолчанию выключено.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-21 00:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("language", sa.String(length=8), nullable=False, server_default="ru")
        )
        batch_op.add_column(
            sa.Column("theme", sa.String(length=16), nullable=False, server_default="light")
        )
        batch_op.add_column(
            sa.Column("mark_yesterday", sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("mark_yesterday")
        batch_op.drop_column("theme")
        batch_op.drop_column("language")
