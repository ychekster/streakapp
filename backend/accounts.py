"""Accounts across Telegram and the web app.

One account can be opened from the Telegram Mini App and from the installed web app,
with one login, Telegram:

- **Telegram** — a Telegram account's id is its Telegram id (`users.telegram_id`), so the
  Telegram login is the id itself; the Mini App authenticates with `initData`;
- **guest** — a web-only account with a random negative id and no login yet. It is
  created silently on the first launch of the installed app.

Linking rules (spec 6.6), see `link_login`:

1. the login is not used anywhere → it is attached to the current account;
2. it belongs to another account and the current one is an empty guest → switch to that
   account, the empty guest is discarded;
3. it belongs to another account and the current one has data → the accounts merge (all
   habits and check-ins move, nothing is deleted) and the user continues in the merged
   one. The account holding Telegram always survives, because its id is the Telegram id;
   two different Telegram accounts never merge (409 `account_conflict`).

Web sessions and one-time codes are random tokens; only their keyed hashes are stored.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from backend.config import Settings
from backend.errors import ApiError
from backend.models import AuthCode, User, WebSession
from backend.repository import Repository, utc_now
from backend.schemas import AccountLogin, AccountResponse
from backend.webauth import hash_token, new_link_code, new_token

PROVIDER_TELEGRAM = "telegram"

# One-time code kinds (auth_codes.kind).
CODE_HANDOFF = "handoff"  # Telegram Mini App → browser → installed app, same account
CODE_TELEGRAM_LOGIN = "tg_login"  # "log in via Telegram" through the bot

# Lifetimes of codes that are not configurable.
TELEGRAM_LOGIN_TTL = timedelta(minutes=10)
# The bot accepts «Подтвердить вход» only this soon after the app asked: a login link
# sent to someone else goes stale before they could be talked into confirming it.
TELEGRAM_LOGIN_CONFIRM_WINDOW = timedelta(minutes=3)

# A session's expiry is pushed forward at most this often (not on every request).
_SESSION_REFRESH_INTERVAL = timedelta(hours=12)
# However often it is used, a session ends this long after the login: a token copied off
# a device does not stay valid forever.
SESSION_MAX_AGE = timedelta(days=365)


@dataclass(frozen=True)
class LoginProfile:
    """A verified login: provider and the user's id there, plus what to show."""

    provider: str
    provider_user_id: str
    display_name: str | None = None
    # Telegram only: synced into the account like the Mini App does.
    username: str | None = None
    first_name: str | None = None


def telegram_profile(user_id: int, username: str | None, first_name: str | None) -> LoginProfile:
    """Login profile of a Telegram user."""
    return LoginProfile(
        provider=PROVIDER_TELEGRAM,
        provider_user_id=str(user_id),
        display_name=first_name,
        username=username,
        first_name=first_name,
    )


# --------------------------------------------------------------------------- #
#  Sessions
# --------------------------------------------------------------------------- #


async def issue_session(
    repo: Repository, settings: Settings, user_id: int, user_agent: str | None
) -> str:
    """Start a web session for the account; returns the token for the client."""
    token = new_token()
    now = utc_now()
    await repo.create_session(
        hash_token(settings.auth_secret, token),
        user_id,
        user_agent,
        now,
        now + timedelta(days=settings.web_session_ttl_days),
    )
    return token


async def resolve_session(
    repo: Repository, settings: Settings, token: str
) -> WebSession | None:
    """The live session of a token, its expiry pushed forward (sliding, but never past
    SESSION_MAX_AGE from the login)."""
    now = utc_now()
    session = await repo.get_session(hash_token(settings.auth_secret, token), now)
    if session is None or now >= session.created_at + SESSION_MAX_AGE:
        return None
    if now - session.last_used_at >= _SESSION_REFRESH_INTERVAL:
        session.last_used_at = now
        session.expires_at = min(
            now + timedelta(days=settings.web_session_ttl_days),
            session.created_at + SESSION_MAX_AGE,
        )
    return session


async def end_session(repo: Repository, settings: Settings, token: str) -> None:
    """Forget a session token."""
    await repo.delete_session(hash_token(settings.auth_secret, token))


async def end_all_sessions(repo: Repository, user_id: int) -> None:
    """«Выйти на всех устройствах»: every web session of the account ends, and its
    devices stop getting push reminders (they come through the bot again)."""
    await repo.delete_user_sessions(user_id)
    await repo.delete_user_push_subscriptions(user_id)


async def create_guest(
    repo: Repository, settings: Settings, language: str, user_agent: str | None
) -> tuple[User, str]:
    """A new guest account and its session (first launch of the installed app)."""
    user = await repo.create_web_user(language, utc_now())
    return user, await issue_session(repo, settings, user.telegram_id, user_agent)


# --------------------------------------------------------------------------- #
#  One-time codes
# --------------------------------------------------------------------------- #


async def create_code(
    repo: Repository,
    settings: Settings,
    kind: str,
    user_id: int | None,
    ttl: timedelta,
    payload: dict[str, Any] | None = None,
    *,
    short: bool = False,
) -> str:
    """Store a single-use code and return it. `short` — fits a Telegram deep link."""
    code = new_link_code() if short else new_token()
    now = utc_now()
    await repo.create_code(
        hash_token(settings.auth_secret, code),
        kind,
        user_id,
        json.dumps(payload) if payload is not None else None,
        now,
        now + ttl,
    )
    return code


async def find_code(
    repo: Repository, settings: Settings, code: str, kind: str
) -> AuthCode | None:
    """A live (unused, unexpired) code, without spending it."""
    if not code:
        return None
    return await repo.get_code(hash_token(settings.auth_secret, code), kind, utc_now())


def code_payload(code: AuthCode) -> dict[str, Any]:
    """The code's JSON payload ({} — none)."""
    try:
        data = json.loads(code.payload) if code.payload else {}
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


# --------------------------------------------------------------------------- #
#  Logins: linking and merging
# --------------------------------------------------------------------------- #


async def is_guest(repo: Repository, user: User) -> bool:
    """A web account without any login yet."""
    return user.telegram_id < 0


async def _owner(repo: Repository, profile: LoginProfile) -> User | None:
    """The account the login belongs to, if any."""
    return await repo.get_user(int(profile.provider_user_id))


async def _sync_profile(repo: Repository, user: User, profile: LoginProfile) -> None:
    """Keep the Telegram name of the account fresh (as the Mini App does)."""
    user.username = profile.username
    user.first_name = profile.first_name
    await repo.session.flush()


async def link_login(repo: Repository, current: User, profile: LoginProfile) -> User:
    """Link a verified login to the current account (rules — see the module docstring).

    Returns the account the user continues in: the current one, or another one after a
    switch or a merge. Callers must use the returned object: a merge re-reads accounts.
    """
    owner = await _owner(repo, profile)
    if owner is not None and owner.telegram_id == current.telegram_id:
        await _sync_profile(repo, current, profile)
        return current

    if owner is None:
        if current.telegram_id > 0:
            raise ApiError(
                409, "telegram_already_linked", "К аккаунту уже привязан другой Telegram"
            )
        # The account takes the Telegram id: create it and move everything there.
        target = await repo.clone_user(
            current, int(profile.provider_user_id), profile.username, profile.first_name
        )
        return await _record_link(repo, await repo.move_user_data(current, target), profile)

    # The login belongs to another account.
    if await is_guest(repo, current) and not await repo.user_has_data(current.telegram_id):
        await repo.delete_user(current.telegram_id)
        await _sync_profile(repo, owner, profile)
        return owner
    if current.telegram_id > 0 and owner.telegram_id > 0:
        raise ApiError(409, "account_conflict", "Этот вход уже используется другим аккаунтом")
    # Merge into the account that holds Telegram (its id cannot change).
    source, target = (owner, current) if current.telegram_id > 0 else (current, owner)
    merged = await repo.move_user_data(source, target)
    await _sync_profile(repo, merged, profile)
    return await _record_link(repo, merged, profile)


async def _record_link(repo: Repository, user: User, profile: LoginProfile) -> User:
    """Funnel event `account_linked` (and the same in the user's action log)."""
    await repo.add_event(
        "account_linked", user_id=user.telegram_id, props={"provider": profile.provider}
    )
    await repo.log_action(user.telegram_id, "linked", detail=profile.provider)
    return user


async def account_info(repo: Repository, settings: Settings, user: User) -> AccountResponse:
    """What Settings → Account shows."""
    telegram_linked = user.telegram_id > 0
    return AccountResponse(
        user_id=user.telegram_id,
        is_guest=not telegram_linked,
        has_habits=await repo.user_has_data(user.telegram_id),
        logins=[
            AccountLogin(
                provider=PROVIDER_TELEGRAM,
                linked=telegram_linked,
                label=(
                    (f"@{user.username}" if user.username else user.first_name)
                    if telegram_linked
                    else None
                ),
            ),
        ],
    )


def client_platform(user_agent: str | None) -> str:
    """ios / android / desktop by User-Agent (for server-side funnel events)."""
    agent = (user_agent or "").lower()
    if "iphone" in agent or "ipad" in agent or "ipod" in agent:
        return "ios"
    if "android" in agent:
        return "android"
    return "desktop"



async def telegram_login_request(
    repo: Repository, settings: Settings, code: str
) -> AuthCode | None:
    """A "log in via Telegram" request the bot may still confirm: live, not confirmed
    yet and asked for within TELEGRAM_LOGIN_CONFIRM_WINDOW. None — show «устарела»."""
    found = await find_code(repo, settings, code, CODE_TELEGRAM_LOGIN)
    if found is None or confirmed_telegram(found) is not None:
        return None
    if utc_now() - found.created_at > TELEGRAM_LOGIN_CONFIRM_WINDOW:
        return None
    return found


def login_device(code: AuthCode) -> str | None:
    """ios / android / desktop — the device that asked to log in (shown by the bot)."""
    device = code_payload(code).get("device")
    return device if isinstance(device, str) else None


async def confirm_telegram_login(
    repo: Repository,
    settings: Settings,
    code: str,
    user_id: int,
    username: str | None,
    first_name: str | None,
) -> bool:
    """The bot confirms "log in via Telegram": the Telegram user who pressed «Подтвердить»
    is remembered on the code, and the app that started the login picks it up
    (`/auth/telegram/poll`). Only once and only while the request is fresh (see
    telegram_login_request) — a second press cannot swap the account. False — the code
    is unknown, expired or already confirmed."""
    found = await telegram_login_request(repo, settings, code)
    if found is None:
        return False
    payload = code_payload(found)
    payload["telegram"] = {"id": user_id, "username": username, "first_name": first_name}
    # Two presses at the same moment: only the first one's write goes through.
    return await repo.replace_code_payload(found, found.payload, json.dumps(payload))


def confirmed_telegram(code: AuthCode) -> LoginProfile | None:
    """The Telegram login confirmed on a code, if any."""
    data = code_payload(code).get("telegram")
    if not isinstance(data, dict) or not isinstance(data.get("id"), int):
        return None
    return telegram_profile(data["id"], data.get("username"), data.get("first_name"))
