"""Sign in with Google — the OAuth 2.0 authorization code flow, server side.

The app sends the browser to Google (`authorization_url`); Google sends it back to
`/auth/google/callback` with a code, which the API exchanges for an ID token using the
client secret. The ID token arrives straight from Google's token endpoint over TLS, so
per OpenID Connect Core §3.1.3.7 its issuer, audience and expiry are checked, but not
its signature (TLS already proves where it came from).

A redirect (not a popup or Google's JS button) works the same in the installed app, in
a normal browser tab and from Telegram (which opens it in the phone's browser): Google
does not allow its login inside embedded webviews such as Telegram's.
"""

from __future__ import annotations

import base64
import json
import time
from urllib.parse import urlencode

import aiohttp

from tma.backend.accounts import PROVIDER_GOOGLE, LoginProfile
from tma.backend.config import Settings

_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_ISSUERS = ("accounts.google.com", "https://accounts.google.com")
_TIMEOUT = aiohttp.ClientTimeout(total=15)


class GoogleAuthError(Exception):
    """Google did not confirm the login."""


def redirect_uri(settings: Settings) -> str:
    """The callback registered in Google Cloud Console (Authorized redirect URIs)."""
    return f"{settings.web_base_url}{settings.public_api_path}/auth/google/callback"


def authorization_url(settings: Settings, state: str) -> str:
    """Where to send the browser to sign in with Google."""
    query = urlencode(
        {
            "client_id": settings.google_client_id,
            "redirect_uri": redirect_uri(settings),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return f"{_AUTHORIZE_URL}?{query}"


def _claims(id_token: str) -> dict[str, object]:
    """Payload of a JWT (no signature check — see the module docstring)."""
    try:
        payload = id_token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload))
    except (IndexError, ValueError) as exc:
        raise GoogleAuthError("malformed id_token") from exc
    if not isinstance(data, dict):
        raise GoogleAuthError("malformed id_token")
    return data


async def exchange_code(settings: Settings, code: str) -> LoginProfile:
    """Exchange the callback code for the user's Google profile."""
    secret = settings.google_client_secret
    form = {
        "code": code,
        "client_id": settings.google_client_id,
        "client_secret": secret.get_secret_value() if secret is not None else "",
        "redirect_uri": redirect_uri(settings),
        "grant_type": "authorization_code",
    }
    try:
        async with aiohttp.ClientSession(timeout=_TIMEOUT) as http:
            async with http.post(_TOKEN_URL, data=form) as response:
                data = await response.json(content_type=None)
                status = response.status
    except (aiohttp.ClientError, TimeoutError, ValueError) as exc:
        raise GoogleAuthError(f"token request failed: {exc}") from exc
    if status != 200 or not isinstance(data, dict) or not data.get("id_token"):
        raise GoogleAuthError(f"token endpoint answered {status}")

    claims = _claims(str(data["id_token"]))
    if claims.get("aud") != settings.google_client_id:
        raise GoogleAuthError("wrong audience")
    if claims.get("iss") not in _ISSUERS:
        raise GoogleAuthError("wrong issuer")
    expires = claims.get("exp")
    if not isinstance(expires, (int, float)) or expires < time.time():
        raise GoogleAuthError("expired id_token")
    subject = claims.get("sub")
    if not isinstance(subject, str) or not subject:
        raise GoogleAuthError("no subject")
    email = claims.get("email") if claims.get("email_verified") else None
    name = claims.get("name")
    return LoginProfile(
        provider=PROVIDER_GOOGLE,
        provider_user_id=subject,
        email=email if isinstance(email, str) else None,
        display_name=name if isinstance(name, str) else None,
    )
