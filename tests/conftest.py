"""Общие фикстуры тестов.

Окружение подменяется до импорта приложения: тестовый токен бота (им же подписывается
initData) и отдельная база во временной папке — настоящие `.env`, токен и
`streakbot.db` тесты не трогают (переменные окружения важнее значений из `.env`).
"""

from __future__ import annotations

import itertools
import os
import tempfile
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest

from tests.helpers import TEST_BOT_TOKEN, sign_init_data

_TMP = Path(tempfile.mkdtemp(prefix="streakbot-tests-"))
os.environ.update(
    {
        "BOT_TOKEN": TEST_BOT_TOKEN,
        "TMA_URL": "https://example.com",
        "DATABASE_URL": f"sqlite+aiosqlite:///{(_TMP / 'api.db').as_posix()}",
        "TMA_DOCS_ENABLED": "false",
        "TMA_RATE_LIMIT_BURST": "60",
        "TMA_RATE_LIMIT_PER_SECOND": "5",
        "TMA_LOG_FILE": "",
    }
)

from fastapi.testclient import TestClient  # noqa: E402 — после подмены окружения

_user_ids = itertools.count(10_000)


@dataclass(frozen=True)
class AuthUser:
    """Пользователь Telegram с подписанной initData для заголовка Authorization."""

    id: int
    headers: dict[str, str]


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    """Клиент API с полным жизненным циклом приложения (база, справочник городов).

    `raise_server_exceptions=False`: ошибка сервера — это ответ 500, как у настоящего
    клиента, а не исключение в тесте.
    """
    from tma.backend.main import app

    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def auth_user(user_id: int, first_name: str = "Test") -> AuthUser:
    """Пользователь `user_id` с подписанной initData."""
    init_data = sign_init_data(user_id, first_name=first_name)
    return AuthUser(id=user_id, headers={"Authorization": f"tma {init_data}"})


def new_user(first_name: str = "Test") -> AuthUser:
    """Новый пользователь: лимит частоты и данные у каждого свои."""
    return auth_user(next(_user_ids), first_name)


@pytest.fixture
def user() -> AuthUser:
    """Новый пользователь на каждый тест."""
    return new_user()


@pytest.fixture
def other_user() -> AuthUser:
    """Второй пользователь — для проверок доступа к чужим данным."""
    return new_user()


@pytest.fixture
def db_url(tmp_path: Path) -> str:
    """Своя база на тест — для тестов слоя данных без HTTP."""
    return f"sqlite+aiosqlite:///{(tmp_path / 'test.db').as_posix()}"
