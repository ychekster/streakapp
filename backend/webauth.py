"""Web (PWA) authentication primitives — no database, no FastAPI, easy to test.

- Random tokens for web sessions and one-time codes, and their keyed hashes (only the
  hash is stored, so a database leak does not reveal usable tokens).
- Verification of Telegram's web login (Login Widget / oauth.telegram.org) data:

      secret_key = SHA256(bot_token)
      data_check = "\\n".join(f"{k}={v}" for k, v in sorted(fields) if k != "hash")
      valid      = HMAC_SHA256(secret_key, data_check).hex() == hash

  Note the difference from Mini App `initData` (auth.py): there the key is
  HMAC("WebAppData", bot_token); here it is the plain SHA256 of the token.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections.abc import Mapping

from backend.auth import TelegramUser

# Bytes of randomness in session tokens and one-time codes (256 bits).
_TOKEN_BYTES = 32
# Short codes that travel in a Telegram deep link (`/start login_<code>`): the start
# parameter allows at most 64 characters of [A-Za-z0-9_-].
_LINK_CODE_BYTES = 18

# Fields Telegram puts into the web login result.
_TELEGRAM_LOGIN_FIELDS = ("id", "first_name", "last_name", "username", "photo_url", "auth_date")


class TelegramLoginError(Exception):
    """Telegram web login data is missing, forged or too old."""


def new_token() -> str:
    """A random URL-safe token (session token, handoff token, OAuth state)."""
    return secrets.token_urlsafe(_TOKEN_BYTES)


def new_link_code() -> str:
    """A shorter random code that fits a Telegram deep-link start parameter."""
    return secrets.token_urlsafe(_LINK_CODE_BYTES)


def hash_token(secret: bytes, token: str) -> str:
    """Keyed hash of a token, as stored in the database (hex, 64 chars)."""
    return hmac.new(secret, token.encode("utf-8"), hashlib.sha256).hexdigest()


def verify_telegram_login(
    data: Mapping[str, object], bot_token: str, max_age_seconds: int
) -> TelegramUser:
    """Check the signature of Telegram web login data and return the user.

    `max_age_seconds > 0` also rejects old data (by `auth_date`): the login result can
    otherwise be replayed forever.
    """
    received_hash = data.get("hash")
    if not isinstance(received_hash, str) or not received_hash:
        raise TelegramLoginError("no hash")
    fields = {
        key: str(value)
        for key, value in data.items()
        if key != "hash" and key in _TELEGRAM_LOGIN_FIELDS and value is not None
    }
    data_check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    expected = hmac.new(secret_key, data_check.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise TelegramLoginError("signature mismatch")
    auth_date = fields.get("auth_date", "")
    if max_age_seconds > 0:
        if not auth_date.isdigit() or time.time() - int(auth_date) > max_age_seconds:
            raise TelegramLoginError("expired")
    user_id = fields.get("id", "")
    if not user_id.isdigit():
        raise TelegramLoginError("no user id")
    return TelegramUser(
        id=int(user_id),
        first_name=fields.get("first_name"),
        last_name=fields.get("last_name"),
        username=fields.get("username"),
    )
