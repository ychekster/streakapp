"""Подключение к базе данных: async-движок, фабрика сессий, создание таблиц.

API — единственный владелец данных. При старте таблицы создаются по метаданным
моделей (`create_all`, idempotent), чтобы локальный запуск на SQLite работал без
миграций; для версионирования схемы и продакшена — alembic (см. alembic/).
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tma.backend.models import Base


class Database:
    """Async-движок и фабрика сессий."""

    def __init__(self, database_url: str) -> None:
        self._engine = create_async_engine(database_url, future=True)
        self.session_factory = async_sessionmaker(
            bind=self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )

    async def create_tables(self) -> None:
        """Создать недостающие таблицы (существующие не изменяются)."""
        async with self._engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def dispose(self) -> None:
        """Закрыть пул соединений при остановке приложения."""
        await self._engine.dispose()
