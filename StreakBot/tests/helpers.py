"""Вспомогательные функции тестов: подпись initData так же, как её подписывает Telegram."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

# Тестовый токен: им подписывается initData в тестах и проверяет её API в тестах.
TEST_BOT_TOKEN = "123456:TEST-token-used-only-to-sign-test-init-data"


def sign_init_data(
    user_id: int,
    *,
    auth_date: int | None = None,
    token: str = TEST_BOT_TOKEN,
    language_code: str = "ru",
) -> str:
    """initData с пользователем `user_id`, подписанная по алгоритму Telegram Web Apps."""
    fields = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAHtest",
        "user": json.dumps(
            {"id": user_id, "first_name": "Test", "username": f"user{user_id}",
             "language_code": language_code},
            separators=(",", ":"),
        ),
    }
    data_check = "\n".join(f"{key}={value}" for key, value in sorted(fields.items()))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)
