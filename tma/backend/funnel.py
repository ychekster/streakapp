"""Web app funnel analytics (spec §10): recording events and the funnel report.

Events come from the landing and the app (`POST /events`) and from the server itself
(first habit, first check-in, linked login). The report counts each step for a period —
in total, by platform and by install source (`src`) — for the admin panel
(`GET /admin/funnel`) and the CLI (`scripts/funnel.py`).
"""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any

from tma.backend.accounts import client_platform
from tma.backend.constants import (
    EVENT_CONTEXTS,
    EVENT_PLATFORMS,
    EVENT_PROPS_MAX_BYTES,
    FUNNEL_EVENTS,
)
from tma.backend.errors import ApiError
from tma.backend.repository import Repository
from tma.backend.schemas import EventIn, FunnelResponse, FunnelRow

# Shown instead of an empty platform or source in the report.
UNKNOWN = "unknown"


def _known(value: str | None, allowed: tuple[str, ...]) -> str | None:
    return value if value in allowed else None


def _clean_src(value: str | None) -> str | None:
    """Install source as given by a link (`src=threads`): short, lower case, safe."""
    if not value:
        return None
    cleaned = "".join(char for char in value.lower() if char.isalnum() or char in "_-")
    return cleaned[:32] or None


async def record_client_event(repo: Repository, payload: EventIn, user_id: int | None) -> None:
    """Store an event sent by the landing or the app; unknown names are rejected."""
    if payload.event not in FUNNEL_EVENTS:
        raise ApiError(422, "invalid_event", "Неизвестное событие")
    props: dict[str, Any] | None = payload.props or None
    if props is not None and len(json.dumps(props, default=str)) > EVENT_PROPS_MAX_BYTES:
        raise ApiError(422, "invalid_event", "Слишком большие данные события")
    await repo.add_event(
        payload.event,
        user_id=user_id,
        anon_id=payload.anon_id or None,
        platform=_known(payload.platform, EVENT_PLATFORMS),
        browser_context=_known(payload.browser_context, EVENT_CONTEXTS),
        src=_clean_src(payload.src),
        props=props,
    )


async def record_server_event(
    repo: Repository,
    event: str,
    user_id: int,
    *,
    from_telegram: bool,
    user_agent: str | None,
    once: bool = True,
) -> bool:
    """Record a server-side step for the account; `once` — only its first time.
    True — recorded."""
    if once and await repo.has_event(event, user_id):
        return False
    await repo.add_event(
        event,
        user_id=user_id,
        platform=client_platform(user_agent),
        browser_context="telegram" if from_telegram else "standalone",
    )
    return True


async def funnel_report(repo: Repository, since: date, until: date) -> FunnelResponse:
    """Funnel steps for the days [since, until] (UTC, inclusive), in step order."""
    start = datetime.combine(since, time.min)
    end = datetime.combine(until + timedelta(days=1), time.min)
    totals: dict[str, int] = defaultdict(int)
    unique: dict[str, int] = defaultdict(int)
    by_platform: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_src: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for event, platform, src, count, distinct in await repo.event_counts(start, end):
        totals[event] += count
        # Distinct devices are counted per (platform, src) group; a device rarely
        # changes platform, so the sum is a close upper bound of the true number.
        unique[event] += distinct
        by_platform[event][platform or UNKNOWN] += count
        by_src[event][src or UNKNOWN] += count
    return FunnelResponse(
        since=since,
        until=until,
        steps=[
            FunnelRow(
                event=event,
                total=totals.get(event, 0),
                unique=unique.get(event, 0),
                by_platform=dict(by_platform.get(event, {})),
                by_src=dict(by_src.get(event, {})),
            )
            for event in FUNNEL_EVENTS
        ],
    )
