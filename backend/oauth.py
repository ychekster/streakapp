"""«Подключить ИИ»: OAuth 2.1 for AI apps (Claude, ChatGPT…) that work with the user's
habits and todos through the MCP endpoint (backend/mcp.py).

The flow, as the AI app drives it:

1. it reads the metadata (`/.well-known/oauth-protected-resource`, then
   `/.well-known/oauth-authorization-server`) and registers itself (`/oauth/register`,
   dynamic client registration: a public client, no secret);
2. it opens `/oauth/authorize` in the browser; that checks the request and sends the
   browser to the app's consent page (`/connect` of the frontend);
3. the page logs the person in through the bot, like the web app does (`/start
   login_<code>`, `accounts.confirm_telegram_login`), but without a guest account: the
   login gives a short consent ticket (`/oauth/login/*`);
4. «Разрешить» (`/oauth/approve`) creates the connection and a single-use code and sends
   the browser back to the AI app;
5. the AI app trades the code for an access and a refresh token (`/oauth/token`, PKCE
   S256 is required) and calls the MCP endpoint with `Authorization: Bearer <access>`.

Tokens and codes are random; only their keyed hashes are stored (as for web sessions).
«Отключить» in Settings deletes the connection, and both tokens stop working at once.

An administrator may also ask for app statistics on the consent page: the admin tools
appear, and work once the administrator allows it under the bot's message
(`confirm_ai_admin`).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from backend.accounts import (
    CODE_TELEGRAM_LOGIN,
    TELEGRAM_LOGIN_TTL,
    code_payload,
    confirmed_telegram,
    create_code,
    find_code,
)
from backend.config import Settings
from backend.errors import ApiError
from backend.models import AiConnection, OAuthClient
from backend.repository import Repository, utc_now
from backend.schemas import AiConnectionView, OAuthApproveResponse, OAuthLoginPoll
from backend.webauth import hash_token, new_token

# One-time code kinds (auth_codes.kind).
CODE_OAUTH = "oauth_code"  # «Разрешить» → the AI app trades it for tokens
CODE_OAUTH_CONSENT = "oauth_consent"  # logged in on the consent page, may press «Разрешить»
CODE_AI_ADMIN = "ai_admin"  # the bot asks the administrator to allow statistics

OAUTH_CODE_TTL = timedelta(minutes=5)
CONSENT_TTL = timedelta(minutes=15)
# The bot's question about statistics waits this long for a press.
AI_ADMIN_TTL = timedelta(days=1)
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=90)
# `last_used_at` is written at most this often (not on every call).
_USE_INTERVAL = timedelta(minutes=5)

SCOPE = "knot"
SCOPE_ADMIN = "knot:admin"

CLIENT_NAME_MAX_LENGTH = 100
REDIRECT_URI_MAX_LENGTH = 500
MAX_REDIRECT_URIS = 5
_LOCAL_HOSTS = ("localhost", "127.0.0.1", "[::1]", "::1")


class OAuthError(Exception):
    """An OAuth error answered in the standard shape: `{"error", "error_description"}`
    (RFC 6749 §5.2), not the app's `{"error": {code, message}}`: AI apps read these."""

    def __init__(self, error: str, description: str, status_code: int = 400) -> None:
        super().__init__(description)
        self.error = error
        self.description = description
        self.status_code = status_code


# --------------------------------------------------------------------------- #
#  Addresses and metadata
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Urls:
    """Public addresses: the API sits under `public_api_path` of the web app's host."""

    base: str
    api: str

    @property
    def issuer(self) -> str:
        return self.api

    @property
    def mcp(self) -> str:
        return f"{self.api}/mcp"

    @property
    def resource_metadata(self) -> str:
        return f"{self.api}/.well-known/oauth-protected-resource"

    @property
    def connect(self) -> str:
        return f"{self.base}/connect"


def urls(settings: Settings) -> Urls:
    base = settings.web_base_url
    path = "/" + settings.public_api_path.strip("/") if settings.public_api_path.strip("/") else ""
    return Urls(base=base, api=f"{base}{path}")


def protected_resource_metadata(settings: Settings) -> dict[str, Any]:
    """RFC 9728: the MCP endpoint and who issues its tokens."""
    where = urls(settings)
    return {
        "resource": where.mcp,
        "authorization_servers": [where.issuer],
        "scopes_supported": [SCOPE, SCOPE_ADMIN],
        "bearer_methods_supported": ["header"],
        "resource_name": "Knot",
    }


def authorization_server_metadata(settings: Settings) -> dict[str, Any]:
    """RFC 8414: endpoints of the authorization server."""
    where = urls(settings)
    return {
        "issuer": where.issuer,
        "authorization_endpoint": f"{where.api}/oauth/authorize",
        "token_endpoint": f"{where.api}/oauth/token",
        "registration_endpoint": f"{where.api}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": [SCOPE, SCOPE_ADMIN],
    }


def www_authenticate(settings: Settings) -> str:
    """The header of a 401 from the MCP endpoint: where the AI app finds how to log in."""
    return f'Bearer resource_metadata="{urls(settings).resource_metadata}"'


# --------------------------------------------------------------------------- #
#  Client registration and the authorization request
# --------------------------------------------------------------------------- #


def _valid_redirect(uri: object) -> bool:
    """https anywhere, plain http only to this computer (desktop apps, the inspector)."""
    if not isinstance(uri, str) or not uri or len(uri) > REDIRECT_URI_MAX_LENGTH:
        return False
    parts = urlsplit(uri)
    if parts.fragment or not parts.hostname:
        return False
    if parts.scheme == "https":
        return True
    return parts.scheme == "http" and parts.hostname in _LOCAL_HOSTS


async def register_client(repo: Repository, payload: dict[str, Any]) -> dict[str, Any]:
    """Dynamic client registration (RFC 7591), public clients only."""
    uris = payload.get("redirect_uris")
    if (
        not isinstance(uris, list)
        or not 1 <= len(uris) <= MAX_REDIRECT_URIS
        or not all(_valid_redirect(uri) for uri in uris)
    ):
        raise OAuthError("invalid_redirect_uri", "redirect_uris: https addresses (or localhost)")
    method = payload.get("token_endpoint_auth_method", "none")
    if method != "none":
        raise OAuthError("invalid_client_metadata", "Only public clients (auth method none)")
    name = payload.get("client_name")
    name = name.strip()[:CLIENT_NAME_MAX_LENGTH] if isinstance(name, str) and name.strip() else ""
    name = name or urlsplit(uris[0]).hostname or "AI"
    client = await repo.create_oauth_client(new_token()[:32], name, list(uris), utc_now())
    return {
        "client_id": client.client_id,
        "client_name": client.client_name,
        "redirect_uris": client.redirect_uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "client_id_issued_at": int(client.created_at.timestamp()),
    }


async def client_for(repo: Repository, client_id: str, redirect_uri: str) -> OAuthClient:
    """The registered client, if `redirect_uri` is one of its own (else 400: never send a
    code to an address the client did not register)."""
    client = await repo.get_oauth_client(client_id) if client_id else None
    if client is None:
        raise ApiError(400, "oauth_client_unknown", "Приложение не найдено, подключите его заново")
    if redirect_uri not in client.redirect_uris:
        raise ApiError(400, "oauth_redirect_invalid", "Неверный адрес возврата")
    return client


async def check_authorize(repo: Repository, params: dict[str, str]) -> OAuthClient:
    """`/oauth/authorize` before the consent page: the request must be complete."""
    client = await client_for(repo, params.get("client_id", ""), params.get("redirect_uri", ""))
    if params.get("response_type") != "code":
        raise ApiError(400, "oauth_request_invalid", "response_type: code")
    challenge = params.get("code_challenge", "")
    if params.get("code_challenge_method") != "S256" or not 43 <= len(challenge) <= 128:
        raise ApiError(400, "oauth_request_invalid", "PKCE S256 is required")
    return client


def with_query(url: str, values: dict[str, str | None]) -> str:
    """`url` with `values` added to its query (None: left out)."""
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query += [(key, value) for key, value in values.items() if value is not None]
    return urlunsplit(parts._replace(query=urlencode(query)))


# --------------------------------------------------------------------------- #
#  The consent page: login through the bot, «Разрешить»
# --------------------------------------------------------------------------- #


async def start_login(
    repo: Repository, settings: Settings, client: OAuthClient, redirect_uri: str
) -> str:
    """A "log in via Telegram" code for the bot (`/start login_<code>`), not tied to any
    account yet: the consent page has none. The AI rides along: its name and where its
    answer goes (the bot asks «Подключить Claude к Knot?» and names the site, since the
    name is whatever the app registered with), and its id (the consent ticket approves
    only this AI). That press is the consent, and the page finishes by itself."""
    return await create_code(
        repo,
        settings,
        CODE_TELEGRAM_LOGIN,
        None,
        TELEGRAM_LOGIN_TTL,
        {
            "client": client.client_name,
            "client_id": client.client_id,
            "host": urlsplit(redirect_uri).hostname or "",
        },
        short=True,
    )


def login_client(payload: dict[str, Any]) -> str | None:
    """The AI a bot login code connects (None: an ordinary web app login)."""
    client = payload.get("client")
    return client if isinstance(client, str) and client else None


def login_host(payload: dict[str, Any]) -> str:
    """The site an AI login's answer goes to (claude.ai…); "" if unknown."""
    host = payload.get("host")
    return host if isinstance(host, str) else ""


async def poll_login(repo: Repository, settings: Settings, code: str) -> OAuthLoginPoll:
    """Pending until confirmed in the bot; then a consent ticket for that account. Only
    an existing account can connect an AI (it would have nothing to work with)."""
    found = await find_code(repo, settings, code, CODE_TELEGRAM_LOGIN)
    if found is None or found.user_id is not None:
        raise ApiError(410, "login_expired", "Вход устарел, попробуйте ещё раз")
    profile = confirmed_telegram(found)
    if profile is None:
        return OAuthLoginPoll(status="pending")
    user = await repo.get_user(int(profile.provider_user_id))
    if user is None:
        raise ApiError(404, "no_account", "Сначала откройте Knot в Telegram")
    if user.blocked_at is not None:
        raise ApiError(403, "user_blocked", "Доступ к приложению ограничен")
    if not await repo.use_code(found, utc_now()):
        raise ApiError(410, "login_expired", "Вход устарел, попробуйте ещё раз")
    ticket = await create_code(
        repo,
        settings,
        CODE_OAUTH_CONSENT,
        user.telegram_id,
        CONSENT_TTL,
        {"client_id": code_payload(found).get("client_id")},
    )
    return OAuthLoginPoll(
        status="done",
        ticket=ticket,
        name=user.first_name or (f"@{user.username}" if user.username else None),
        is_admin=await repo.is_admin(user.telegram_id),
    )


@dataclass(frozen=True)
class Approval:
    """«Разрешить» done: the answer for the page, and the bot's question about
    statistics to send (after the commit), if the administrator asked for them."""

    response: OAuthApproveResponse
    user_id: int
    client_name: str
    admin_code: str | None = None


async def approve(
    repo: Repository,
    settings: Settings,
    *,
    ticket: str,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    state: str | None,
    admin: bool,
) -> Approval:
    """Create the connection and the code the AI app trades for tokens. The ticket
    approves only the AI the person confirmed in the bot."""
    found = await find_code(repo, settings, ticket, CODE_OAUTH_CONSENT)
    if (
        found is None
        or found.user_id is None
        or code_payload(found).get("client_id") != client_id
    ):
        raise ApiError(410, "login_expired", "Вход устарел, попробуйте ещё раз")
    client = await client_for(repo, client_id, redirect_uri)
    user = await repo.get_user(found.user_id)
    now = utc_now()
    if user is None or user.blocked_at is not None or not await repo.use_code(found, now):
        raise ApiError(410, "login_expired", "Вход устарел, попробуйте ещё раз")
    wants_admin = admin and await repo.is_admin(user.telegram_id)
    connection = await repo.create_ai_connection(
        user.telegram_id, client.client_id, client.client_name, now
    )
    connection.admin_requested = wants_admin
    code = await create_code(
        repo,
        settings,
        CODE_OAUTH,
        user.telegram_id,
        OAUTH_CODE_TTL,
        {
            "connection": connection.id,
            "client_id": client.client_id,
            "redirect_uri": redirect_uri,
            "challenge": code_challenge,
        },
    )
    admin_code = None
    if wants_admin:
        admin_code = await create_code(
            repo,
            settings,
            CODE_AI_ADMIN,
            user.telegram_id,
            AI_ADMIN_TTL,
            {"connection": connection.id},
            short=True,
        )
    await repo.log_action(user.telegram_id, "ai_connected", detail=client.client_name)
    return Approval(
        response=OAuthApproveResponse(
            redirect=with_query(redirect_uri, {"code": code, "state": state}),
            admin_pending=wants_admin,
        ),
        user_id=user.telegram_id,
        client_name=client.client_name,
        admin_code=admin_code,
    )


# --------------------------------------------------------------------------- #
#  Tokens
# --------------------------------------------------------------------------- #


def _pkce_ok(verifier: str, challenge: str) -> bool:
    if not 43 <= len(verifier) <= 128:
        return False
    digest = hashlib.sha256(verifier.encode("ascii", "ignore")).digest()
    expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return hmac.compare_digest(expected, challenge)


async def _issue(
    repo: Repository, settings: Settings, connection: AiConnection, expected_refresh: str | None
) -> dict[str, Any]:
    access, refresh = new_token(), new_token()
    now = utc_now()
    if not await repo.set_ai_tokens(
        connection,
        hash_token(settings.auth_secret, access),
        now + ACCESS_TTL,
        hash_token(settings.auth_secret, refresh),
        now + REFRESH_TTL,
        expected_refresh,
    ):
        raise OAuthError("invalid_grant", "The grant was already used")
    return {
        "access_token": access,
        "token_type": "Bearer",
        "expires_in": int(ACCESS_TTL.total_seconds()),
        "refresh_token": refresh,
        "scope": f"{SCOPE} {SCOPE_ADMIN}" if connection.admin_requested else SCOPE,
    }


async def token(repo: Repository, settings: Settings, form: dict[str, str]) -> dict[str, Any]:
    """`/oauth/token`: the code (with the PKCE verifier) or a refresh token for a new pair.
    A refresh token works once: the answer carries the next one."""
    grant = form.get("grant_type")
    client_id = form.get("client_id", "")
    if grant == "authorization_code":
        found = await find_code(repo, settings, form.get("code", ""), CODE_OAUTH)
        if found is None:
            raise OAuthError("invalid_grant", "The code is unknown, used or expired")
        data = code_payload(found)
        if (
            data.get("client_id") != client_id
            or data.get("redirect_uri") != form.get("redirect_uri")
            or not _pkce_ok(form.get("code_verifier", ""), str(data.get("challenge", "")))
        ):
            raise OAuthError("invalid_grant", "client_id, redirect_uri or code_verifier mismatch")
        if not await repo.use_code(found, utc_now()):
            raise OAuthError("invalid_grant", "The code was already used")
        connection_id = data.get("connection")
        connection = (
            await repo.get_ai_connection(connection_id) if isinstance(connection_id, int) else None
        )
        if connection is None or connection.refresh_hash is not None:
            raise OAuthError("invalid_grant", "The connection was removed")
        issued = await _issue(repo, settings, connection, None)
        # Connecting the same AI again (Claude registers itself anew each time) replaces
        # the old connection instead of listing it twice.
        await repo.delete_other_ai_connections(connection.user_id, connection.client_name, connection.id)
        await repo.add_event(
            "ai_connected", user_id=connection.user_id, props={"client": connection.client_name[:64]}
        )
        return issued
    if grant == "refresh_token":
        refresh_hash = hash_token(settings.auth_secret, form.get("refresh_token", ""))
        connection = await repo.ai_connection_by_refresh(refresh_hash, utc_now())
        if connection is None or (client_id and connection.client_id != client_id):
            raise OAuthError("invalid_grant", "The refresh token is unknown or expired")
        return await _issue(repo, settings, connection, refresh_hash)
    raise OAuthError("unsupported_grant_type", "authorization_code or refresh_token")


async def resolve_access(
    repo: Repository, settings: Settings, access_token: str
) -> AiConnection | None:
    """The connection of a live access token (None: unknown, expired or disconnected)."""
    if not access_token:
        return None
    now = utc_now()
    connection = await repo.ai_connection_by_access(hash_token(settings.auth_secret, access_token), now)
    if connection is not None and (
        connection.last_used_at is None or now - connection.last_used_at >= _USE_INTERVAL
    ):
        connection.last_used_at = now
    return connection


# --------------------------------------------------------------------------- #
#  Settings and the bot
# --------------------------------------------------------------------------- #


def connection_view(connection: AiConnection) -> AiConnectionView:
    return AiConnectionView(
        id=connection.id,
        client_name=connection.client_name,
        created_at=connection.created_at,
        last_used_at=connection.last_used_at,
        admin=connection.admin_trusted_at is not None,
    )


async def admin_allowed(repo: Repository, connection: AiConnection) -> bool:
    """The admin tools work: asked for, allowed in the bot, still an administrator."""
    return connection.admin_trusted_at is not None and await repo.is_admin(connection.user_id)


async def confirm_ai_admin(
    repo: Repository, settings: Settings, code: str, telegram_id: int
) -> bool:
    """The bot's «Разрешить»: the connection may read app statistics. Only the
    administrator it was sent to, once, while the code is live."""
    found = await find_code(repo, settings, code, CODE_AI_ADMIN)
    if found is None or found.user_id != telegram_id or not await repo.is_admin(telegram_id):
        return False
    connection_id = code_payload(found).get("connection")
    connection = (
        await repo.get_ai_connection(connection_id) if isinstance(connection_id, int) else None
    )
    if connection is None or connection.user_id != telegram_id or not connection.admin_requested:
        return False
    now = utc_now()
    if not await repo.use_code(found, now):
        return False
    connection.admin_trusted_at = now
    await repo.log_action(telegram_id, "ai_admin", detail=connection.client_name)
    return True


async def decline_ai_admin(
    repo: Repository, settings: Settings, code: str, telegram_id: int
) -> None:
    """The bot's «Отклонить»: the request is spent; the connection keeps working without
    statistics."""
    found = await find_code(repo, settings, code, CODE_AI_ADMIN)
    if found is not None and found.user_id == telegram_id:
        await repo.use_code(found, utc_now())

