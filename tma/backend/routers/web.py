"""Web app (PWA) support endpoints.

    GET  /web/config            — public settings (push key, bot for Telegram login)
    GET  /web/manifest          — the app manifest whose start address carries a handoff
    GET  /web/push              — does the account get push reminders
    POST /web/push/subscribe    — store this device's push subscription
    POST /web/push/unsubscribe  — forget it
    POST /web/push/test         — send a test notification to the account's devices
    POST /events                — funnel analytics event (no login needed; never blocks UI)
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from tma.backend.dependencies import (
    Principal,
    RepositoryDep,
    get_db_user,
    get_optional_principal,
    get_settings,
)
from tma.backend.errors import ApiError
from tma.backend.funnel import record_client_event
from tma.backend.models import User
from tma.backend.repository import Repository, utc_now
from tma.backend.routers.auth import client_ip, limit
from tma.backend.schemas import (
    EventIn,
    PushStatus,
    PushSubscriptionIn,
    PushUnsubscribe,
    WebConfig,
)
from tma.backend.webpush import PushOutcome, PushTarget, VapidKeys, notification, send_push

router = APIRouter(tags=["web"])

# Test notification text (Russian, like the rest of the web app's push texts).
_TEST_TITLE = "StreakApp"
_TEST_BODY = "Уведомления работают — напоминания будут приходить сюда"

# A handoff token as webauth.new_token makes it (URL-safe base64).
_HANDOFF_TOKEN = re.compile(r"[A-Za-z0-9_-]{16,128}")

# Same app as the static manifest of the build (tma/frontend/vite.config.ts — keep the two
# in step); only start_url differs.
_MANIFEST: dict[str, object] = {
    "id": "/app",
    "name": "StreakApp",
    "short_name": "StreakApp",
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
        telegram_bot_id=int(bot_id) if bot_id.isdigit() else None,
        google_available=bool(settings.google_client_id),
    )


@router.get("/web/manifest")
async def read_manifest(h: str = Query(default="")) -> JSONResponse:
    """Manifest for an install from the Mini App (iPhone): the home screen app starts at
    an address with the handoff token and logs into that Telegram account on its first
    launch (Safari's storage, where the landing could log in, is not shared with it)."""
    start = "/app?pwa=1"
    if _HANDOFF_TOKEN.fullmatch(h):
        start += f"&h={h}"
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
    if not payload.endpoint.startswith("https://"):
        raise ApiError(422, "invalid_subscription", "Некорректная подписка на уведомления")
    await repo.save_push_subscription(
        db_user.telegram_id,
        payload.endpoint,
        payload.keys.p256dh,
        payload.keys.auth,
        request.headers.get("user-agent"),
    )
    return PushStatus(subscribed=True)


@router.post("/web/push/unsubscribe", response_model=PushStatus)
async def unsubscribe_push(
    payload: PushUnsubscribe,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> PushStatus:
    """Forget this device's subscription (the account's own only)."""
    await repo.delete_push_subscriptions([payload.endpoint], user_id=db_user.telegram_id)
    return PushStatus(subscribed=await repo.has_push_subscription(db_user.telegram_id))


@router.post("/web/push/test", response_model=PushStatus)
async def test_push(
    request: Request,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> PushStatus:
    """Send a test notification to every device of the account (to check push works)."""
    settings = get_settings(request)
    if settings.vapid_private_key is None or not settings.vapid_public_key:
        raise ApiError(404, "push_unavailable", "Уведомления не настроены на сервере")
    keys = VapidKeys(settings.vapid_private_key.get_secret_value(), settings.vapid_subject)
    subscriptions = (await repo.push_subscriptions_for([db_user.telegram_id])).get(
        db_user.telegram_id, []
    )
    targets = [PushTarget(item.endpoint, item.p256dh, item.auth) for item in subscriptions]
    # No network while the transaction is open (see Repository.commit).
    await repo.commit()
    data = notification(_TEST_TITLE, _TEST_BODY, f"{settings.web_base_url}/app?pwa=1")
    outcomes = [await send_push(target, data, keys) for target in targets]
    gone = [t.endpoint for t, outcome in zip(targets, outcomes) if outcome is PushOutcome.gone]
    sent = [t.endpoint for t, outcome in zip(targets, outcomes) if outcome is PushOutcome.sent]
    await repo.delete_push_subscriptions(gone)
    await repo.mark_push_delivered(sent, utc_now())
    if not sent:
        raise ApiError(409, "push_not_delivered", "Не удалось доставить уведомление")
    return PushStatus(subscribed=True)


@router.post("/events", status_code=204, response_class=Response)
async def post_event(
    payload: EventIn,
    request: Request,
    principal: Principal | None = Depends(get_optional_principal),
    repo: Repository = RepositoryDep,
) -> Response:
    """Funnel event from the landing or the app. No login needed (the landing has none);
    the device's random `anon_id` (or address) is rate-limited."""
    limit(request, request.app.state.event_limiter, payload.anon_id or client_ip(request))
    await record_client_event(repo, payload, principal.user_id if principal else None)
    return Response(status_code=204)
