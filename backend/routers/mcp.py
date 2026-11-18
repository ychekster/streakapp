"""«Подключить ИИ»: the MCP endpoint (backend/mcp.py) for AI apps.

    POST /mcp — one JSON-RPC message, `Authorization: Bearer <access token>` (oauth.py)
    GET  /mcp — 405: this server opens no event stream

Without a valid token: 401 with `WWW-Authenticate` pointing at the OAuth metadata, which
is how the AI app learns to log in.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from backend import ai_admin_tools, ai_tools
from backend.dependencies import RepositoryDep, _bearer_token, _rate_limit, get_settings
from backend.mcp import PARSE_ERROR, Context, Registry, handle
from backend.oauth import resolve_access, www_authenticate
from backend.repository import Repository

router = APIRouter(tags=["ai"])

REGISTRY = Registry()
ai_tools.register(REGISTRY)
ai_admin_tools.register(REGISTRY)


def _unauthorized(request: Request) -> JSONResponse:
    return JSONResponse(
        {"error": "invalid_token", "error_description": "Connect Knot again"},
        status_code=401,
        headers={"WWW-Authenticate": www_authenticate(get_settings(request))},
    )


@router.post("/mcp", response_model=None)
async def mcp(request: Request, repo: Repository = RepositoryDep) -> Response:
    settings = get_settings(request)
    token = _bearer_token(request.headers.get("authorization"))
    connection = await resolve_access(repo, settings, token or "")
    if connection is None:
        return _unauthorized(request)
    user = await repo.get_user(connection.user_id)
    if user is None or user.blocked_at is not None:
        return _unauthorized(request)
    _rate_limit(request, user.telegram_id)
    try:
        message = json.loads(await request.body())
    except ValueError:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": None, "error": {"code": PARSE_ERROR, "message": "Parse error"}},
            status_code=400,
        )
    ctx = Context(
        repo=repo,
        user=user,
        connection=connection,
        settings=settings,
        admin=connection.admin_requested and await repo.is_admin(user.telegram_id),
    )
    answer = await handle(REGISTRY, ctx, message)
    if answer is None:
        return Response(status_code=202)
    return JSONResponse(answer)


@router.get("/mcp", include_in_schema=False)
@router.delete("/mcp", include_in_schema=False)
async def mcp_no_stream() -> Response:
    return Response(status_code=405, headers={"Allow": "POST"})
