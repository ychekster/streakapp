"""Убран рекомендуемый список задач «Невыполненные»

- `todo_folders` с `kind = 'today'` удаляются: список повторял «Все задачи» без экрана
  остальных. Задачи в такой папке (их там быть не должно) остаются без папки.

Revision ID: 0045
Revises: 0044
Create Date: 2026-11-06 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0045"
down_revision: Union[str, None] = "0044"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE todos SET folder_id = NULL WHERE folder_id IN "
        "(SELECT id FROM todo_folders WHERE kind = 'today')"
    )
    op.execute("DELETE FROM todo_folders WHERE kind = 'today'")


def downgrade() -> None:
    # Удалённые списки не вернуть; схема не менялась.
    pass
