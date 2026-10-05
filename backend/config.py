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

# Путь к общему `.env` в корне репозитория (уровнем выше: backend/ -> корень).
# Берём абсолютный путь, чтобы конфигурация читалась независимо от текущей рабочей директории.
_PROJECT_ROOT = Path(__file__).resolve().parents[1]
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

    # Адрес Mini App (тот же TMA_URL, что у бота). API он нужен только для кнопки под
    # копией рассылки, которую получает её автор; без него рассылку с кнопкой не создать.
    tma_url: str | None = Field(default=None, alias="TMA_URL")

    # Строка подключения к БД (async-драйвер). Для SQLite путь относительный,
    # поэтому сервер нужно запускать из корня репозитория — см. README.md.
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

    # ------------------------------------------------------------------ #
    #  Web app (PWA) — see docs/WEB_APP_SETUP.md
    # ------------------------------------------------------------------ #

    # Public HTTPS base of the landing and the web app (the same frontend as the Mini
    # App). Empty — TMA_URL. Used for install links, OAuth redirects and push links.
    public_base_url: str = Field(default="", alias="PUBLIC_BASE_URL")
    # Path under which the frontend's server proxies the API (nginx and Vite: /api).
    public_api_path: str = Field(default="/api", alias="PUBLIC_API_PATH")
    # Secret for hashing web session tokens and one-time codes (handoff, login). Empty —
    # derived from BOT_TOKEN (fine locally; set a real one in production). Changing it
    # logs every web user out.
    web_auth_secret: SecretStr | None = Field(default=None, alias="WEB_AUTH_SECRET")
    # Web session lifetime, days; every use extends it (sliding expiry).
    web_session_ttl_days: int = Field(default=180, ge=1, alias="WEB_SESSION_TTL_DAYS")
    # Lifetime of the Telegram → web handoff token, minutes.
    handoff_ttl_minutes: int = Field(default=30, ge=1, alias="HANDOFF_TTL_MINUTES")
    # Bot username without "@" (deep links for "log in via Telegram"). Empty — asked
    # from Telegram (getMe) on first use.
    telegram_bot_username: str = Field(default="", alias="TELEGRAM_BOT_USERNAME")
    # Web Push (VAPID) keys: the public one is handed to browsers, the private one signs
    # pushes (the bot sends reminders with it, the API only a test notification).
    # Generate with scripts/generate_vapid_keys.py. Empty — push off.
    vapid_public_key: str = Field(default="", alias="VAPID_PUBLIC_KEY")
    vapid_private_key: SecretStr | None = Field(default=None, alias="VAPID_PRIVATE_KEY")
    # Contact the push services may use: "mailto:you@example.com" or an https URL.
    vapid_subject: str = Field(default="mailto:admin@example.com", alias="VAPID_SUBJECT")

    @property
    def web_base_url(self) -> str:
        """Public base URL of the web app, without a trailing slash."""
        return (self.public_base_url or self.tma_url or "").rstrip("/")

    @property
    def auth_secret(self) -> bytes:
        """Key for hashing session tokens and one-time codes."""
        if self.web_auth_secret is not None and self.web_auth_secret.get_secret_value():
            return self.web_auth_secret.get_secret_value().encode("utf-8")
        return b"web-auth:" + self.bot_token.get_secret_value().encode("utf-8")

    @property
    def cors_origins(self) -> list[str]:
        """Список источников CORS из строки через запятую."""
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def load_settings() -> Settings:
    """Загрузить и закешировать настройки (`.env` читается один раз за процесс)."""
    return Settings()
