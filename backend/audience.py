"""Фильтры пользователей админ-панели: кого показать в списке пользователей и кому
отправить рассылку.

Фильтр — набор условий «признак: значение» (признаки и значения —
constants.AUDIENCE_FILTERS), условия складываются через «и». В запросе и в базе фильтр —
строка «признак:значение» через запятую («app:opened,habits:any»), пустая — все
пользователи. Признак «segment» — группа людей из аналитики, его значение — id группы.

Здесь строка разбирается и проверяется, а признаки, которые считает аналитика
(Repository.PRECOMPUTED_FILTERS: активирован, застрял после отметок, вероятно удалил,
серия, группа), превращаются в списки id (`resolve_audience`). Условие SQL по фильтру
строит репозиторий (`_audience_condition`).
"""

from __future__ import annotations

from datetime import datetime

from backend.constants import (
    AUDIENCE_FILTERS,
    AUDIENCE_MAX_LENGTH,
    BROADCAST_EXCLUDED_FILTERS,
    MAX_DB_INT,
    SEGMENT_FILTER,
)
from backend.errors import ApiError
from backend.repository import Repository

# Разобранный фильтр: признак → значение.
Audience = dict[str, str]
# Пользователи признаков, которые считаются заранее: признак → id.
AudienceIds = dict[str, set[int]]


def _invalid(message: str) -> ApiError:
    return ApiError(422, "invalid_filter", message)


def parse_audience(value: str | None, *, broadcast: bool = False) -> Audience:
    """Разобрать строку фильтра. Неизвестный признак или значение, повтор признака — 422
    `invalid_filter`; у рассылки (`broadcast`) — и признаки, которых у неё нет
    (constants.BROADCAST_EXCLUDED_FILTERS)."""
    text = (value or "").strip()
    if len(text) > AUDIENCE_MAX_LENGTH:
        raise _invalid("Слишком длинный фильтр")
    audience: Audience = {}
    for part in filter(None, (item.strip() for item in text.split(","))):
        key, _, option = part.partition(":")
        if key == SEGMENT_FILTER:
            if not option.isdigit() or int(option) > MAX_DB_INT:
                raise _invalid(f"Неизвестный фильтр: {part[:40]}")
        elif key not in AUDIENCE_FILTERS or option not in AUDIENCE_FILTERS[key]:
            raise _invalid(f"Неизвестный фильтр: {part[:40]}")
        if broadcast and key in BROADCAST_EXCLUDED_FILTERS:
            raise _invalid(f"Этот фильтр недоступен для рассылки: {key}")
        if key in audience:
            raise _invalid(f"Фильтр повторяется: {key}")
        audience[key] = option
    return audience


def audience_key(audience: Audience) -> str:
    """Строка фильтра в едином виде: признаки в порядке constants.AUDIENCE_FILTERS, группа
    — последней."""
    keys = [*AUDIENCE_FILTERS, SEGMENT_FILTER]
    return ",".join(f"{key}:{audience[key]}" for key in keys if key in audience)


async def resolve_audience(repo: Repository, audience: Audience, moment: datetime) -> AudienceIds:
    """Пользователи признаков, которые считает аналитика (см. описание модуля). Группа,
    которой нет, — пустой список (никто не подходит)."""
    # Импорт здесь: аналитика тяжёлая и нужна только фильтрам с такими признаками.
    from backend.analytics.data import load_dataset
    from backend.analytics.people import filter_ids

    ids: AudienceIds = {}
    if SEGMENT_FILTER in audience:
        segment = await repo.get_segment(int(audience[SEGMENT_FILTER]))
        ids[SEGMENT_FILTER] = set(segment.user_ids) if segment is not None else set()
    computed = [key for key in ("activated", "stuck", "uninstalled", "streak") if key in audience]
    if computed and not (computed == ["stuck"] and audience["stuck"] != "not_activated"):
        dataset = await load_dataset(repo, moment, include_excluded=True)
        for key in computed:
            ids[key] = await filter_ids(repo, dataset, key, audience[key])
    return ids
