"""«Подключить ИИ»: Claude, ChatGPT и другие ИИ работают с привычками и задачами (MCP)

- таблица `oauth_clients` — ИИ-приложения, которые зарегистрировались для входа (OAuth
  dynamic client registration): название и адреса возврата;
- таблица `ai_connections` — подключения пользователя: какое приложение, хэши токенов
  доступа и обновления, когда пользовались, разрешена ли статистика (администратор).

Revision ID: 0051
Revises: 0050
Create Date: 2026-11-18 18:00:00

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0051"
down_revision: Union[str, None] = "0050"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "oauth_clients",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("client_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("client_name", sa.String(length=100), nullable=False),
        sa.Column("redirect_uris", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        "ai_connections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.BigInteger(), sa.ForeignKey("users.telegram_id"), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("client_name", sa.String(length=100), nullable=False),
        sa.Column("access_hash", sa.String(length=64), nullable=True, unique=True),
        sa.Column("access_expires_at", sa.DateTime(), nullable=True),
        sa.Column("refresh_hash", sa.String(length=64), nullable=True, unique=True),
        sa.Column("refresh_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("admin_requested", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("admin_trusted_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ai_connections_user_id", "ai_connections", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_connections_user_id", table_name="ai_connections")
    op.drop_table("ai_connections")
    op.drop_table("oauth_clients")
