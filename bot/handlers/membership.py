"""Статус личного чата с ботом: пользователь заблокировал бота или разблокировал его.

Telegram присылает обновление my_chat_member при каждой блокировке («kicked») и
разблокировке («member»). Отметка `users.bot_blocked_at` нужна админ-панели: аналитике
(«заблокировали бота») и рассылкам — заблокировавшим они не отправляются.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.enums import ChatMemberStatus, ChatType
from aiogram.types import ChatMemberUpdated

from tma.backend.database import Database
from tma.backend.repository import Repository

router = Router(name="membership")


@router.my_chat_member(F.chat.type == ChatType.PRIVATE)
async def on_bot_status_changed(event: ChatMemberUpdated, database: Database) -> None:
    """Отметить блокировку бота пользователем или снять отметку при разблокировке."""
    blocked = event.new_chat_member.status == ChatMemberStatus.KICKED
    async with database.session_factory() as session:
        await Repository(session).set_bot_blocked([event.from_user.id], blocked=blocked)
        await session.commit()
