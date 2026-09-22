"""Проверка подписи initData (tma/backend/auth.py)."""

from __future__ import annotations

import time
from urllib.parse import parse_qsl, urlencode

import pytest

from tests.helpers import TEST_BOT_TOKEN, sign_init_data
from tma.backend.auth import InitDataError, verify_init_data


def test_valid_signature_returns_user() -> None:
    user = verify_init_data(sign_init_data(42), TEST_BOT_TOKEN, max_age_seconds=60)
    assert user.id == 42
    assert user.language_code == "ru"


def test_signature_from_another_bot_is_rejected() -> None:
    forged = sign_init_data(42, token="999:another-bot-token")
    with pytest.raises(InitDataError):
        verify_init_data(forged, TEST_BOT_TOKEN)


def test_tampered_user_is_rejected() -> None:
    fields = dict(parse_qsl(sign_init_data(42)))
    fields["user"] = fields["user"].replace('"id":42', '"id":43')
    with pytest.raises(InitDataError):
        verify_init_data(urlencode(fields), TEST_BOT_TOKEN)


def test_expired_signature_is_rejected() -> None:
    old = sign_init_data(42, auth_date=int(time.time()) - 3600)
    with pytest.raises(InitDataError):
        verify_init_data(old, TEST_BOT_TOKEN, max_age_seconds=60)
    # Без ограничения возраста та же подпись действительна.
    assert verify_init_data(old, TEST_BOT_TOKEN, max_age_seconds=0).id == 42


@pytest.mark.parametrize("raw", ["", "user=%7B%7D", "hash=abc"])
def test_malformed_init_data_is_rejected(raw: str) -> None:
    with pytest.raises(InitDataError):
        verify_init_data(raw, TEST_BOT_TOKEN)
