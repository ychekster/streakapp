"""Broadcast audience filters and button

Рассылка получает фильтр получателей вместо сегмента и необязательную кнопку:

- `broadcasts.segment` (ключ одного из четырёх сегментов) → `broadcasts.audience` —
  строка фильтра «признак:значение» через запятую (tma/backend/audience.py), пустая —
  все пользователи. Прежние сегменты переводятся в равные им фильтры, поэтому рассылка,
  прерванная обновлением, продолжится тем же получателям;
- `broadcasts.button` — кнопка под сообщением: "open_app", "review" или NULL (без кнопки,
  как у всех прежних рассылок).

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-30 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Прежний сегмент → равный ему фильтр (миграция не импортирует код приложения, чтобы не
# меняться вместе с ним).
_SEGMENT_FILTERS = {
    "all": "",
    "active_7d": "activity:7d",
    "active_30d": "activity:30d",
    "never_opened": "app:never",
}


def upgrade() -> None:
    with op.batch_alter_table("broadcasts") as batch_op:
        batch_op.alter_column(
            "segment",
            new_column_name="audience",
            existing_type=sa.String(32),
            type_=sa.String(200),
            existing_nullable=False,
            server_default="",
        )
        batch_op.add_column(sa.Column("button", sa.String(16), nullable=True))
    broadcasts = sa.table("broadcasts", sa.column("audience", sa.String))
    for segment, audience in _SEGMENT_FILTERS.items():
        op.execute(
            broadcasts.update()
            .where(broadcasts.c.audience == segment)
            .values(audience=audience)
        )


def downgrade() -> None:
    broadcasts = sa.table("broadcasts", sa.column("audience", sa.String))
    known = {audience: segment for segment, audience in _SEGMENT_FILTERS.items()}
    # Фильтр, которого среди прежних сегментов нет, становится «всем» — ближайшего
    # сегмента для него не найти, а разосланную рассылку это уже не меняет.
    op.execute(
        broadcasts.update()
        .where(broadcasts.c.audience.not_in(list(known)))
        .values(audience="")
    )
    for audience, segment in known.items():
        op.execute(
            broadcasts.update().where(broadcasts.c.audience == audience).values(audience=segment)
        )
    with op.batch_alter_table("broadcasts") as batch_op:
        batch_op.drop_column("button")
        batch_op.alter_column(
            "audience",
            new_column_name="segment",
            existing_type=sa.String(200),
            type_=sa.String(32),
            existing_nullable=False,
            server_default=None,
        )
