"""«Подключить ИИ» for administrators: app statistics, read only (backend/mcp.py).

Offered when the administrator asked for statistics on the consent page and work once
it is allowed in the bot (oauth.admin_allowed); every call checks again. Only the same
aggregate numbers the admin panel shows (backend/analytics/): no names, no profiles, no
broadcasts, blocks or deletions. Administrators and test accounts are not counted, as
in the panel; days are Almaty days.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.analytics import journey
from backend.analytics.data import load_dataset
from backend.analytics.service import section
from backend.constants import JOURNEY_MAX_DAYS
from backend.errors import ApiError
from backend.mcp import Context, Registry, Tool
from backend.oauth import admin_allowed
from backend.repository import utc_now


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


async def _check(ctx: Context) -> None:
    if not await admin_allowed(ctx.repo, ctx.connection):
        raise ApiError(
            403,
            "admin_not_allowed",
            "Statistics are not allowed yet: the administrator must press «Разрешить» "
            "under the Knot bot's message (or connect the AI again and ask for statistics).",
        )


def _dump(value: object) -> dict[str, Any]:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    raise TypeError(type(value))


class NoArgs(_Args):
    pass


async def admin_overview(ctx: Context, _: NoArgs) -> dict[str, Any]:
    await _check(ctx)
    return _dump(
        await section(
            ctx.repo, "overview", now=utc_now(), period="30", platform=None, source=None,
            basis=None, compare=None, language=ctx.user.language,
        )
    )


class ReportArgs(_Args):
    section: Literal["summary", "funnel", "retention", "churn", "habits", "sources", "messaging"]
    period: Literal["today", "7", "30", "90", "all"] = Field("30", description="Days up to today")
    platform: Literal["telegram", "web"] | None = Field(None, description="Only this version")
    source: str | None = Field(None, max_length=32, description="Only people from this source tag")
    retention_basis: Literal["open", "checkin"] | None = Field(
        None, description="retention: count app opens or check-ins (default)"
    )
    retention_compare: Literal["none", "platform", "source"] | None = None


async def admin_report(ctx: Context, args: ReportArgs) -> dict[str, Any]:
    await _check(ctx)
    return _dump(
        await section(
            ctx.repo, args.section, now=utc_now(), period=args.period, platform=args.platform,
            source=args.source, basis=args.retention_basis, compare=args.retention_compare,
            language=ctx.user.language,
        )
    )


class JourneyArgs(_Args):
    days: int = Field(30, ge=1, le=JOURNEY_MAX_DAYS)


async def admin_journey(ctx: Context, args: JourneyArgs) -> dict[str, Any]:
    await _check(ctx)
    return _dump(await journey.journey(ctx.repo, args.days))


async def admin_feature_usage(ctx: Context, _: NoArgs) -> dict[str, Any]:
    await _check(ctx)
    ds = await load_dataset(ctx.repo, utc_now())
    counted = set(ds.users)
    features = {
        name: len(users & counted) for name, users in (await ctx.repo.feature_users()).items()
    }
    features["push"] = len(ds.push_users & counted)
    with_habits = {task.user_id for task in ds.tasks if task.user_id in counted}
    return {
        "people": len(counted),
        "with_habits": len(with_habits),
        "features": features,
        "note": "People (not counting administrators and test accounts) who use each feature now.",
    }


def register(registry: Registry) -> None:
    add = registry.add
    add(Tool(
        "admin_overview", "App overview",
        "Knot statistics right now: people (new today, yesterday, this week and month; "
        "live, active, online), Telegram vs web app, habits, and 30 days by day.",
        NoArgs, admin_overview, admin=True,
    ))
    add(Tool(
        "admin_report", "App report",
        "A section of the admin analytics for a period: summary, funnel, retention, "
        "churn, habits (features, reminders, streaks), sources, messaging.",
        ReportArgs, admin_report, admin=True,
    ))
    add(Tool(
        "admin_journey", "Visitor journey",
        "How visitors of the site went on: install, first launch, bot, first habit; "
        "people at each step for the last N days.",
        JourneyArgs, admin_journey, admin=True,
    ))
    add(Tool(
        "admin_feature_usage", "Feature usage",
        "How many people use each feature: todos, lists, folders, timer goals, flexible "
        "schedule, shared habits, archive, notes, push, the AI connector.",
        NoArgs, admin_feature_usage, admin=True,
    ))
