"""Web Push delivery (VAPID) for the installed web app.

Reminders reach web users as push notifications (spec §9): the bot's reminder loop
(bot/reminders.py) sends them; the API only uses this for a test notification.
`pywebpush` is synchronous (requests), so sending runs in a worker thread.

A subscription the push service reports as gone (404/410 — the app was removed or
notifications were switched off) must be deleted by the caller (`PushOutcome.gone`).
"""

from __future__ import annotations

import asyncio
import enum
import json
from dataclasses import dataclass
from typing import Any

from loguru import logger
from pywebpush import WebPushException, webpush

# How long the push service keeps an undelivered notification (seconds): a reminder an
# hour late is still useful, a day late is not.
PUSH_TTL_SECONDS = 60 * 60
# Network timeout of one push request (seconds).
_PUSH_TIMEOUT_SECONDS = 10
# Push service answers meaning "this subscription no longer exists".
_GONE_STATUSES = (404, 410)


@dataclass(frozen=True)
class PushTarget:
    """Where to deliver: a browser push subscription."""

    endpoint: str
    p256dh: str
    auth: str


class PushOutcome(str, enum.Enum):
    sent = "sent"
    gone = "gone"  # 404/410 — delete the subscription
    failed = "failed"  # temporary problem; keep the subscription


@dataclass(frozen=True)
class VapidKeys:
    """VAPID private key (base64url, raw 32 bytes or DER) and contact (`mailto:`/URL)."""

    private_key: str
    subject: str


def notification(title: str, body: str, url: str, tag: str | None = None) -> dict[str, Any]:
    """Payload the service worker shows (tma/frontend/src/sw.ts)."""
    data: dict[str, Any] = {"title": title, "body": body, "url": url}
    if tag:
        data["tag"] = tag
    return data


def _send_sync(target: PushTarget, payload: str, keys: VapidKeys) -> PushOutcome:
    try:
        webpush(
            subscription_info={
                "endpoint": target.endpoint,
                "keys": {"p256dh": target.p256dh, "auth": target.auth},
            },
            data=payload,
            vapid_private_key=keys.private_key,
            vapid_claims={"sub": keys.subject},
            ttl=PUSH_TTL_SECONDS,
            timeout=_PUSH_TIMEOUT_SECONDS,
        )
    except WebPushException as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status in _GONE_STATUSES:
            return PushOutcome.gone
        logger.warning("Push to {}… failed: {} {}", target.endpoint[:40], status, exc.message)
        return PushOutcome.failed
    except Exception as exc:  # noqa: BLE001 — network errors must not stop the caller
        logger.warning("Push to {}… failed: {}", target.endpoint[:40], exc)
        return PushOutcome.failed
    return PushOutcome.sent


async def send_push(target: PushTarget, data: dict[str, Any], keys: VapidKeys) -> PushOutcome:
    """Deliver one notification."""
    payload = json.dumps(data, ensure_ascii=False)
    return await asyncio.to_thread(_send_sync, target, payload, keys)
