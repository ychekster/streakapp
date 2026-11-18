"""«Подключить ИИ»: OAuth for AI apps and the user's connections (backend/oauth.py).

    GET  /.well-known/oauth-protected-resource[/…]   — RFC 9728 (the MCP endpoint)
    GET  /.well-known/oauth-authorization-server[/…] — RFC 8414
    POST /oauth/register     — dynamic client registration (the AI app does it itself)
    GET  /oauth/authorize    — the browser → the consent page /connect of the frontend
    GET  /oauth/client       — the consent page: which AI asks
    POST /oauth/login/start  — the consent page: "log in via Telegram" through the bot
    POST /oauth/login/poll   — … pending until confirmed; then a consent ticket
    POST /oauth/approve      — «Разрешить»: back to the AI app with the code
    POST /oauth/token        — code or refresh token → a token pair (form-encoded)
    GET  /ai/connections     — Settings → «Подключить ИИ»: the address and connections
    DELETE /ai/connections/{id} — «Отключить»

The metadata is served both at the root and under the API path: AI apps look for it at
`https://<host>/.well-known/…` (nginx sends that prefix here unchanged) and the MCP
endpoint's 401 points at the API path copy.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from loguru import logger

from backend.accounts import TELEGRAM_LOGIN_TTL
from backend.dependencies import RepositoryDep, get_db_user, get_settings
from backend.errors import ApiError
from backend.messaging import send_ai_admin_request
from backend.models import User
from backend.oauth import (
    OAuthError,
    approve,
    authorization_server_metadata,
    check_authorize,
    client_for,
    connection_view,
    poll_login,
    protected_resource_metadata,
    register_client,
    start_login,
    token,
    urls,
    with_query,
)
from backend.repository import Repository, utc_now
from backend.routers.auth import bot_username, client_ip, limit
from backend.schemas import (
    AiConnectionsResponse,
    OAuthApproveRequest,
    OAuthApproveResponse,
    OAuthClientInfo,
    OAuthLoginPoll,
    OAuthLoginStart,
    OAuthLoginStartRequest,
    TokenRequest,
)

router = APIRouter(tags=["ai"])

# Parameters of the authorization request the consent page needs back.
_AUTHORIZE_PARAMS = (
    "response_type",
    "client_id",
    "redirect_uri",
    "code_challenge",
    "code_challenge_method",
    "state",
    "scope",
    "resource",
)
_NO_STORE = {"Cache-Control": "no-store", "Pragma": "no-cache"}


def _oauth_error(exc: OAuthError) -> JSONResponse:
    return JSONResponse(
        {"error": exc.error, "error_description": exc.description},
        status_code=exc.status_code,
        headers=_NO_STORE,
    )


@router.get("/.well-known/oauth-protected-resource", include_in_schema=False)
@router.get("/.well-known/oauth-protected-resource/{rest:path}", include_in_schema=False)
async def protected_resource(request: Request, rest: str = "") -> dict[str, Any]:
    return protected_resource_metadata(get_settings(request))


@router.get("/.well-known/oauth-authorization-server", include_in_schema=False)
@router.get("/.well-known/oauth-authorization-server/{rest:path}", include_in_schema=False)
async def authorization_server(request: Request, rest: str = "") -> dict[str, Any]:
    return authorization_server_metadata(get_settings(request))


@router.post("/oauth/register", status_code=201, response_model=None)
async def register(request: Request, repo: Repository = RepositoryDep) -> JSONResponse:
    """The AI app registers itself (RFC 7591)."""
    limit(request, request.app.state.guest_limiter, f"oauth-register:{client_ip(request)}")
    try:
        payload = await request.json()
    except ValueError:
        payload = None
    if not isinstance(payload, dict):
        return _oauth_error(OAuthError("invalid_client_metadata", "JSON object expected"))
    try:
        answer = await register_client(repo, payload)
    except OAuthError as exc:
        return _oauth_error(exc)
    return JSONResponse(answer, status_code=201, headers=_NO_STORE)


@router.get("/oauth/authorize", include_in_schema=False)
async def authorize(request: Request, repo: Repository = RepositoryDep) -> RedirectResponse:
    """The browser comes here from the AI app; it goes on to the consent page with the
    same request, or with `error=<code>` the page explains."""
    settings = get_settings(request)
    params = {
        key: value for key in _AUTHORIZE_PARAMS if (value := request.query_params.get(key))
    }
    try:
        await check_authorize(repo, params)
    except ApiError as exc:
        return RedirectResponse(with_query(urls(settings).connect, {"error": exc.code}), 302)
    return RedirectResponse(with_query(urls(settings).connect, params), 302)


@router.get("/oauth/client", response_model=OAuthClientInfo)
async def client_info(
    client_id: str = Query(..., max_length=64),
    redirect_uri: str = Query(..., max_length=500),
    repo: Repository = RepositoryDep,
) -> OAuthClientInfo:
    client = await client_for(repo, client_id, redirect_uri)
    return OAuthClientInfo(
        name=client.client_name, redirect_host=urlsplit(redirect_uri).hostname or ""
    )


@router.post("/oauth/login/start", response_model=OAuthLoginStart)
async def login_start(
    payload: OAuthLoginStartRequest, request: Request, repo: Repository = RepositoryDep
) -> OAuthLoginStart:
    """«Разрешить» on the consent page: the page opens the bot with the code, the person
    confirms there («Подключить Claude к Knot?»), the page polls `/oauth/login/poll`."""
    limit(request, request.app.state.guest_limiter, f"oauth-login:{client_ip(request)}")
    client = await client_for(repo, payload.client_id, payload.redirect_uri)
    code = await start_login(repo, get_settings(request), client, payload.redirect_uri)
    username = await bot_username(request)
    start = f"login_{code}"
    return OAuthLoginStart(
        code=code,
        app_url=f"tg://resolve?domain={username}&start={start}",
        web_url=f"https://t.me/{username}?start={start}",
        expires_in=int(TELEGRAM_LOGIN_TTL.total_seconds()),
    )


@router.post("/oauth/login/poll", response_model=OAuthLoginPoll)
async def login_poll(
    payload: TokenRequest, request: Request, repo: Repository = RepositoryDep
) -> OAuthLoginPoll:
    limit(request, request.app.state.address_limiter, f"oauth-poll:{client_ip(request)}")
    return await poll_login(repo, get_settings(request), payload.token)


@router.post("/oauth/approve", response_model=OAuthApproveResponse)
async def approve_connection(
    payload: OAuthApproveRequest, request: Request, repo: Repository = RepositoryDep
) -> OAuthApproveResponse:
    """«Разрешить»: the page sends the browser to `redirect`. An administrator who asked
    for statistics gets the bot's question (after the commit: the code must exist when
    the button is pressed)."""
    approval = await approve(
        repo,
        get_settings(request),
        ticket=payload.ticket,
        client_id=payload.client_id,
        redirect_uri=payload.redirect_uri,
        code_challenge=payload.code_challenge,
        state=payload.state,
        admin=payload.admin,
    )
    if approval.admin_code is not None:
        user = await repo.get_user(approval.user_id)
        language = user.language if user is not None else ""
        await repo.commit()
        undelivered = await send_ai_admin_request(
            request.app.state.bot, approval.user_id, language, approval.client_name, approval.admin_code
        )
        if undelivered is not None:
            logger.info("AI statistics request not delivered: {}", undelivered)
    return approval.response


@router.post("/oauth/token", response_model=None)
async def issue_token(request: Request, repo: Repository = RepositoryDep) -> JSONResponse:
    """A token pair for the code (PKCE) or for a refresh token (RFC 6749 §4.1.3, §6)."""
    limit(request, request.app.state.address_limiter, f"oauth-token:{client_ip(request)}")
    form = {key: value for key, value in (await request.form()).items() if isinstance(value, str)}
    try:
        answer = await token(repo, get_settings(request), form)
    except OAuthError as exc:
        return _oauth_error(exc)
    return JSONResponse(answer, headers=_NO_STORE)


@router.get("/ai/connections", response_model=AiConnectionsResponse)
async def read_connections(
    request: Request,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> AiConnectionsResponse:
    connections = await repo.list_ai_connections(db_user.telegram_id, utc_now())
    return AiConnectionsResponse(
        mcp_url=urls(get_settings(request)).mcp,
        connections=[connection_view(connection) for connection in connections],
    )


@router.delete("/ai/connections/{connection_id}", status_code=204, response_class=Response)
async def delete_connection(
    connection_id: int,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """«Отключить»: the AI loses access at once (an unknown id is not an error)."""
    if await repo.delete_ai_connection(db_user.telegram_id, connection_id):
        await repo.log_action(db_user.telegram_id, "ai_disconnected")
    return Response(status_code=204)
