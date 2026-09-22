"""Подключение к базе данных: async-движок, фабрика сессий, создание таблиц.

API — единственный владелец данных. При старте таблицы создаются по метаданным
моделей (`create_all`, idempotent), чтобы локальный запуск на SQLite работал без
миграций; для версионирования схемы и продакшена — alembic (см. alembic/).

С базой одновременно работают несколько процессов (API пишет, бот читает
напоминания), поэтому SQLite переводится в режим WAL: читатели не блокируют
писателя и наоборот, а занятая база ждёт `SQLITE_BUSY_TIMEOUT_SECONDS`, а не сразу
отвечает «database is locked». Для серверных СУБД — пул соединений с проверкой
соединения перед выдачей (переживает перезапуск СУБД).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import event, text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from tma.backend.models import Base

# Сколько секунд ждать, пока SQLite занята другим процессом, прежде чем вернуть ошибку.
SQLITE_BUSY_TIMEOUT_SECONDS = 15
# Соединения с серверной СУБД старше этого (в секундах) пересоздаются — их могли
# закрыть на стороне сервера или балансировщика.
POOL_RECYCLE_SECONDS = 1800


def _enable_sqlite_wal(dbapi_connection: Any, _record: Any) -> None:
    """WAL и `synchronous=NORMAL` на каждом новом соединении SQLite (надёжно для WAL и
    заметно быстрее записи по умолчанию). Режим WAL хранится в самом файле базы."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
    finally:
        cursor.close()


class Database:
    """Async-движок и фабрика сессий."""

    def __init__(self, database_url: str, pool_size: int = 10, max_overflow: int = 20) -> None:
        is_sqlite = make_url(database_url).get_backend_name() == "sqlite"
        options: dict[str, Any] = (
            {"connect_args": {"timeout": SQLITE_BUSY_TIMEOUT_SECONDS}}
            if is_sqlite
            else {
                "pool_size": pool_size,
                "max_overflow": max_overflow,
                "pool_pre_ping": True,
                "pool_recycle": POOL_RECYCLE_SECONDS,
            }
        )
        self._engine = create_async_engine(database_url, **options)
        if is_sqlite:
            event.listen(self._engine.sync_engine, "connect", _enable_sqlite_wal)
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

    async def ping(self) -> None:
        """Проверить, что база отвечает (для проверки живости); ошибка — исключение."""
        async with self._engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    async def dispose(self) -> None:
        """Закрыть пул соединений при остановке приложения."""
        await self._engine.dispose()
