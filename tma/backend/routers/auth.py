"""Accounts and logins of the web app (spec §6).

    POST   /auth/guest                — first launch of the installed app: a guest + session
    GET    /auth/account              — logins of the account (Settings → Account)
    POST   /auth/handoff              — Mini App: single-use link to install the web app
    POST   /auth/handoff/redeem       — browser/app: log in with that link
    POST   /auth/complete             — app: exchange a redirect login result for a session
    POST   /auth/telegram/start       — app: "log in via Telegram" through the bot
    POST   /auth/telegram/poll        — app: has the bot confirmed it?
    POST   /auth/telegram/widget      — app: Telegram web login result (hash-checked)
    POST   /auth/google/start         — app or Mini App: where to sign in with Google
    GET    /auth/google/callback      — Google sends the browser back here
    DELETE /auth/logins/{provider}    — unlink a login (never the last one)

Logins always attach to the account the request is made from; linking may switch to
or merge with another account (see accounts.py). The web app then gets a new session,
because its account may have changed.
"""

from __future__ import annotations

import zlib
from datetime import timedelta

from fastapi import APIRouter, Depends, Path, Request
from fastapi.responses import RedirectResponse
from loguru import logger

from tma.backend import google_oauth
from tma.backend.accounts import (
    CODE_GOOGLE_STATE,
    CODE_HANDOFF,
    CODE_LOGIN_RESULT,
    CODE_TELEGRAM_LOGIN,
    GOOGLE_STATE_TTL,
    LOGIN_RESULT_TTL,
    PROVIDER_TELEGRAM,
    PROVIDERS,
    TELEGRAM_LOGIN_TTL,
    LoginProfile,
    account_info,
    code_payload,
    confirmed_telegram,
    create_code,
    create_guest,
    end_session,
    find_code,
    issue_session,
    link_login,
    take_code,
    telegram_profile,
    unlink_login,
)
from tma.backend.config import Settings
from tma.backend.dependencies import (
    Principal,
    RepositoryDep,
    get_db_user,
    get_optional_principal,
    get_principal,
    get_settings,
)
from tma.backend.errors import ApiError
from tma.backend.models import User
from tma.backend.ratelimit import RateLimiter, retry_after_header
from tma.backend.repository import Repository, utc_now
from tma.backend.schemas import (
    AccountResponse,
    GoogleStart,
    HandoffCreate,
    HandoffResponse,
    LinkResult,
    RedirectUrl,
    TelegramLoginPoll,
    TelegramLoginStart,
    TelegramWidgetLogin,
    TokenRequest,
    WebSessionResponse,
)
from tma.backend.services import language_from_telegram
from tma.backend.webauth import TelegramLoginError, verify_telegram_login

router = APIRouter(prefix="/auth", tags=["auth"])

# Telegram web login data older than this is not accepted (seconds).
_TELEGRAM_LOGIN_MAX_AGE = 24 * 60 * 60


def client_ip(request: Request) -> str:
    """The caller's address behind Cloudflare / nginx (for rate limits only)."""
    forwarded = request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
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
    settings = get_settings(request)
    ttl = settings.handoff_ttl_minutes
    token = await create_code(
        repo, settings, CODE_HANDOFF, db_user.telegram_id, timedelta(minutes=ttl)
    )
    src = "".join(char for char in payload.src if char.isalnum() or char in "_-")[:32] or "settings"
    return HandoffResponse(
        token=token,
        url=f"{settings.web_base_url}/?src={src}&h={token}",
        expires_in=ttl * 60,
    )


@router.post("/handoff/redeem", response_model=LinkResult)
async def redeem_handoff(
    payload: TokenRequest,
    request: Request,
    principal: Principal | None = Depends(get_optional_principal),
    repo: Repository = RepositoryDep,
) -> LinkResult:
    """Log in with a handoff link. A device that already has an account links Telegram to
    it (with the usual merge rules); otherwise it simply logs into that account."""
    settings = get_settings(request)
    code = await take_code(repo, settings, payload.token, CODE_HANDOFF)
    if code is None or code.user_id is None:
        raise ApiError(410, "handoff_invalid", "Ссылка устарела — откройте её заново из Telegram")
    account = await repo.get_user(code.user_id)
    if account is None:
        raise ApiError(410, "handoff_invalid", "Ссылка устарела — откройте её заново из Telegram")
    web = principal if principal is not None and principal.telegram is None else None
    if web is not None and web.user_id != account.telegram_id:
        current = await repo.get_user(web.user_id)
        if current is not None:
            profile = telegram_profile(account.telegram_id, account.username, account.first_name)
            account = await link_login(repo, current, profile)
    return await _result(request, repo, web, account)


@router.post("/complete", response_model=LinkResult)
async def complete_login(
    payload: TokenRequest,
    request: Request,
    principal: Principal | None = Depends(get_optional_principal),
    repo: Repository = RepositoryDep,
) -> LinkResult:
    """After a redirect login (Google) the app gets a one-time result code in its address
    and exchanges it here for a session of the (possibly switched) account."""
    code = await take_code(repo, get_settings(request), payload.token, CODE_LOGIN_RESULT)
    account = await repo.get_user(code.user_id) if code and code.user_id is not None else None
    if account is None:
        raise ApiError(410, "login_expired", "Вход устарел — попробуйте ещё раз")
    web = principal if principal is not None and principal.telegram is None else None
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


# --------------------------------------------------------------------------- #
#  Google (spec 6.3)
# --------------------------------------------------------------------------- #


@router.post("/google/start", response_model=RedirectUrl)
async def start_google_login(
    payload: GoogleStart,
    request: Request,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> RedirectUrl:
    """Where to send the browser to link Google to this account."""
    settings = get_settings(request)
    if not settings.google_client_id:
        raise ApiError(404, "google_unavailable", "Вход через Google не настроен")
    mode = "telegram" if principal.telegram is not None else payload.mode
    state = await create_code(
        repo, settings, CODE_GOOGLE_STATE, db_user.telegram_id, GOOGLE_STATE_TTL, {"mode": mode}
    )
    return RedirectUrl(url=google_oauth.authorization_url(settings, state))


@router.get("/google/callback", include_in_schema=False)
async def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    repo: Repository = RepositoryDep,
) -> RedirectResponse:
    """Google sends the browser back here. The login is linked on the server right away;
    the installed app then gets a one-time result code to switch its session, and a
    login started in Telegram ends on a "return to Telegram" page."""
    settings: Settings = get_settings(request)
    base = settings.web_base_url
    state_code = await take_code(repo, settings, state or "", CODE_GOOGLE_STATE)
    mode = code_payload(state_code).get("mode") if state_code is not None else "web"

    def finish(error_code: str | None = None, result: str | None = None) -> RedirectResponse:
        if mode == "telegram":
            url = f"{base}/linked?provider=google" + (f"&error={error_code}" if error_code else "")
        elif error_code:
            url = f"{base}/app?pwa=1&auth_error={error_code}"
        else:
            url = f"{base}/app?pwa=1&auth={result}"
        return RedirectResponse(url, status_code=303)

    if state_code is None or state_code.user_id is None:
        return finish("login_expired")
    if error or not code:
        return finish("cancelled")
    current = await repo.get_user(state_code.user_id)
    if current is None:
        return finish("login_expired")
    try:
        profile: LoginProfile = await google_oauth.exchange_code(settings, code)
    except google_oauth.GoogleAuthError as exc:
        logger.warning("Google login failed: {}", exc)
        return finish("google_failed")
    try:
        account = await link_login(repo, current, profile)
    except ApiError as exc:
        return finish(exc.code)
    if mode == "telegram":
        return finish()
    result = await create_code(
        repo, settings, CODE_LOGIN_RESULT, account.telegram_id, LOGIN_RESULT_TTL
    )
    return finish(result=result)


# --------------------------------------------------------------------------- #
#  Unlinking
# --------------------------------------------------------------------------- #


@router.delete("/logins/{provider}", response_model=LinkResult)
async def unlink(
    request: Request,
    provider: str = Path(..., max_length=16),
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> LinkResult:
    """Unlink a login; the last one cannot be unlinked. Telegram is unlinked only from the
    web app: inside Telegram it is the very login in use."""
    if provider not in PROVIDERS:
        raise ApiError(404, "login_not_linked", "Этот способ входа не привязан")
    if provider == PROVIDER_TELEGRAM and principal.telegram is not None:
        raise ApiError(409, "web_only", "Доступно только в приложении на телефоне")
    account = await unlink_login(repo, db_user, provider)
    return await _result(request, repo, principal, account)

