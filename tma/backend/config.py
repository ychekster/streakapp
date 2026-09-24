"""Конфигурация API-сервера TMA.

Читается из того же `.env`, что и бот (на уровне корня репозитория): `BOT_TOKEN`
общий — им проверяется подпись `initData`. `DATABASE_URL` использует только API
(и alembic). Никаких секретов и магических значений в коде.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Путь к общему `.env` в корне репозитория (на два уровня выше: tma/backend/ -> tma/ -> корень).
# Берём абсолютный путь, чтобы конфигурация читалась независимо от текущей рабочей директории.
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    """Строго типизированные настройки API, читаются из переменных окружения."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Токен бота от @BotFather — используется для проверки подписи initData (HMAC-SHA256).
    # SecretStr: в repr настроек и в трейсбэках логов токен скрыт звёздочками.
    bot_token: SecretStr = Field(..., alias="BOT_TOKEN")

    # Строка подключения к БД (async-драйвер). Для SQLite путь относительный,
    # поэтому сервер нужно запускать из корня репозитория — см. tma/README.md.
    database_url: str = Field(
        default="sqlite+aiosqlite:///./streakbot.db",
        alias="DATABASE_URL",
    )
    # Пул соединений для серверных СУБД (PostgreSQL); у SQLite не используется.
    db_pool_size: int = Field(default=10, ge=1, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=20, ge=0, alias="DB_MAX_OVERFLOW")

    # Хост и порт API-сервера. По умолчанию — только локальный интерфейс: снаружи API
    # доступен через обратный прокси (nginx, туннель), а не напрямую из сети.
    host: str = Field(default="127.0.0.1", alias="TMA_HOST")
    port: int = Field(default=8000, alias="TMA_PORT")

    # Разрешённые источники для CORS (фронтенд обычно на другом домене/порту).
    # Список через запятую; "*" — разрешить любой источник. Авторизация идёт через
    # заголовок (а не cookie), поэтому "*" здесь безопасен.
    allowed_origins: str = Field(default="*", alias="TMA_ALLOWED_ORIGINS")

    # Максимальный возраст initData в секундах (защита от воспроизведения старой
    # подписи). 0 — проверку возраста отключить (оставить только проверку подписи).
    auth_ttl_seconds: int = Field(default=86_400, alias="TMA_AUTH_TTL_SECONDS")

    # Ограничение частоты запросов одного пользователя (token bucket): не больше
    # `burst` запросов подряд, дальше — `per_second` в секунду. 0 — без ограничения.
    rate_limit_burst: int = Field(default=60, ge=0, alias="TMA_RATE_LIMIT_BURST")
    rate_limit_per_second: float = Field(default=5.0, ge=0, alias="TMA_RATE_LIMIT_PER_SECOND")

    # Интерактивная документация API (/docs, /redoc, /openapi.json). По умолчанию
    # выключена: описание всех эндпоинтов не должно быть публичным.
    docs_enabled: bool = Field(default=False, alias="TMA_DOCS_ENABLED")

    # Логи API: уровень и необязательный файл с ротацией (пусто — только stderr).
    log_level: str = Field(default="INFO", alias="TMA_LOG_LEVEL")
    log_file: str = Field(default="", alias="TMA_LOG_FILE")

    @property
    def cors_origins(self) -> list[str]:
        """Список источников CORS из строки через запятую."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def load_settings() -> Settings:
    """Загрузить и закешировать настройки (`.env` читается один раз за процесс)."""
    return Settings()
