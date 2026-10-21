"""Фото профиля участников совместных привычек

- `users.photo_id` — file_unique_id текущего фото в Telegram (меняется вместе с фото; по
  нему приложение понимает, что фото новое); NULL — фото нет или ещё не проверяли.
- `users.photo_file_id` — file_id того же фото: по нему бот скачивает картинку.
- `users.photo_checked_at` — когда фото последний раз сверяли с Telegram; NULL — ни разу.

Существующим — NULL: бот сверит фото участников в первые минуты после запуска.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-21 13:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("photo_id", sa.String(length=64), nullable=True))
        batch.add_column(sa.Column("photo_file_id", sa.String(length=255), nullable=True))
        batch.add_column(sa.Column("photo_checked_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("photo_checked_at")
        batch.drop_column("photo_file_id")
        batch.drop_column("photo_id")
