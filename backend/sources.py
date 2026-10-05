"""Источник трафика: откуда пришёл пользователь (users.source и users.source_tag).

Метка в ссылке — «<источник>_<подпись>», например «threads_post12»: источник — латиница и
цифры, подпись (номер поста) — ещё и «_», «-». Где она бывает:

- бот: `t.me/<бот>?start=src_threads_post12` (bot/handlers/start.py) и Mini App по прямой
  ссылке: `startapp=src_threads_post12` (initData.start_param, dependencies.get_db_user);
- веб-версия: `?src=threads_post12` — лендинг запоминает её на устройстве и передаёт с
  событиями воронки (POST /events), а кнопка «Открыть в Telegram» — боту.

Источник запоминается при первом приходе и больше не меняется; без метки — «напрямую».
"""

from __future__ import annotations

import re

from backend.constants import (
    INTERNAL_SOURCES,
    SOURCE_DIRECT,
    SOURCE_MAX_LENGTH,
    SOURCE_OTHER,
    SOURCE_PRESETS,
    SOURCE_START_PREFIX,
    SOURCE_TAG_MAX_LENGTH,
)

_SOURCE = re.compile(r"[a-z0-9]+")
_TAG = re.compile(r"[a-z0-9_-]+")


def parse_source(value: str | None) -> tuple[str, str | None] | None:
    """Метка «threads_post12» → ("threads", "post12"); пустая, внутренняя («direct»,
    «settings»…) или некорректная — None."""
    text = (value or "").strip().lower()
    source, _, tag = text.partition("_")
    if not source or source in INTERNAL_SOURCES or not _SOURCE.fullmatch(source):
        return None
    clean_tag = tag[:SOURCE_TAG_MAX_LENGTH] if tag and _TAG.fullmatch(tag) else None
    return source[:SOURCE_MAX_LENGTH], clean_tag


def parse_start_param(value: str | None) -> tuple[str, str | None] | None:
    """Параметр /start или startapp «src_threads_post12» → ("threads", "post12")."""
    if not value or not value.lower().startswith(SOURCE_START_PREFIX):
        return None
    return parse_source(value[len(SOURCE_START_PREFIX):])


def source_name(source: str | None) -> str:
    """Источник для отчётов: без метки — «direct»."""
    return source or SOURCE_DIRECT


def source_group(source: str | None) -> str:
    """Значение фильтра «Источник»: готовый источник, «direct» или «other»."""
    name = source_name(source)
    if name == SOURCE_DIRECT or name in SOURCE_PRESETS:
        return name
    return SOURCE_OTHER
