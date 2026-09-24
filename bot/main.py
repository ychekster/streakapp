"""Точка входа StreakBot.

Запуск: ``python -m bot.main`` (после заполнения .env).

Бот отвечает на /start приветствием с кнопкой запуска Mini App, присылает
напоминания о привычках (bot/reminders.py) и рассылки из админ-панели
(bot/broadcasts.py). Вся работа с привычками идёт в приложении (см. tma/): базу
данных ведёт API, а бот читает из неё напоминания и рассылки и отмечает в ней, кто
запускал бота, кто его заблокировал и как идёт рассылка.

Последовательность: конфиг → логирование → Bot/Dispatcher → роутеры (/start, статус
чата) → меню бота (кнопка Mini App, без списка команд) → циклы напоминаний и рассылок
с общим темпом отправки → polling.
"""

from __future__ import annotations

import asyncio
import contextlib
import sys
from pathlib import Path

from aiogram import Bot, Dispatcher
from aiogram.types import ErrorEvent, MenuButtonWebApp, WebAppInfo
from loguru import logger

from bot.broadcasts import run_broadcasts
from bot.config import Config, load_config
from bot.constants import MENU_BUTTON_TEXT
from bot.handlers import membership, start
from bot.pacing import SEND_RATE, Pacer
from bot.reminders import run_reminders
from tma.backend.database import Database


def setup_logging(config: Config) -> None:
    """Настроить loguru: вывод в stderr и ротация в файл.

    `diagnose=False` обязателен: иначе loguru печатает в трейсбэке значения всех
    переменных, а среди них — URL запроса к Bot API с токеном бота.
    """
    logger.remove()
    logger.add(sys.stderr, level=config.log_level, enqueue=True, diagnose=False)
    log_path = Path(config.log_file)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    logger.add(
        config.log_file,
        level=config.log_level,
        rotation="10 MB",
        retention="14 days",
        encoding="utf-8",
        enqueue=True,
        diagnose=False,
    )


def register_error_handler(dp: Dispatcher) -> None:
    """Глобальный обработчик ошибок: записать исключение в лог."""

    @dp.errors()
    async def on_error(event: ErrorEvent) -> bool:
        logger.opt(exception=event.exception).error(
            "Unhandled error while processing update: {}", event.exception
        )
        return True


async def setup_bot_menu(bot: Bot, tma_url: str) -> None:
    """Кнопка Mini App слева от поля ввода и пустой список команд.

    Список команд, зарегистрированный прежними версиями бота, хранится на стороне
    Telegram — его нужно явно удалить, иначе пользователи продолжат видеть
    несуществующие команды. Сбой здесь не критичен для работы бота.
    """
    try:
        await bot.delete_my_commands()
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text=MENU_BUTTON_TEXT, web_app=WebAppInfo(url=tma_url))
        )
    except Exception as exc:  # noqa: BLE001 — меню не критично для работы
        logger.warning("Could not set up bot menu: {}", exc)


async def main() -> None:
    """Инициализировать и запустить бота."""
    config = load_config()
    setup_logging(config)
    logger.info("Starting StreakBot...")

    bot = Bot(token=config.bot_token.get_secret_value())
    dp = Dispatcher()
    database = Database(config.database_url)

    # Проброс конфига и базы в хендлеры через workflow_data.
    dp["config"] = config
    dp["database"] = database

    # Типы обновлений для polling aiogram выводит из роутеров: с `membership` бот
    # получает и my_chat_member (блокировку и разблокировку бота).
    dp.include_router(start.router)
    dp.include_router(membership.router)
    register_error_handler(dp)

    await setup_bot_menu(bot, config.tma_url)

    # Один темп отправки на напоминания и рассылки — лимит Bot API общий (см. pacing.py).
    pacer = Pacer(SEND_RATE)
    loops = [
        asyncio.create_task(run_reminders(bot, database, pacer, config.tma_url)),
        asyncio.create_task(run_broadcasts(bot, database, pacer)),
    ]
    logger.info("StreakBot is up and polling")

    try:
        await dp.start_polling(bot)
    finally:
        for loop in loops:
            loop.cancel()
        for loop in loops:
            with contextlib.suppress(asyncio.CancelledError):
                await loop
        await database.dispose()
        await bot.session.close()
        logger.info("StreakBot stopped")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutdown requested")
