"""Where the user uses the app

- `users.telegram_seen_at` — последний запрос из Mini App (initData);
- `users.web_seen_at` — последний запрос из веб-приложения (сессия).

Восстанавливаются по старым данным: веб — по сессиям веб-приложения (и последнему визиту
веб-гостя), Telegram — по открытиям из Telegram в ленте действий, а у тех, кто не
заходил в веб-приложение, — по последнему визиту.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-13 12:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Откуда открывают Mini App (constants.APP_OPEN_SOURCES без «push» и «icon» — веб).
_TELEGRAM_OPENS = "('menu', 'welcome', 'reminder', 'broadcast', 'install_offer', 'link')"


def upgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.add_column(sa.Column("telegram_seen_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("web_seen_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE users SET web_seen_at = (
            SELECT MAX(web_sessions.last_used_at) FROM web_sessions
            WHERE web_sessions.user_id = users.telegram_id
        )
        """
    )
    op.execute(
        "UPDATE users SET web_seen_at = COALESCE(last_seen_at, app_opened_at, created_at)"
        " WHERE telegram_id < 0 AND web_seen_at IS NULL"
    )
    # Не заходил в веб-приложение — значит, всё, что он открывал, — Mini App.
    op.execute(
        "UPDATE users SET telegram_seen_at = COALESCE(last_seen_at, app_opened_at)"
        " WHERE telegram_id > 0 AND app_opened_at IS NOT NULL AND web_seen_at IS NULL"
    )
    # Пользовался обоими: последнее открытие из Telegram по ленте, иначе — открыл
    # приложение раньше первой веб-сессии (это была Mini App).
    op.execute(
        f"""
        UPDATE users SET telegram_seen_at = COALESCE(
            (SELECT MAX(activity_log.created_at) FROM activity_log
             WHERE activity_log.user_id = users.telegram_id
               AND activity_log.kind = 'app_open'
               AND activity_log.detail IN {_TELEGRAM_OPENS}),
            CASE WHEN app_opened_at < (
                SELECT MIN(web_sessions.created_at) FROM web_sessions
                WHERE web_sessions.user_id = users.telegram_id
            ) THEN app_opened_at END
        )
        WHERE telegram_id > 0 AND web_seen_at IS NOT NULL
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch:
        batch.drop_column("web_seen_at")
        batch.drop_column("telegram_seen_at")
