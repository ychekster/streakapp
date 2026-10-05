"""Аналитика для эндпоинтов /admin/analytics/*: проверка параметров, набор данных под
фильтром и раздел; группы людей за цифрами; настройки активации."""

from __future__ import annotations

from datetime import datetime

from backend.analytics import people as people_module
from backend.analytics import report
from backend.analytics.data import (
    CONFIG_MIN_DAYS,
    CONFIG_WINDOW,
    Dataset,
    Period,
    load_config,
    load_dataset,
    make_period,
)
from backend.clock import local_day
from backend.constants import (
    ANALYTICS_PERIODS,
    PLATFORMS,
    SEGMENT_MAX_USERS,
    SOURCE_MAX_LENGTH,
)
from backend.errors import ApiError
from backend.models import User
from backend.repository import Repository
from backend.schemas import (
    AnalyticsConfig,
    AnalyticsConfigUpdate,
    SegmentCreate,
    SegmentInfo,
)

SECTIONS = ("summary", "funnel", "retention", "churn", "habits", "sources", "messaging")


def _period(key: str, now: datetime) -> Period:
    if key not in ANALYTICS_PERIODS:
        raise ApiError(422, "invalid_period", "Период — сегодня, 7, 30, 90 дней или всё время")
    return make_period(key, local_day(now))


def _platform(value: str | None) -> str | None:
    if not value:
        return None
    if value not in PLATFORMS:
        raise ApiError(422, "invalid_filter", "Платформа — telegram или web")
    return value


def _source(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) > SOURCE_MAX_LENGTH or not value.replace("_", "").isalnum():
        raise ApiError(422, "invalid_filter", "Некорректный источник")
    return value.lower()


async def _dataset(
    repo: Repository, now: datetime, platform: str | None, source: str | None
) -> Dataset:
    return await load_dataset(repo, now, platform=_platform(platform), source=_source(source))


async def section(
    repo: Repository,
    name: str,
    *,
    now: datetime,
    period: str,
    platform: str | None,
    source: str | None,
    basis: str | None,
    compare: str | None,
    language: str,
) -> object:
    """Раздел аналитики `name` (SECTIONS) за период под фильтром."""
    span = _period(period, now)
    ds = await _dataset(repo, now, platform, source)
    if name == "summary":
        return await report.summary(repo, ds, span)
    if name == "funnel":
        return await report.funnel(repo, ds, span, _platform(platform), _source(source))
    if name == "retention":
        if basis not in (None, "open", "checkin") or compare not in (None, "none", "platform", "source"):
            raise ApiError(422, "invalid_filter", "Некорректный вид удержания")
        return report.retention(ds, span, basis or "checkin", compare or "none")
    if name == "churn":
        return await report.churn(repo, ds, span)
    if name == "habits":
        return await report.habits(repo, ds, span)
    if name == "sources":
        return report.sources(ds, span, language)
    return await report.messaging(repo, ds, span)


async def create_segment(
    repo: Repository, admin: User, payload: SegmentCreate, now: datetime
) -> SegmentInfo:
    """Сохранить людей за цифрой аналитики группой (для списка и рассылки)."""
    span = _period(payload.period, now)
    ds = await _dataset(repo, now, payload.platform, payload.source)
    ids = await people_module.people(repo, ds, span, payload.metric, payload.arg, payload.basis)
    ordered = sorted(ids)[:SEGMENT_MAX_USERS]
    title = payload.title.strip() or payload.metric
    segment = await repo.create_segment(title, ordered, admin.telegram_id)
    return SegmentInfo(id=segment.id, title=segment.title, count=len(ordered))


async def get_segment(repo: Repository, segment_id: int) -> SegmentInfo:
    segment = await repo.get_segment(segment_id)
    if segment is None:
        raise ApiError(404, "segment_not_found", "Группа не найдена")
    return SegmentInfo(id=segment.id, title=segment.title, count=len(segment.user_ids))


async def read_config(
    repo: Repository, bot_username: str | None, web_url: str, now: datetime
) -> AnalyticsConfig:
    """Пороги активации, источники, которые уже встречались, и адреса для ссылок."""
    config = await load_config(repo)
    sources = (await load_dataset(repo, now)).sources
    return AnalyticsConfig(
        activation_window_days=config.window_days,
        activation_min_days=config.min_days,
        bot_username=bot_username,
        web_url=web_url,
        sources=sources,
    )


async def update_config(repo: Repository, payload: AnalyticsConfigUpdate) -> None:
    if payload.activation_min_days > payload.activation_window_days:
        raise ApiError(
            422, "invalid_config", "Дней с отметками не может быть больше, чем дней окна"
        )
    await repo.set_config(
        {
            CONFIG_WINDOW: str(payload.activation_window_days),
            CONFIG_MIN_DAYS: str(payload.activation_min_days),
        }
    )
