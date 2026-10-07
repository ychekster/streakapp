"""Accounts and logins of the web app (spec §6).

    POST   /auth/guest                — first launch of the installed app: a guest + session
    GET    /auth/account              — Settings → Account: logins, created, web devices
    POST   /auth/logout               — app: leave the account on this device (or everywhere;
                                        the Mini App: everywhere only)
    POST   /auth/handoff              — Mini App: single-use link to install the web app
    POST   /auth/handoff/redeem       — browser/app: log in with that link
    POST   /auth/telegram/start       — app: "log in via Telegram" through the bot
    POST   /auth/telegram/poll        — app: has the bot confirmed it?
    POST   /auth/telegram/widget      — app: Telegram web login result (hash-checked)

Logins always attach to the account the request is made from; linking may switch to
or merge with another account (see accounts.py). The web app then gets a new session,
because its account may have changed.
"""

from __future__ import annotations

import time
import zlib
from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response

from backend.accounts import (
    CODE_HANDOFF,
    CODE_TELEGRAM_LOGIN,
    TELEGRAM_LOGIN_TTL,
    account_info,
    confirmed_telegram,
    create_code,
    create_guest,
    end_all_sessions,
    end_session,
    find_code,
    is_guest,
    issue_session,
    link_login,
    telegram_profile,
)
from backend.dependencies import (
    Principal,
    RepositoryDep,
    get_db_user,
    get_optional_principal,
    get_principal,
    get_settings,
)
from backend.errors import ApiError
from backend.models import User
from backend.ratelimit import RateLimiter, retry_after_header
from backend.repository import Repository, utc_now
from backend.schemas import (
    AccountResponse,
    HandoffCreate,
    HandoffResponse,
    LinkResult,
    LogoutRequest,
    TelegramLoginPoll,
    TelegramLoginStart,
    TelegramWidgetLogin,
    HandoffRedeem,
    TokenRequest,
    WebSessionResponse,
)
from backend.services import language_from_telegram
from backend.webauth import TelegramLoginError, verify_telegram_login

router = APIRouter(prefix="/auth", tags=["auth"])

# Telegram web login data older than this is not accepted (seconds): it is used the
# moment Telegram returns it.
_TELEGRAM_LOGIN_MAX_AGE = 10 * 60
# A handoff link (a long web session) is given only to a Mini App opened this recently
# (seconds): a day-old initData, if it ever leaked, cannot be turned into a session.
_HANDOFF_INIT_DATA_MAX_AGE = 60 * 60


def client_ip(request: Request) -> str:
    """The caller's address behind nginx (for rate limits only). The last address of
    X-Forwarded-For is the one nginx itself appended (`$proxy_add_x_forwarded_for`);
    everything before it, like any other address header, is whatever the client sent."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else ""


def limit(request: Request, limiter: RateLimiter, key: str) -> None:
    """429 when `key` (an address, a device) exceeds its limiter."""
    retry_after = limiter.acquire(zlib.crc32(key.encode("utf-8")))
    if retry_after:
        raise ApiError(
            429,
            "rate_limited",
            "Слишком много запросов, попробуйте чуть позже",
            headers=retry_after_header(retry_after),
        )


async def bot_username(request: Request) -> str:
    """The bot's @username (config, or asked from Telegram once)."""
    settings = get_settings(request)
    if settings.telegram_bot_username:
        return settings.telegram_bot_username.lstrip("@")
    cached = getattr(request.app.state, "bot_username", None)
    if cached:
        return cached
    try:
        me = await request.app.state.bot.get_me()
    except Exception as exc:  # noqa: BLE001 — Telegram unreachable
        raise ApiError(502, "telegram_error", "Не удалось связаться с Telegram") from exc
    request.app.state.bot_username = me.username or ""
    return request.app.state.bot_username


async def _result(
    request: Request,
    repo: Repository,
    principal: Principal | None,
    account: User,
) -> LinkResult:
    """Linking result: the account and, for the web app, a session for it (the old one
    is ended — the account may have switched)."""
    settings = get_settings(request)
    session: WebSessionResponse | None = None
    if principal is None or principal.telegram is None:
        if principal is not None and principal.session_token:
            await end_session(repo, settings, principal.session_token)
        token = await issue_session(
            repo, settings, account.telegram_id, request.headers.get("user-agent")
        )
        session = WebSessionResponse(token=token, user_id=account.telegram_id)
    return LinkResult(account=await account_info(repo, settings, account), session=session)


async def _current_user(repo: Repository, principal: Principal) -> User:
    user = await repo.get_user(principal.user_id)
    if user is None:
        raise ApiError(401, "invalid_session", "Сессия устарела — войдите снова")
    return user


def _require_web(principal: Principal) -> str:
    """The web session token; Mini App requests are refused (they have Telegram)."""
    if principal.session_token is None:
        raise ApiError(409, "web_only", "Доступно только в приложении на телефоне")
    return principal.session_token


# --------------------------------------------------------------------------- #
#  Guest, account
# --------------------------------------------------------------------------- #


@router.post("/guest", response_model=WebSessionResponse, status_code=201)
async def create_guest_account(
    request: Request, repo: Repository = RepositoryDep
) -> WebSessionResponse:
    """First launch of the installed app without a session: a guest account is created
    silently, so habits are stored on the server from the first second."""
    limit(request, request.app.state.guest_limiter, client_ip(request))
    language = language_from_telegram(request.headers.get("accept-language"))
    user, token = await create_guest(
        repo, get_settings(request), language, request.headers.get("user-agent")
    )
    return WebSessionResponse(token=token, user_id=user.telegram_id)


@router.get("/account", response_model=AccountResponse)
async def read_account(
    request: Request,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> AccountResponse:
    """Logins of the account and whether it is still a guest."""
    return await account_info(repo, get_settings(request), db_user)


@router.post("/logout", status_code=204, response_class=Response)
async def logout(
    payload: LogoutRequest,
    request: Request,
    principal: Principal = Depends(get_principal),
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Web app: leave the account on this device — its session ends and this device's
    push subscription stops getting the account's reminders. A guest cannot log out: it
    has no login to come back with, its habits would be lost. `everywhere` — every web
    session of the account ends and none of its devices gets push reminders any more;
    the Mini App may ask for that too (it stays logged in: it is Telegram itself)."""
    if principal.session_token is None:
        if payload.everywhere and principal.telegram is not None:
            await end_all_sessions(repo, db_user.telegram_id)
            return Response(status_code=204)
        raise ApiError(409, "web_only", "Доступно только в приложении на телефоне")
    if await is_guest(repo, db_user):
        raise ApiError(409, "guest_logout", "Сначала привяжите Telegram")
    if payload.everywhere:
        await end_all_sessions(repo, db_user.telegram_id)
        return Response(status_code=204)
    if payload.endpoint:
        await repo.delete_push_subscriptions([payload.endpoint], user_id=db_user.telegram_id)
    await end_session(repo, get_settings(request), principal.session_token)
    return Response(status_code=204)


# --------------------------------------------------------------------------- #
#  Telegram → web handoff (spec 6.5)
# --------------------------------------------------------------------------- #


@router.post("/handoff", response_model=HandoffResponse)
async def create_handoff(
    payload: HandoffCreate,
    request: Request,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> HandoffResponse:
    """From the Mini App: a single-use, short-lived link to the install page that logs the
    installed app into this same account."""
    if principal.telegram is None:
        raise ApiError(409, "telegram_only", "Доступно только в Telegram")
    signed_at = principal.telegram.auth_date
    if signed_at is None or time.time() - signed_at > _HANDOFF_INIT_DATA_MAX_AGE:
        raise ApiError(409, "stale_init_data", "Откройте приложение заново")
    settings = get_settings(request)
    ttl = settings.handoff_ttl_minutes
    token = await create_code(
        repo, settings, CODE_HANDOFF, db_user.telegram_id, timedelta(minutes=ttl)
    )
    src = "".join(char for char in payload.src if char.isalnum() or char in "_-")[:32] or "settings"
    return HandoffResponse(
        token=token,
        url=f"{settings.web_base_url}/install?src={src}&h={token}",
        expires_in=ttl * 60,
    )


@router.post("/handoff/redeem", response_model=LinkResult)
async def redeem_handoff(
    payload: HandoffRedeem,
    request: Request,
    principal: Principal | None = Depends(get_optional_principal),
    repo: Repository = RepositoryDep,
) -> LinkResult:
    """Log in with a handoff link. A device that already has an account links Telegram to
    it (with the usual merge rules); otherwise it simply logs into that account.

    A guest with habits is asked first (409 `handoff_merge`, the link stays unused): the
    link may be someone else's, and the habits would move into that account."""
    limit(request, request.app.state.address_limiter, client_ip(request))
    expired = ApiError(410, "handoff_invalid", "Ссылка устарела — откройте её заново из Telegram")
    code = await find_code(repo, get_settings(request), payload.token, CODE_HANDOFF)
    if code is None or code.user_id is None:
        raise expired
    account = await repo.get_user(code.user_id)
    if account is None:
        raise expired
    web = principal if principal is not None and principal.telegram is None else None
    current = (
        await repo.get_user(web.user_id)
        if web is not None and web.user_id != account.telegram_id
        else None
    )
    if (
        current is not None
        and not payload.merge
        and await is_guest(repo, current)
        and await repo.user_has_data(current.telegram_id)
    ):
        raise ApiError(409, "handoff_merge", "Перенести привычки с этого телефона в аккаунт по ссылке?")
    if not await repo.use_code(code, utc_now()):
        raise expired
    if current is not None:
        profile = telegram_profile(account.telegram_id, account.username, account.first_name)
        account = await link_login(repo, current, profile)
    return await _result(request, repo, web, account)


# --------------------------------------------------------------------------- #
#  Telegram login on the web (spec 6.4)
# --------------------------------------------------------------------------- #


@router.post("/telegram/start", response_model=TelegramLoginStart)
async def start_telegram_login(
    request: Request,
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> TelegramLoginStart:
    """"Log in via Telegram" through the bot: the app opens the bot with a code, the user
    confirms in Telegram, and the app polls `/auth/telegram/poll`. Works in every
    browser and needs no domain setup in BotFather."""
    _require_web(principal)
    settings = get_settings(request)
    username = await bot_username(request)
    code = await create_code(
        repo, settings, CODE_TELEGRAM_LOGIN, principal.user_id, TELEGRAM_LOGIN_TTL, short=True
    )
    start = f"login_{code}"
    return TelegramLoginStart(
        code=code,
        app_url=f"tg://resolve?domain={username}&start={start}",
        web_url=f"https://t.me/{username}?start={start}",
        expires_in=int(TELEGRAM_LOGIN_TTL.total_seconds()),
    )


@router.post("/telegram/poll", response_model=TelegramLoginPoll)
async def poll_telegram_login(
    payload: TokenRequest,
    request: Request,
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> TelegramLoginPoll:
    """Pending until the user confirms in the bot; then the Telegram account is linked
    to the app's account (or the app switches to it)."""
    _require_web(principal)
    settings = get_settings(request)
    code = await find_code(repo, settings, payload.token, CODE_TELEGRAM_LOGIN)
    if code is None or code.user_id != principal.user_id:
        raise ApiError(410, "login_expired", "Вход устарел — попробуйте ещё раз")
    profile = confirmed_telegram(code)
    if profile is None:
        return TelegramLoginPoll(status="pending")
    if not await repo.use_code(code, utc_now()):
        raise ApiError(410, "login_expired", "Вход устарел — попробуйте ещё раз")
    account = await link_login(repo, await _current_user(repo, principal), profile)
    return TelegramLoginPoll(status="done", result=await _result(request, repo, principal, account))


@router.post("/telegram/widget", response_model=LinkResult)
async def telegram_widget_login(
    payload: TelegramWidgetLogin,
    request: Request,
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> LinkResult:
    """Telegram's official web login (oauth.telegram.org → back to the app with the
    signed result). Needs the app's domain set for the bot in BotFather (/setdomain)."""
    _require_web(principal)
    settings = get_settings(request)
    try:
        telegram = verify_telegram_login(
            payload.model_dump(), settings.bot_token.get_secret_value(), _TELEGRAM_LOGIN_MAX_AGE
        )
    except TelegramLoginError as exc:
        raise ApiError(401, "invalid_telegram_login", "Не удалось подтвердить вход через Telegram") from exc
    profile = telegram_profile(telegram.id, telegram.username, telegram.first_name)
    account = await link_login(repo, await _current_user(repo, principal), profile)
    return await _result(request, repo, principal, account)
