"""Web app (PWA) support endpoints.

    GET  /web/config            — public settings (push key, bot for Telegram login)
    GET  /web/manifest          — the app manifest whose start address carries a handoff
    GET  /web/push              — does the account get push reminders
    POST /web/push/subscribe    — store this device's push subscription
    POST /web/push/unsubscribe  — forget it
    POST /events                — funnel analytics event (no login needed; never blocks UI)
"""

from __future__ import annotations

import asyncio
import re

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from backend.constants import ANON_ID_PATTERN
from backend.dependencies import (
    Principal,
    RepositoryDep,
    get_db_user,
    get_optional_principal,
    get_settings,
)
from backend.errors import ApiError
from backend.funnel import record_client_event
from backend.models import User
from backend.repository import Repository
from backend.routers.auth import client_ip, limit
from backend.schemas import (
    EventIn,
    PushStatus,
    PushSubscriptionIn,
    PushUnsubscribe,
    WebConfig,
)
from backend.webpush import is_push_endpoint

router = APIRouter(tags=["web"])

# A handoff token as webauth.new_token makes it (URL-safe base64).
_HANDOFF_TOKEN = re.compile(r"[A-Za-z0-9_-]{16,128}")
# Install source of the landing (`src=threads_post12`, see sources.py).
_SOURCE = re.compile(r"[a-z0-9_-]{1,32}")
_ANON_ID = re.compile(ANON_ID_PATTERN)

# Same app as the static manifest of the build (frontend/vite.config.ts — keep the two
# in step); only start_url differs.
_MANIFEST: dict[str, object] = {
    "id": "/app",
    "name": "Knot",
    "short_name": "Knot",
    "description": "Трекер привычек: отмечайте дни и копите стрики",
    "lang": "ru",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#2f8ff5",
    "theme_color": "#f2f2f7",
    "icons": [
        {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {
            "src": "/icons/maskable-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "maskable",
        },
    ],
}


@router.get("/web/config", response_model=WebConfig)
async def read_web_config(request: Request) -> WebConfig:
    """Public settings the web app needs before (and after) login."""
    settings = get_settings(request)
    bot_id = settings.bot_token.get_secret_value().split(":", 1)[0]
    return WebConfig(
        vapid_public_key=settings.vapid_public_key or None,
        telegram_bot_username=settings.telegram_bot_username.lstrip("@") or None,
        telegram_bot_id=int(bot_id) if bot_id.isdecimal() else None,
    )


@router.get("/web/manifest")
async def read_manifest(
    h: str = Query(default=""), s: str = Query(default=""), v: str = Query(default="")
) -> JSONResponse:
    """Manifest for an install from an iPhone: the home screen app starts at an address
    with the handoff token (from the Mini App: it logs into that Telegram account on its
    first launch — Safari's storage is not shared with it) and the install source `s`
    (the link's `src=`, for analytics) and the device id `v` (the visitor's path in the
    admin panel goes on from the landing)."""
    start = "/app?pwa=1"
    if _HANDOFF_TOKEN.fullmatch(h):
        start += f"&h={h}"
    if _SOURCE.fullmatch(s):
        start += f"&src={s}"
    if _ANON_ID.fullmatch(v):
        start += f"&v={v}"
    return JSONResponse(
        {**_MANIFEST, "start_url": start},
        media_type="application/manifest+json",
        headers={"Cache-Control": "no-store"},
    )


@router.get("/web/push", response_model=PushStatus)
async def read_push_status(
    db_user: User = Depends(get_db_user), repo: Repository = RepositoryDep
) -> PushStatus:
    """Whether reminders of the account go out as push notifications."""
    return PushStatus(subscribed=await repo.has_push_subscription(db_user.telegram_id))


@router.post("/web/push/subscribe", response_model=PushStatus)
async def subscribe_push(
    payload: PushSubscriptionIn,
    request: Request,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> PushStatus:
    """Store (or move to this account) the device's push subscription. From now on the
    account's reminders come as push notifications instead of bot messages."""
    if not await asyncio.to_thread(is_push_endpoint, payload.endpoint):
        raise ApiError(422, "invalid_subscription", "Некорректная подписка на уведомления")
    first = not await repo.has_push_subscription(db_user.telegram_id)
    saved = await repo.save_push_subscription(
        db_user.telegram_id,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        request.headers.get("user-agent"),
    )
    if not saved:
        raise ApiError(422, "invalid_subscription", "Некорректная подписка на уведомления")
    if first:
        await repo.log_action(db_user.telegram_id, "push_on")
    return PushStatus(subscribed=True)


@router.post("/web/push/unsubscribe", response_model=PushStatus)
async def unsubscribe_push(
    payload: PushUnsubscribe,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> PushStatus:
    """Forget this device's subscription (the account's own only)."""
    await repo.delete_push_subscriptions([payload.endpoint], user_id=db_user.telegram_id)
    subscribed = await repo.has_push_subscription(db_user.telegram_id)
    if not subscribed:
        await repo.log_action(db_user.telegram_id, "push_off")
    return PushStatus(subscribed=subscribed)


@router.post("/events", status_code=204, response_class=Response)
async def post_event(
    payload: EventIn,
    request: Request,
    principal: Principal | None = Depends(get_optional_principal),
    repo: Repository = RepositoryDep,
) -> Response:
    """Funnel event from the landing or the app. No login needed (the landing has none);
    the address and the device's random `anon_id` are rate-limited."""
    limit(request, request.app.state.address_limiter, client_ip(request))
    if payload.anon_id:
        limit(request, request.app.state.event_limiter, payload.anon_id)
    await record_client_event(repo, payload, principal.user_id if principal else None)
    return Response(status_code=204)
