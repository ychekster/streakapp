"""Web app (PWA): guest accounts, web sessions, Telegram → web handoff, Telegram logins
(bot, Telegram web login), linking and merging rules, funnel events, the one-time install
offer and push reminders. Bot API is faked."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import os
import socket
import time
from collections.abc import Iterator
from datetime import datetime, time as clock, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from bot import reminders as bot_reminders
from bot.pacing import Pacer
from tests.conftest import AuthUser, auth_user, new_user
from tests.fake_telegram import FakeTelegram
from tests.helpers import TEST_BOT_TOKEN, sign_init_data
from backend.accounts import (
    SESSION_MAX_AGE,
    TELEGRAM_LOGIN_CONFIRM_WINDOW,
    confirm_telegram_login,
    login_device,
    telegram_login_request,
)
from backend.config import load_settings
from backend.constants import SEED_ADMIN_IDS
from backend.database import Database
from backend.funnel import _client_props
from backend.models import FrequencyType
from backend.ratelimit import RateLimiter
from backend.repository import Repository, utc_now
from backend.routers.auth import client_ip
from backend.webauth import hash_token
from backend.webpush import PushOutcome, VapidKeys, is_push_endpoint


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _no_anonymous_limits(client: TestClient) -> Iterator[None]:
    """All test requests come from one address: lift the per-address limits."""
    state = client.app.state
    saved = state.guest_limiter, state.event_limiter, state.address_limiter
    state.guest_limiter = state.event_limiter = state.address_limiter = RateLimiter(0, 0)
    yield
    state.guest_limiter, state.event_limiter, state.address_limiter = saved


@pytest.fixture
def telegram(client: TestClient) -> Iterator[FakeTelegram]:
    fake = FakeTelegram()
    original = client.app.state.bot
    client.app.state.bot = fake
    yield fake
    client.app.state.bot = original


def _guest(client: TestClient) -> dict[str, str]:
    response = client.post("/auth/guest")
    assert response.status_code == 201, response.text
    assert response.json()["user_id"] < 0
    return _bearer(response.json()["token"])


def _habit(client: TestClient, headers: dict[str, str], name: str) -> dict:
    response = client.post(
        "/tasks", json={"name": name, "frequency_type": "daily"}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()["habit"]


def _names(client: TestClient, headers: dict[str, str]) -> list[str]:
    response = client.get("/tasks", headers=headers)
    assert response.status_code == 200, response.text
    return sorted(habit["name"] for habit in response.json()["habits"])


def _account(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.get("/auth/account", headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def _run(coroutine_factory):
    """Run DB work directly (as the bot process would), on its own connection."""

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


def _bot_login(client: TestClient, headers: dict[str, str], telegram_user: AuthUser) -> dict:
    """"Log in via Telegram" through the bot: start, confirm in the bot, poll."""
    start = client.post("/auth/telegram/start", headers=headers)
    assert start.status_code == 200, start.text
    code = start.json()["code"]
    assert start.json()["web_url"].endswith(f"?start=login_{code}")
    pending = client.post("/auth/telegram/poll", json={"token": code}, headers=headers)
    assert pending.json()["status"] == "pending"
    confirmed = _run(
        lambda repo: confirm_telegram_login(
            repo, load_settings(), code, telegram_user.id, "tg", "Tg"
        )
    )
    assert confirmed
    done = client.post("/auth/telegram/poll", json={"token": code}, headers=headers)
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "done"
    return done.json()["result"]


@pytest.fixture(autouse=True)
def _bot_username(client: TestClient) -> Iterator[None]:
    client.app.state.bot_username = "test_bot"
    yield


# --------------------------------------------------------------------------- #
#  Guests and sessions
# --------------------------------------------------------------------------- #


def test_guest_keeps_habits_on_the_server(client: TestClient) -> None:
    guest = _guest(client)
    _habit(client, guest, "Вода")
    assert _names(client, guest) == ["Вода"]
    account = _account(client, guest)
    assert account["is_guest"] is True
    assert [login["linked"] for login in account["logins"]] == [False]


def test_unknown_session_is_401(client: TestClient) -> None:
    response = client.get("/tasks", headers=_bearer("not-a-session"))
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_session"


def test_meta_accepts_web_sessions(client: TestClient) -> None:
    assert client.get("/meta", headers=_guest(client)).status_code == 200


# --------------------------------------------------------------------------- #
#  Telegram → web handoff
# --------------------------------------------------------------------------- #


def test_handoff_logs_the_app_into_the_telegram_account(client: TestClient, user: AuthUser) -> None:
    _habit(client, user.headers, "Зарядка")
    created = client.post("/auth/handoff", json={"src": "bot"}, headers=user.headers)
    assert created.status_code == 200, created.text
    token = created.json()["token"]
    assert "/install?src=bot" in created.json()["url"] and f"h={token}" in created.json()["url"]

    redeemed = client.post("/auth/handoff/redeem", json={"token": token})
    assert redeemed.status_code == 200, redeemed.text
    session = _bearer(redeemed.json()["session"]["token"])
    assert _names(client, session) == ["Зарядка"]
    # Single use.
    again = client.post("/auth/handoff/redeem", json={"token": token})
    assert again.status_code == 410


def test_manifest_carries_the_handoff_into_the_installed_app(
    client: TestClient, user: AuthUser
) -> None:
    token = client.post("/auth/handoff", json={}, headers=user.headers).json()["token"]
    manifest = client.get("/web/manifest", params={"h": token})
    assert manifest.status_code == 200
    assert manifest.headers["content-type"].startswith("application/manifest+json")
    assert manifest.json()["start_url"] == f"/app?pwa=1&h={token}"
    assert manifest.json()["id"] == "/app"
    # Anything that is not a token — the plain start address.
    junk = client.get("/web/manifest", params={"h": "x&evil=1"})
    assert junk.json()["start_url"] == "/app?pwa=1"


def test_logout_ends_the_session_of_a_linked_account(client: TestClient, user: AuthUser) -> None:
    token = client.post("/auth/handoff", json={}, headers=user.headers).json()["token"]
    redeemed = client.post("/auth/handoff/redeem", json={"token": token})
    session = _bearer(redeemed.json()["session"]["token"])

    logout = client.post("/auth/logout", json={"endpoint": None}, headers=session)
    assert logout.status_code == 204, logout.text
    assert client.get("/auth/account", headers=session).status_code == 401


def _web_session(client: TestClient, user: AuthUser) -> dict[str, str]:
    token = client.post("/auth/handoff", json={}, headers=user.headers).json()["token"]
    redeemed = client.post("/auth/handoff/redeem", json={"token": token})
    return _bearer(redeemed.json()["session"]["token"])


def test_logout_everywhere_ends_every_session_and_push(client: TestClient, user: AuthUser) -> None:
    phone, tablet = _web_session(client, user), _web_session(client, user)
    device = {"endpoint": "https://fcm.googleapis.com/fcm/send/tablet", "keys": {"p256dh": "k", "auth": "a"}}
    assert client.post("/web/push/subscribe", json=device, headers=tablet).status_code == 200

    response = client.post("/auth/logout", json={"everywhere": True}, headers=phone)
    assert response.status_code == 204, response.text
    assert client.get("/auth/account", headers=phone).status_code == 401
    assert client.get("/auth/account", headers=tablet).status_code == 401
    assert _run(lambda repo: repo.has_push_subscription(user.id)) is False
    # The Mini App is untouched.
    assert client.get("/tasks", headers=user.headers).status_code == 200


def test_blocking_ends_the_web_sessions(client: TestClient, user: AuthUser) -> None:
    session = _web_session(client, user)

    async def block(repo: Repository) -> None:
        await repo.set_blocked(await repo.get_user(user.id), True)

    async def unblock(repo: Repository) -> None:
        await repo.set_blocked(await repo.get_user(user.id), False)

    _run(block)
    _run(unblock)
    assert client.get("/tasks", headers=session).status_code == 401


def test_a_session_ends_a_year_after_the_login(client: TestClient, user: AuthUser) -> None:
    session = _web_session(client, user)
    token = session["Authorization"].split(" ", 1)[1]
    settings = load_settings()

    async def age(repo: Repository) -> None:
        found = await repo.get_session(hash_token(settings.auth_secret, token), utc_now())
        found.created_at = utc_now() - SESSION_MAX_AGE + timedelta(hours=1)
        found.last_used_at = utc_now() - timedelta(days=1)

    _run(age)
    assert client.get("/tasks", headers=session).status_code == 200  # refreshed, capped
    found = _run(lambda repo: repo.get_session(hash_token(settings.auth_secret, token), utc_now()))
    assert found.expires_at <= found.created_at + SESSION_MAX_AGE

    async def expire(repo: Repository) -> None:
        found = await repo.get_session(hash_token(settings.auth_secret, token), utc_now())
        found.created_at = utc_now() - SESSION_MAX_AGE  # its expires_at is still ahead

    _run(expire)
    assert client.get("/tasks", headers=session).status_code == 401


def test_handoff_needs_a_freshly_opened_mini_app(client: TestClient) -> None:
    telegram_user = new_user()
    old = sign_init_data(telegram_user.id, auth_date=int(time.time()) - 2 * 60 * 60)
    response = client.post("/auth/handoff", json={}, headers={"Authorization": f"tma {old}"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "stale_init_data"
    assert client.post("/auth/handoff", json={}, headers=telegram_user.headers).status_code == 200


def test_a_guest_or_the_mini_app_cannot_log_out(client: TestClient, user: AuthUser) -> None:
    guest = client.post("/auth/logout", json={}, headers=_guest(client))
    assert guest.status_code == 409
    assert guest.json()["error"]["code"] == "guest_logout"
    mini_app = client.post("/auth/logout", json={}, headers=user.headers)
    assert mini_app.json()["error"]["code"] == "web_only"


def test_admin_panel_opens_only_in_telegram(client: TestClient) -> None:
    admin = auth_user(SEED_ADMIN_IDS[0])
    assert client.get("/settings", headers=admin.headers).json()["is_admin"] is True
    token = client.post("/auth/handoff", json={}, headers=admin.headers).json()["token"]
    redeemed = client.post("/auth/handoff/redeem", json={"token": token})
    session = _bearer(redeemed.json()["session"]["token"])
    # The admin's own web session: an ordinary account, no admin panel.
    assert client.get("/settings", headers=session).json()["is_admin"] is False
    assert client.post("/sync", json={"ops": []}, headers=session).json()["settings"]["is_admin"] is False
    response = client.get("/admin/funnel", headers=session)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "admin_required"
    assert client.get("/admin/funnel", headers=admin.headers).status_code == 200


def test_handoff_is_created_only_in_telegram(client: TestClient) -> None:
    response = client.post("/auth/handoff", json={}, headers=_guest(client))
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "telegram_only"


def test_handoff_on_a_device_with_a_guest_merges_its_habits(
    client: TestClient, user: AuthUser
) -> None:
    _habit(client, user.headers, "Зарядка")
    guest = _guest(client)
    _habit(client, guest, "Вода")
    token = client.post("/auth/handoff", json={}, headers=user.headers).json()["token"]
    # The guest's habits would move into the link's account: asked first, link unspent.
    asked = client.post("/auth/handoff/redeem", json={"token": token}, headers=guest)
    assert asked.status_code == 409
    assert asked.json()["error"]["code"] == "handoff_merge"
    assert _names(client, guest) == ["Вода"]
    redeemed = client.post(
        "/auth/handoff/redeem", json={"token": token, "merge": True}, headers=guest
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["account"]["user_id"] == user.id
    assert _names(client, user.headers) == ["Вода", "Зарядка"]
    # The guest's old session ended with it.
    assert client.get("/tasks", headers=guest).status_code == 401


# --------------------------------------------------------------------------- #
#  Linking rules (spec 6.6)
# --------------------------------------------------------------------------- #


def test_new_telegram_login_turns_the_guest_into_a_telegram_account(client: TestClient) -> None:
    guest = _guest(client)
    _habit(client, guest, "Вода")
    telegram_user = new_user()
    result = _bot_login(client, guest, telegram_user)
    assert result["account"]["user_id"] == telegram_user.id
    assert result["account"]["is_guest"] is False
    session = _bearer(result["session"]["token"])
    # Same habits in the web app and in the Mini App.
    assert _names(client, session) == _names(client, telegram_user.headers) == ["Вода"]


def test_empty_guest_switches_to_the_existing_account(client: TestClient, user: AuthUser) -> None:
    _habit(client, user.headers, "Зарядка")
    guest = _guest(client)
    guest_id = _account(client, guest)["user_id"]
    result = _bot_login(client, guest, user)
    assert result["account"]["user_id"] == user.id
    assert _names(client, _bearer(result["session"]["token"])) == ["Зарядка"]
    # The empty guest is discarded.
    assert _run(lambda repo: repo.get_user(guest_id)) is None


def test_guest_with_habits_merges_into_the_existing_account(
    client: TestClient, user: AuthUser
) -> None:
    habit = _habit(client, user.headers, "Бег")
    assert client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers).status_code == 200
    guest = _guest(client)
    guest_habit = _habit(client, guest, "Бег")
    client.post(f"/tasks/{guest_habit['id']}/toggle", headers=guest)
    _habit(client, guest, "Вода")

    result = _bot_login(client, guest, user)
    session = _bearer(result["session"]["token"])
    # Nothing is lost: the clashing name gets a suffix, check-ins move along.
    assert _names(client, session) == ["Бег", "Бег (2)", "Вода"]
    habits = client.get("/tasks", headers=session).json()["habits"]
    assert {h["name"]: h["done_today"] for h in habits} == {"Бег": True, "Бег (2)": True, "Вода": False}


def test_telegram_web_login_checks_the_hash(client: TestClient) -> None:
    guest = _guest(client)
    telegram_user = new_user()
    fields = {"id": str(telegram_user.id), "first_name": "Web", "auth_date": str(int(time.time()))}
    check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hashlib.sha256(TEST_BOT_TOKEN.encode()).digest()
    signed = {**fields, "hash": hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()}

    forged = client.post("/auth/telegram/widget", json={**signed, "first_name": "Evil"}, headers=guest)
    assert forged.status_code == 401
    response = client.post("/auth/telegram/widget", json=signed, headers=guest)
    assert response.status_code == 200, response.text
    assert response.json()["account"]["user_id"] == telegram_user.id


def test_two_telegram_accounts_never_merge(client: TestClient, user: AuthUser) -> None:
    _account(client, user.headers)  # `user` has an account (opened the Mini App)
    first = new_user()
    session = _bearer(_bot_login(client, _guest(client), first)["session"]["token"])
    # Logging into another Telegram account from this one is a conflict, not a merge.
    start = client.post("/auth/telegram/start", headers=session)
    code = start.json()["code"]
    assert _run(
        lambda repo: confirm_telegram_login(repo, load_settings(), code, user.id, "b", "B")
    )
    response = client.post("/auth/telegram/poll", json={"token": code}, headers=session)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "account_conflict"
    assert _account(client, session)["user_id"] == first.id


def test_bot_login_is_confirmed_once_and_only_while_fresh(client: TestClient) -> None:
    guest = _guest(client)
    iphone = {**guest, "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"}
    code = client.post("/auth/telegram/start", headers=iphone).json()["code"]
    settings = load_settings()
    request = _run(lambda repo: telegram_login_request(repo, settings, code))
    assert request is not None and login_device(request) == "ios"

    victim, attacker = new_user(), new_user()
    assert _run(lambda repo: confirm_telegram_login(repo, settings, code, victim.id, "v", "V"))
    # A second press (by anyone) cannot swap the account the app gets.
    assert not _run(
        lambda repo: confirm_telegram_login(repo, settings, code, attacker.id, "a", "A")
    )
    done = client.post("/auth/telegram/poll", json={"token": code}, headers=guest)
    assert done.json()["result"]["account"]["user_id"] == victim.id

    # Two presses at the same moment: the one that read the code before the other's
    # write cannot overwrite it.
    racy = client.post("/auth/telegram/start", headers=_guest(client)).json()["code"]

    async def press_twice(repo: Repository) -> tuple[bool, bool]:
        found = await telegram_login_request(repo, settings, racy)
        before = found.payload
        first = await repo.replace_code_payload(found, before, '{"telegram": {"id": 1}}')
        second = await repo.replace_code_payload(found, before, '{"telegram": {"id": 2}}')
        return first, second

    assert _run(press_twice) == (True, False)

    # A link confirmed minutes after it was asked for is stale.
    stale = client.post("/auth/telegram/start", headers=_guest(client)).json()["code"]

    async def age(repo: Repository) -> None:
        found = await telegram_login_request(repo, settings, stale)
        found.created_at = found.created_at - TELEGRAM_LOGIN_CONFIRM_WINDOW - timedelta(seconds=1)

    _run(age)
    assert not _run(lambda repo: confirm_telegram_login(repo, settings, stale, victim.id, "v", "V"))


# --------------------------------------------------------------------------- #
#  Funnel events
# --------------------------------------------------------------------------- #


def test_events_are_recorded_and_counted(client: TestClient) -> None:
    for platform in ("ios", "android"):
        response = client.post(
            "/events",
            json={"event": "landing_view", "anon_id": f"a-{platform}", "platform": platform,
                  "browser_context": "in_app", "src": "Threads"},
        )
        assert response.status_code == 204, response.text
    assert client.post("/events", json={"event": "nonsense"}).status_code == 422

    admin = auth_user(SEED_ADMIN_IDS[0])
    report = client.get("/admin/funnel", headers=admin.headers)
    assert report.status_code == 200, report.text
    landing = next(step for step in report.json()["steps"] if step["event"] == "landing_view")
    assert landing["total"] >= 2
    assert landing["by_src"]["threads"] >= 2
    assert client.get("/admin/funnel", headers=new_user().headers).status_code == 403


def test_clients_cannot_send_server_steps_or_big_props(client: TestClient) -> None:
    for event in ("first_habit_created", "first_checkin", "account_linked"):
        response = client.post("/events", json={"event": event, "anon_id": "a-server"})
        assert response.status_code == 422, event
    assert _client_props({"from": "push", "b": 7, "x" * 40: 1, "nested": {"a": 1}}) == {"from": "push", "b": 7}
    assert _client_props({"long": "y" * 500}) == {"long": "y" * 64}
    assert _client_props({f"k{n}": n for n in range(10)}) == {"k0": 0, "k1": 1, "k2": 2, "k3": 3}


def test_rate_limits_use_the_address_nginx_saw(client: TestClient) -> None:
    from starlette.requests import Request

    def request(headers: dict[str, str]) -> Request:
        raw = [(key.lower().encode(), value.encode()) for key, value in headers.items()]
        return Request({"type": "http", "headers": raw, "client": ("127.0.0.1", 1)})

    # nginx appends the real address last; whatever the client sent before it is ignored.
    forged = request({"X-Forwarded-For": "1.1.1.1, 203.0.113.9", "CF-Connecting-IP": "2.2.2.2"})
    assert client_ip(forged) == "203.0.113.9"
    assert client_ip(request({})) == "127.0.0.1"


def test_first_habit_and_first_checkin_are_recorded_once(client: TestClient) -> None:
    guest = _guest(client)
    user_id = _account(client, guest)["user_id"]
    first = _habit(client, guest, "Один")
    _habit(client, guest, "Два")
    client.post(f"/tasks/{first['id']}/toggle", headers=guest)
    client.post(f"/tasks/{first['id']}/toggle", headers=guest)
    client.post(f"/tasks/{first['id']}/toggle", headers=guest)

    async def count(repo: Repository) -> dict[str, int]:
        from sqlalchemy import func, select

        from backend.models import Event

        rows = await repo.session.execute(
            select(Event.event, func.count()).where(Event.user_id == user_id).group_by(Event.event)
        )
        return dict(rows.tuples().all())

    assert _run(count) == {"first_habit_created": 1, "first_checkin": 1}


# --------------------------------------------------------------------------- #
#  One-time install offer (spec §8)
# --------------------------------------------------------------------------- #


def test_bot_offers_the_app_once_after_the_first_checkin(
    client: TestClient, telegram: FakeTelegram, user: AuthUser
) -> None:
    habit = _habit(client, user.headers, "Зарядка")
    for _ in range(3):
        client.post(f"/tasks/{habit['id']}/toggle", headers=user.headers)
    offers = [sent for sent in telegram.sent if sent.chat_id == user.id]
    assert len(offers) == 1
    assert offers[0].text.startswith("Отличное начало!")
    buttons = offers[0].extra["reply_markup"].inline_keyboard[0]
    assert buttons[0].web_app.url.endswith("?open=install&from=install_offer")
    assert buttons[1].callback_data == "install_offer:dismiss"


def test_no_offer_for_web_check_ins(client: TestClient, telegram: FakeTelegram) -> None:
    guest = _guest(client)
    habit = _habit(client, guest, "Вода")
    client.post(f"/tasks/{habit['id']}/toggle", headers=guest)
    assert telegram.sent == []


# --------------------------------------------------------------------------- #
#  Push reminders (spec §9)
# --------------------------------------------------------------------------- #


class _ChatBot:
    def __init__(self) -> None:
        self.chats: list[int] = []

    async def send_message(self, chat_id: int, **_: object) -> None:
        self.chats.append(chat_id)


def test_push_goes_only_to_browser_push_services(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # DNS as the test sees it: one public push service of another browser, one name that
    # points inside the network (both the real names would need the internet).
    addresses = {"push.otherbrowser.test": "93.184.216.34", "internal.evil.test": "10.0.0.7"}

    def resolve(host: str, *args: object, **kwargs: object) -> list:
        if host not in addresses:
            raise OSError("unknown host")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addresses[host], 443))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve)
    for endpoint in (
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "https://web.push.apple.com/abc",
        "https://wns2-par02p.notify.windows.com/w/?token=abc",
        "https://push.otherbrowser.test/sub/abc",
    ):
        assert is_push_endpoint(endpoint), endpoint
    for endpoint in (
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://127.0.0.1/abc",
        "https://[::1]/abc",
        "https://10.0.0.5:8443/abc",
        "https://fcm.googleapis.com:8000/abc",
        "https://user@fcm.googleapis.com/abc",
        "https://internal.evil.test/abc",
        "https://fcm.googleapis.com.unknown.test/abc",
        "https://localhost/abc",
    ):
        assert not is_push_endpoint(endpoint), endpoint

    guest = _guest(client)
    keys = {"p256dh": "k", "auth": "a"}
    internal = client.post(
        "/web/push/subscribe", json={"endpoint": "https://127.0.0.1:8443/x", "keys": keys}, headers=guest
    )
    assert internal.status_code == 422
    assert internal.json()["error"]["code"] == "invalid_subscription"

    # The device's subscription moves to another account only with its own keys.
    device = {"endpoint": "https://fcm.googleapis.com/fcm/send/device-1", "keys": keys}
    assert client.post("/web/push/subscribe", json=device, headers=guest).status_code == 200
    stranger = _guest(client)
    forged = {**device, "keys": {"p256dh": "other", "auth": "other"}}
    assert client.post("/web/push/subscribe", json=forged, headers=stranger).status_code == 422
    assert client.get("/web/push", headers=guest).json()["subscribed"] is True
    assert client.post("/web/push/subscribe", json=device, headers=stranger).status_code == 200
    assert client.get("/web/push", headers=guest).json()["subscribed"] is False


def test_reminder_goes_to_push_or_to_the_bot_never_both(db_url: str) -> None:
    moment = datetime(2026, 9, 22, 9, 0, tzinfo=timezone.utc)
    pushed: list[tuple[str, dict]] = []
    gone_endpoint = "https://push.example/gone"

    async def sender(target, data, keys) -> PushOutcome:
        pushed.append((target.endpoint, data))
        return PushOutcome.gone if target.endpoint == gone_endpoint else PushOutcome.sent

    async def scenario() -> tuple[list[int], dict]:
        database = Database(db_url)
        await database.create_tables()
        async with database.session_factory() as session:
            repo = Repository(session)
            web = await repo.create_web_user("ru", utc_now())  # push
            await repo.get_or_create_user(501, None, None, "ru")  # Telegram + push
            await repo.get_or_create_user(502, None, None, "ru")  # Telegram only
            await repo.get_or_create_user(503, None, None, "ru")  # Telegram, push gone
            lonely = await repo.create_web_user("ru", utc_now())  # web, no push
            for user_id in (web.telegram_id, 501, 502, 503, lonely.telegram_id):
                await repo.create_task(user_id, "Вода", FrequencyType.daily, reminder_time=clock(9, 0))
            await repo.save_push_subscription(web.telegram_id, "https://push.example/web", "k", "a", None)
            await repo.save_push_subscription(501, "https://push.example/tg", "k", "a", None)
            await repo.save_push_subscription(503, gone_endpoint, "k", "a", None)
            await session.commit()
        bot = _ChatBot()
        push = bot_reminders.PushConfig(VapidKeys("key", "mailto:x@example.com"), "https://app.example")
        keyboards = bot_reminders.open_app_keyboards("https://app.example")
        await bot_reminders._send_due(bot, database, Pacer(1000), moment, keyboards, push, sender)  # type: ignore[arg-type]
        async with database.session_factory() as session:
            left = await Repository(session).push_subscriptions_for([web.telegram_id, 501, 503])
        await database.dispose()
        return bot.chats, left

    chats, left = asyncio.run(scenario())
    # Telegram only for the account without push, and as a fallback for the gone one.
    assert sorted(chats) == [502, 503]
    assert sorted(endpoint for endpoint, _ in pushed) == sorted(
        ["https://push.example/web", "https://push.example/tg", gone_endpoint]
    )
    payload = pushed[0][1]
    # The reminder is the title: iOS shows «from Knot» under it by itself.
    # Plain text, no emoji.
    assert payload["title"] == "Пора выполнить «Вода»" and payload["body"] == ""
    assert "/app?pwa=1&from=push&habit=" in payload["url"]
    # The gone subscription is deleted.
    assert 503 not in left and len(left) == 2


def test_broadcasts_skip_web_only_accounts(client: TestClient) -> None:
    _guest(client)
    admin = auth_user(SEED_ADMIN_IDS[0])
    count = client.get("/admin/broadcasts/recipients", headers=admin.headers).json()

    async def telegram_users(repo: Repository) -> int:
        from sqlalchemy import func, select

        from backend.models import User

        return await repo.session.scalar(
            select(func.count()).select_from(User).where(
                User.telegram_id > 0, User.bot_blocked_at.is_(None), User.blocked_at.is_(None)
            )
        )

    # Recipients never include negative (web-only) ids: at most all Telegram users.
    assert count["recipients"] <= _run(telegram_users)
