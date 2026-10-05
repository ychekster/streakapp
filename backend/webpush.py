"""Web Push delivery (VAPID) for the installed web app.

Reminders reach web users as push notifications (spec §9): the bot's reminder loop
(bot/reminders.py) sends them; the API only uses this for a test notification.
`pywebpush` is synchronous (requests), so sending runs in a worker thread.

A subscription the push service reports as gone (404/410 — the app was removed or
notifications were switched off) must be deleted by the caller (`PushOutcome.gone`).

The endpoint comes from the browser, so the server never sends to an address a client
made up, such as a host inside the server's network (`is_push_endpoint`): the known push
services of the browsers pass at once, any other host only if all of its addresses are
public, and a push service's redirect is never followed.
"""

from __future__ import annotations

import asyncio
import enum
import ipaddress
import json
import socket
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

import requests
from loguru import logger
from pywebpush import WebPushException, webpush

# How long the push service keeps an undelivered notification (seconds): a reminder an
# hour late is still useful, a day late is not.
PUSH_TTL_SECONDS = 60 * 60
# Network timeout of one push request (seconds).
_PUSH_TIMEOUT_SECONDS = 10
# Push service answers meaning "this subscription no longer exists".
_GONE_STATUSES = (404, 410)
# Push services of the browsers: Chrome, Edge on Android, Samsung, Opera (Google);
# Firefox (Mozilla); Safari on iPhone, iPad and Mac (Apple); Edge on Windows (Microsoft).
# Other browsers' services are allowed too, after a DNS check (see is_push_endpoint).
_PUSH_HOSTS = ("fcm.googleapis.com", "android.googleapis.com")
_PUSH_HOST_SUFFIXES = (".push.services.mozilla.com", ".push.apple.com", ".notify.windows.com")


def _public_host(host: str) -> bool:
    """Every address the name resolves to is a public one (not loopback, private, …)."""
    try:
        infos = socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except OSError:
        return False
    addresses = {ipaddress.ip_address(info[4][0].split("%")[0]) for info in infos}
    return bool(addresses) and all(address.is_global for address in addresses)


def is_push_endpoint(endpoint: str) -> bool:
    """An https address of a browser push service: default port, no credentials, a host
    name (not an IP). A known service passes at once; any other host — only if it
    resolves to public addresses only. Resolves DNS: call it off the event loop."""
    try:
        parts = urlsplit(endpoint)
        port = parts.port
    except ValueError:
        return False
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.scheme != "https" or port not in (None, 443) or parts.username or parts.password:
        return False
    if host in _PUSH_HOSTS or host.endswith(_PUSH_HOST_SUFFIXES):
        return True
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return "." in host and _public_host(host)


def _no_redirects() -> requests.Session:
    """HTTP session for one push: a redirect (possibly to an internal address) is an error."""
    session = requests.Session()
    session.max_redirects = 0
    return session


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
    """Payload the service worker shows (frontend/src/sw.ts)."""
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
            requests_session=_no_redirects(),
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
    """Deliver one notification. An address that is not a push service is never called
    (the subscription is reported gone, so the caller deletes it)."""
    payload = json.dumps(data, ensure_ascii=False)
    return await asyncio.to_thread(_checked_send, target, payload, keys)


def _checked_send(target: PushTarget, payload: str, keys: VapidKeys) -> PushOutcome:
    if not is_push_endpoint(target.endpoint):
        logger.warning("Push to {}… refused: not a push service", target.endpoint[:40])
        return PushOutcome.gone
    return _send_sync(target, payload, keys)
