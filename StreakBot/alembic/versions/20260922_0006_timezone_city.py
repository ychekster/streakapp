"""Time zone city: the city the user picked their time zone by

Часовой пояс теперь выбирается городом из справочника (tma/backend/cities.py), а у
одной зоны много городов: Санкт-Петербург и Москва — обе Europe/Moscow. Чтобы в
настройках был виден выбранный город, он хранится рядом с поясом:

- `users.timezone_city` — id города в справочнике (GeoNames). У существующих
  пользователей пусто: для них показывается город, давший имя зоне, как и раньше.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-22 00:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("timezone_city", sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("timezone_city")
