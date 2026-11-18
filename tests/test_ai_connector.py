"""«Подключить ИИ»: OAuth for AI apps (backend/oauth.py) and the MCP endpoint with the
user's and the administrator's tools (backend/mcp.py, ai_tools.py, ai_admin_tools.py).
Bot API is faked (FakeTelegram); the bot's presses are made directly on the database."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import os
import secrets
from collections.abc import Iterator
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient

from tests.conftest import AuthUser, auth_user, new_user
from tests.fake_telegram import FakeTelegram
from backend.accounts import confirm_telegram_login
from backend.config import load_settings
from backend.constants import SEED_ADMIN_IDS
from backend.database import Database
from backend.messaging import AI_ADMIN_ALLOW
from backend.oauth import confirm_ai_admin
from backend.ratelimit import RateLimiter
from backend.repository import Repository

REDIRECT = "https://claude.ai/api/mcp/auth_callback"
# The public address in this environment (PUBLIC_BASE_URL or TMA_URL).
BASE = load_settings().web_base_url


@pytest.fixture(autouse=True)
def _no_anonymous_limits(client: TestClient) -> Iterator[None]:
    """All test requests come from one address: lift the per-address limits."""
    state = client.app.state
    saved = state.guest_limiter, state.address_limiter
    state.guest_limiter = state.address_limiter = RateLimiter(0, 0)
    state.bot_username = "test_bot"
    yield
    state.guest_limiter, state.address_limiter = saved


@pytest.fixture
def telegram(client: TestClient) -> Iterator[FakeTelegram]:
    fake = FakeTelegram()
    original = client.app.state.bot
    client.app.state.bot = fake
    yield fake
    client.app.state.bot = original


def _run(coroutine_factory):
    """DB work as the bot process would do it, on its own connection."""

    async def run():
        database = Database(os.environ["DATABASE_URL"])
        try:
            async with database.session_factory() as session:
                result = await coroutine_factory(Repository(session))
                await session.commit()
                return result
        finally:
            await database.dispose()

    return asyncio.run(run())


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _register(client: TestClient, name: str = "Claude") -> str:
    response = client.post(
        "/oauth/register", json={"client_name": name, "redirect_uris": [REDIRECT]}
    )
    assert response.status_code == 201, response.text
    return response.json()["client_id"]


def _open_app(client: TestClient, user: AuthUser) -> None:
    assert client.get("/settings", headers=user.headers).status_code == 200


def _start(client: TestClient, client_id: str | None = None) -> str:
    """«Разрешить» on the consent page: a bot login code that names the AI."""
    start = client.post(
        "/oauth/login/start",
        json={"client_id": client_id or _register(client), "redirect_uri": REDIRECT},
    )
    assert start.status_code == 200, start.text
    code = start.json()["code"]
    assert start.json()["web_url"] == f"https://t.me/test_bot?start=login_{code}"
    return code


def _login(client: TestClient, user: AuthUser, client_id: str | None = None) -> dict:
    """The consent page logs in through the bot: start, confirm in the bot, poll."""
    code = _start(client, client_id)
    assert client.post("/oauth/login/poll", json={"token": code}).json()["status"] == "pending"
    assert _run(
        lambda repo: confirm_telegram_login(repo, load_settings(), code, user.id, "u", "User")
    )
    done = client.post("/oauth/login/poll", json={"token": code})
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "done"
    return done.json()


def _connect(client: TestClient, user: AuthUser, *, admin: bool = False) -> dict[str, Any]:
    """The whole flow an AI app drives; returns the token answer (+ client_id)."""
    _open_app(client, user)
    client_id = _register(client)
    verifier, challenge = _pkce()
    authorize = client.get(
        "/oauth/authorize",
        params={
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "xyz",
        },
        follow_redirects=False,
    )
    assert authorize.status_code == 302
    page = urlsplit(authorize.headers["location"])
    assert f"{page.scheme}://{page.netloc}{page.path}" == f"{BASE}/connect"
    assert parse_qs(page.query)["client_id"] == [client_id]

    info = client.get("/oauth/client", params={"client_id": client_id, "redirect_uri": REDIRECT})
    assert info.json() == {"name": "Claude", "redirect_host": "claude.ai"}

    ticket = _login(client, user, client_id)["ticket"]
    approved = client.post(
        "/oauth/approve",
        json={
            "ticket": ticket,
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": challenge,
            "state": "xyz",
            "admin": admin,
        },
    )
    assert approved.status_code == 200, approved.text
    back = urlsplit(approved.json()["redirect"])
    query = parse_qs(back.query)
    assert back.netloc == "claude.ai" and query["state"] == ["xyz"]

    tokens = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": query["code"][0],
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_verifier": verifier,
        },
    )
    assert tokens.status_code == 200, tokens.text
    return {**tokens.json(), "client_id": client_id, "code": query["code"][0], "verifier": verifier}


def _rpc(client: TestClient, token: str, method: str, params: dict | None = None, rpc_id: int = 1):
    return client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "id": rpc_id, "method": method, "params": params or {}},
        headers={"Authorization": f"Bearer {token}"},
    )


def _call(client: TestClient, token: str, tool: str, arguments: dict | None = None) -> dict:
    response = _rpc(client, token, "tools/call", {"name": tool, "arguments": arguments or {}})
    assert response.status_code == 200, response.text
    return response.json()["result"]


def _ok(client: TestClient, token: str, tool: str, arguments: dict | None = None) -> dict:
    result = _call(client, token, tool, arguments)
    assert result["isError"] is False, result
    return result["structuredContent"]


def _tool_names(client: TestClient, token: str) -> set[str]:
    return {tool["name"] for tool in _rpc(client, token, "tools/list").json()["result"]["tools"]}


# --------------------------------------------------------------------------- #
#  OAuth
# --------------------------------------------------------------------------- #


def test_metadata_points_at_the_api(client: TestClient) -> None:
    resource = client.get("/.well-known/oauth-protected-resource/api/mcp").json()
    assert resource["resource"] == f"{BASE}/api/mcp"
    assert resource["authorization_servers"] == [f"{BASE}/api"]
    server = client.get("/.well-known/oauth-authorization-server/api").json()
    assert server == client.get("/.well-known/oauth-authorization-server").json()
    assert server["issuer"] == f"{BASE}/api"
    assert server["token_endpoint"] == f"{BASE}/api/oauth/token"
    assert server["code_challenge_methods_supported"] == ["S256"]


def test_mcp_without_token_says_how_to_log_in(client: TestClient) -> None:
    response = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "ping"})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == (
        f'Bearer resource_metadata="{BASE}/api/.well-known/oauth-protected-resource"'
    )
    assert client.get("/mcp").status_code == 405


def test_register_rejects_bad_redirects(client: TestClient) -> None:
    for uris in ([], ["http://evil.example/cb"], ["javascript:alert(1)"], "x"):
        response = client.post("/oauth/register", json={"redirect_uris": uris})
        assert response.status_code == 400
        assert response.json()["error"] == "invalid_redirect_uri"
    local = client.post("/oauth/register", json={"redirect_uris": ["http://localhost:6274/cb"]})
    assert local.status_code == 201
    assert local.json()["client_name"] == "localhost"


def test_authorize_with_a_bad_request_goes_to_the_page_with_an_error(client: TestClient) -> None:
    client_id = _register(client)
    response = client.get(
        "/oauth/authorize",
        params={"response_type": "code", "client_id": client_id, "redirect_uri": "https://evil.example/cb"},
        follow_redirects=False,
    )
    assert response.headers["location"] == f"{BASE}/connect?error=oauth_redirect_invalid"
    no_pkce = client.get(
        "/oauth/authorize",
        params={"response_type": "code", "client_id": client_id, "redirect_uri": REDIRECT},
        follow_redirects=False,
    )
    assert no_pkce.headers["location"].endswith("error=oauth_request_invalid")


def test_full_flow_and_token_rules(client: TestClient, user: AuthUser) -> None:
    tokens = _connect(client, user)
    assert tokens["token_type"] == "Bearer" and tokens["expires_in"] == 3600
    assert _rpc(client, tokens["access_token"], "ping").json()["result"] == {}

    # The code works once.
    again = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": tokens["code"],
            "client_id": tokens["client_id"],
            "redirect_uri": REDIRECT,
            "code_verifier": tokens["verifier"],
        },
    )
    assert again.status_code == 400 and again.json()["error"] == "invalid_grant"

    # Refresh: a new pair; the old refresh token and access token stop working.
    refreshed = client.post(
        "/oauth/token",
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"], "client_id": tokens["client_id"]},
    )
    assert refreshed.status_code == 200, refreshed.text
    new = refreshed.json()
    assert new["refresh_token"] != tokens["refresh_token"]
    assert _rpc(client, tokens["access_token"], "ping").status_code == 401
    assert _rpc(client, new["access_token"], "ping").status_code == 200
    replay = client.post(
        "/oauth/token",
        data={"grant_type": "refresh_token", "refresh_token": tokens["refresh_token"]},
    )
    assert replay.status_code == 400

    # Settings: the connection is listed; «Отключить» ends the access at once.
    listed = client.get("/ai/connections", headers=user.headers).json()
    assert listed["mcp_url"] == f"{BASE}/api/mcp"
    assert [item["client_name"] for item in listed["connections"]] == ["Claude"]
    connection_id = listed["connections"][0]["id"]
    assert client.delete(f"/ai/connections/{connection_id}", headers=user.headers).status_code == 204
    assert _rpc(client, new["access_token"], "ping").status_code == 401
    assert client.get("/ai/connections", headers=user.headers).json()["connections"] == []


def test_connecting_again_replaces_the_old_connection(client: TestClient, user: AuthUser) -> None:
    first = _connect(client, user)["access_token"]
    second = _connect(client, user)["access_token"]
    listed = client.get("/ai/connections", headers=user.headers).json()["connections"]
    assert [item["client_name"] for item in listed] == ["Claude"]
    assert _rpc(client, first, "ping").status_code == 401
    assert _rpc(client, second, "ping").status_code == 200


def test_bot_login_code_names_the_ai(client: TestClient, user: AuthUser) -> None:
    from backend.accounts import code_payload, telegram_login_request
    from backend.oauth import login_client

    code = _start(client)

    async def named(repo):
        request = await telegram_login_request(repo, load_settings(), code)
        return login_client(code_payload(request)) if request is not None else None

    assert _run(named) == "Claude"


def test_wrong_verifier_is_refused(client: TestClient, user: AuthUser) -> None:
    _open_app(client, user)
    client_id = _register(client)
    _, challenge = _pkce()
    ticket = _login(client, user)["ticket"]
    approved = client.post(
        "/oauth/approve",
        json={"ticket": ticket, "client_id": client_id, "redirect_uri": REDIRECT, "code_challenge": challenge},
    ).json()
    code = parse_qs(urlsplit(approved["redirect"]).query)["code"][0]
    other_verifier, _ = _pkce()
    response = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "client_id": client_id,
            "redirect_uri": REDIRECT,
            "code_verifier": other_verifier,
        },
    )
    assert response.status_code == 400 and response.json()["error"] == "invalid_grant"


def test_ticket_works_once_and_needs_an_account(client: TestClient) -> None:
    stranger = new_user()
    start = _start(client)
    _run(lambda repo: confirm_telegram_login(repo, load_settings(), start, stranger.id, None, "S"))
    response = client.post("/oauth/login/poll", json={"token": start})
    assert response.status_code == 404 and response.json()["error"]["code"] == "no_account"

    user = new_user()
    _open_app(client, user)
    client_id = _register(client)
    _, challenge = _pkce()
    ticket = _login(client, user)["ticket"]
    body = {"ticket": ticket, "client_id": client_id, "redirect_uri": REDIRECT, "code_challenge": challenge}
    assert client.post("/oauth/approve", json=body).status_code == 200
    assert client.post("/oauth/approve", json=body).status_code == 410


def test_web_app_login_code_does_not_open_the_consent_page(client: TestClient) -> None:
    guest = client.post("/auth/guest").json()["token"]
    code = client.post("/auth/telegram/start", headers={"Authorization": f"Bearer {guest}"}).json()["code"]
    assert client.post("/oauth/login/poll", json={"token": code}).status_code == 410


def test_blocked_user_loses_access(client: TestClient, user: AuthUser, telegram: FakeTelegram) -> None:
    token = _connect(client, user)["access_token"]
    seed = auth_user(SEED_ADMIN_IDS[0])
    blocked = client.put(f"/admin/users/{user.id}/block", json={"blocked": True}, headers=seed.headers)
    assert blocked.status_code == 200, blocked.text
    assert _rpc(client, token, "ping").status_code == 401


# --------------------------------------------------------------------------- #
#  MCP: protocol and the user's tools
# --------------------------------------------------------------------------- #


def test_initialize_and_tools(client: TestClient, user: AuthUser) -> None:
    token = _connect(client, user)["access_token"]
    init = _rpc(client, token, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}})
    result = init.json()["result"]
    assert result["protocolVersion"] == "2025-06-18"
    assert result["serverInfo"]["name"] == "knot"
    assert result["capabilities"] == {"tools": {"listChanged": False}}
    unknown = _rpc(client, token, "initialize", {"protocolVersion": "1999-01-01"})
    assert unknown.json()["result"]["protocolVersion"] == "2025-11-25"

    notification = client.post(
        "/mcp",
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert notification.status_code == 202

    tools = _rpc(client, token, "tools/list").json()["result"]["tools"]
    names = {tool["name"] for tool in tools}
    assert {"get_today", "list_habits", "mark_habit", "create_todos", "delete_todo"} <= names
    assert not any(name.startswith("admin_") for name in names)
    by_name = {tool["name"]: tool for tool in tools}
    assert by_name["delete_todo"]["annotations"]["destructiveHint"] is True
    assert by_name["list_habits"]["annotations"]["readOnlyHint"] is True
    assert by_name["mark_habit"]["inputSchema"]["required"] == ["habit_id"]

    assert _rpc(client, token, "nope").json()["error"]["code"] == -32601
    bad = client.post("/mcp", content=b"{", headers={"Authorization": f"Bearer {token}"})
    assert bad.status_code == 400 and bad.json()["error"]["code"] == -32700
    missing = _rpc(client, token, "tools/call", {"name": "admin_overview"})
    assert missing.json()["error"]["code"] == -32602


def test_habits_through_the_ai(client: TestClient, user: AuthUser) -> None:
    token = _connect(client, user)["access_token"]
    created = _ok(client, token, "create_habit", {"name": "Read", "frequency_type": "daily"})
    habit_id = created["habit"]["id"]
    assert created["habit"]["done_today"] is False

    marked = _ok(client, token, "mark_habit", {"habit_id": habit_id})
    assert marked["habit"]["done_today"] is True and marked["habit"]["current_streak"] == 1

    # The app sees the same change (it reads POST /sync).
    synced = client.post("/sync", json={"ops": []}, headers=user.headers).json()
    habit = next(item for item in synced["habits"] if item["id"] == habit_id)
    assert habit["done_today"] is True

    yesterday = (
        __import__("datetime").date.fromisoformat(marked["date"]) - timedelta(days=1)
    ).isoformat()
    _ok(client, token, "mark_habit", {"habit_id": habit_id, "date": yesterday})
    _ok(client, token, "add_day_note", {"habit_id": habit_id, "text": "20 pages"})
    history = _ok(client, token, "get_habit_history", {"habit_id": habit_id, "days": 3})
    assert [day["done"] for day in history["days"]] == [False, True, True]
    assert history["days"][-1]["note"] == "20 pages"
    assert history["habit"]["current_streak"] == 2

    today = _ok(client, token, "get_today")
    assert [item["name"] for item in today["habits_due_today"]] == ["Read"]

    unknown = _call(client, token, "mark_habit", {"habit_id": 999999})
    assert unknown["isError"] is True and "task_not_found" in unknown["content"][0]["text"]
    invalid = _call(client, token, "create_habit", {"name": "X", "frequency_type": "hourly"})
    assert invalid["isError"] is True and "invalid_arguments" in invalid["content"][0]["text"]
    future = _call(client, token, "mark_habit", {"habit_id": habit_id, "date": "2999-01-01"})
    assert future["isError"] is True and "invalid_date" in future["content"][0]["text"]


def test_several_times_a_day_habit(client: TestClient, user: AuthUser) -> None:
    token = _connect(client, user)["access_token"]
    habit_id = _ok(
        client, token, "create_habit", {"name": "Water", "times_per_day": 3}
    )["habit"]["id"]
    partial = _ok(client, token, "mark_habit", {"habit_id": habit_id, "count": 2})["habit"]
    assert partial["today_count"] == 2 and partial["done_today"] is False
    full = _ok(client, token, "mark_habit", {"habit_id": habit_id})["habit"]
    assert full["today_count"] == 3 and full["done_today"] is True


def test_todos_through_the_ai(client: TestClient, user: AuthUser) -> None:
    token = _connect(client, user)["access_token"]
    work = _ok(client, token, "create_todo_list", {"name": "Work"})["list"]
    today = _ok(client, token, "get_today")["today"]
    created = _ok(
        client,
        token,
        "create_todos",
        {
            "todos": [
                {"text": "Write the report", "list_id": work["id"], "due_date": today},
                {"text": "Call mom"},
            ]
        },
    )["created"]
    assert [item["text"] for item in created] == ["Write the report", "Call mom"]
    report, call = created
    assert report["list"] == "Work" and report["due_date"] == today

    assert [item["text"] for item in _ok(client, token, "get_today")["todos_due_today"]] == [
        "Write the report"
    ]
    done = _ok(client, token, "update_todo", {"todo_id": report["id"], "done": True})["todo"]
    assert done["done"] is True
    cleared = _ok(client, token, "update_todo", {"todo_id": call["id"], "list_id": work["id"], "due_date": today})
    assert cleared["todo"]["list_id"] == work["id"]
    undated = _ok(client, token, "update_todo", {"todo_id": call["id"], "due_date": None})["todo"]
    assert "due_date" not in undated

    listed = _ok(client, token, "list_todos")
    assert [item["text"] for item in listed["todos"]] == ["Call mom"]
    assert [item["name"] for item in listed["lists"]] == ["Work"]
    assert len(_ok(client, token, "list_todos", {"include_done": True})["todos"]) == 2

    assert _ok(client, token, "delete_todo", {"todo_id": call["id"]}) == {"deleted": call["id"]}
    missing = _call(client, token, "delete_todo", {"todo_id": call["id"]})
    assert missing["isError"] is True

    synced = client.post("/sync", json={"ops": []}, headers=user.headers).json()
    assert [todo["text"] for todo in synced["todos"]] == ["Write the report"]


def test_someone_elses_habit_is_out_of_reach(client: TestClient, user: AuthUser, other_user: AuthUser) -> None:
    _open_app(client, other_user)
    theirs = client.post(
        "/sync",
        json={"ops": [{"type": "create", "ref": "h1", "habit": {"name": "Secret", "frequency_type": "daily"}}]},
        headers=other_user.headers,
    ).json()["results"][0]["id"]
    token = _connect(client, user)["access_token"]
    assert _call(client, token, "mark_habit", {"habit_id": theirs})["isError"] is True
    assert _ok(client, token, "list_habits")["habits"] == []


# --------------------------------------------------------------------------- #
#  Administrator: statistics
# --------------------------------------------------------------------------- #


@pytest.fixture
def admin(client: TestClient) -> AuthUser:
    fresh = new_user("Admin")
    seed = auth_user(SEED_ADMIN_IDS[0])
    response = client.post("/admin/admins", json={"telegram_id": fresh.id}, headers=seed.headers)
    assert response.status_code == 201, response.text
    return fresh


def test_statistics_need_the_bot_press(client: TestClient, admin: AuthUser, telegram: FakeTelegram) -> None:
    _open_app(client, admin)
    assert _login(client, admin)["is_admin"] is True
    token = _connect(client, admin, admin=True)["access_token"]
    assert {"admin_overview", "admin_report", "admin_feature_usage", "admin_journey"} <= _tool_names(client, token)

    waiting = _call(client, token, "admin_overview")
    assert waiting["isError"] is True and "admin_not_allowed" in waiting["content"][0]["text"]

    question = telegram.sent[-1]
    assert question.chat_id == admin.id and "Claude" in (question.text or "")
    callback = question.extra["reply_markup"].inline_keyboard[0][0].callback_data
    code = callback[len(AI_ADMIN_ALLOW):]
    assert not _run(lambda repo: confirm_ai_admin(repo, load_settings(), code, 1))
    assert _run(lambda repo: confirm_ai_admin(repo, load_settings(), code, admin.id))

    overview = _ok(client, token, "admin_overview")
    assert "counts" in overview and "new_by_day" in overview
    usage = _ok(client, token, "admin_feature_usage")
    assert {"todos", "timer_goal", "shared_habits", "ai_connector", "push"} <= set(usage["features"])
    report = _ok(client, token, "admin_report", {"section": "summary", "period": "7"})
    assert isinstance(report, dict)
    assert "paths" in _ok(client, token, "admin_journey", {"days": 7})
    connections = client.get("/ai/connections", headers=admin.headers).json()["connections"]
    assert connections[0]["admin"] is True


def test_statistics_are_not_for_everyone(client: TestClient, user: AuthUser, admin: AuthUser, telegram: FakeTelegram) -> None:
    # A regular user asking for statistics gets none, and no bot question.
    token = _connect(client, user, admin=True)["access_token"]
    assert not any(name.startswith("admin_") for name in _tool_names(client, token))
    assert telegram.sent == []
    # An administrator who did not ask gets no admin tools either.
    plain = _connect(client, admin)["access_token"]
    assert not any(name.startswith("admin_") for name in _tool_names(client, plain))
