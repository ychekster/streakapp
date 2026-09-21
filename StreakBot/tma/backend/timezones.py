"""Разбор и отображение часовых поясов.

Пояс выбирается городом из каталога (`GET /meta/timezones`) и хранится строкой IANA
(`Europe/Moscow`). Смещение `UTC±N` API тоже принимает — так пояс выбирали раньше, и
у части пользователей он хранится как `Etc/GMT-3`. Здесь — каталог поясов с
названиями городов и стран на языке интерфейса, перевод смещения в зону и подписи
для экрана настроек.

Названия берутся из CLDR (библиотека Babel), список зон — из `zone.tab` базы tz
(pytz): по одной зоне на город, у каждой есть страна.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

import pytz
from babel import Locale
from babel.core import get_global

# UTC-смещение: "UTC+3", "GMT-5", "+5:30", "utc +7" и т.п.
_UTC_RE = re.compile(r"^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::(\d{2}))?$", re.IGNORECASE)

# Полудробные/четвертные пояса, которые нельзя выразить через Etc/GMT.
# Ключ — "знакЧасы:Минуты", значение — реальная IANA-зона с таким смещением.
_FRACTIONAL_TZ: dict[str, str] = {
    "+3:30": "Asia/Tehran",
    "+4:30": "Asia/Kabul",
    "+5:30": "Asia/Kolkata",
    "+5:45": "Asia/Kathmandu",
    "+6:30": "Asia/Yangon",
    "+9:30": "Australia/Darwin",
    "+10:30": "Australia/Adelaide",
    "+12:45": "Pacific/Chatham",
    "-3:30": "America/St_Johns",
    "-9:30": "Pacific/Marquesas",
}


def looks_like_utc(text: str) -> bool:
    """Похоже ли это на ввод часового пояса в формате UTC±Число."""
    return bool(_UTC_RE.match(text.strip()))


def parse_utc_offset(text: str) -> str | None:
    """Распарсить UTC-смещение в строку IANA-таймзоны.

    Принимает: 'UTC+3', 'UTC-5', 'UTC+5:30' и аналоги. Проверяет диапазон
    от UTC-12 до UTC+14. Возвращает строку таймзоны ('Etc/GMT-3', 'Asia/Kolkata',
    'UTC') или None, если формат не распознан, смещение вне диапазона либо
    дробное смещение не имеет представимой зоны.
    """
    match = _UTC_RE.match(text.strip())
    if not match:
        return None

    sign, hours_str, minutes_str = match.group(1), match.group(2), match.group(3)
    hours = int(hours_str)
    minutes = int(minutes_str) if minutes_str else 0
    if minutes not in (0, 30, 45):
        return None

    # Знаковое смещение в часах для проверки диапазона.
    signed_hours = hours + minutes / 60
    if sign == "-":
        signed_hours = -signed_hours
    if not (-12 <= signed_hours <= 14):
        return None

    if minutes == 0:
        if hours == 0:
            return "UTC"
        # В именах Etc/GMT знак инвертирован: Etc/GMT-3 == UTC+3.
        etc_sign = "-" if sign == "+" else "+"
        return f"Etc/GMT{etc_sign}{hours}"

    key = f"{sign}{hours}:{minutes:02d}"
    return _FRACTIONAL_TZ.get(key)


def _offset_minutes(tz_string: str) -> int:
    """Текущее смещение зоны от UTC в минутах (с учётом летнего времени)."""
    offset = datetime.now(pytz.timezone(tz_string)).utcoffset() or timedelta(0)
    return int(offset.total_seconds() // 60)


def _format_offset(total_minutes: int) -> str:
    """Подпись смещения: 'UTC+3', 'UTC-5', 'UTC+5:30'."""
    sign = "+" if total_minutes >= 0 else "-"
    hours, minutes = divmod(abs(total_minutes), 60)
    if minutes:
        return f"UTC{sign}{hours}:{minutes:02d}"
    return f"UTC{sign}{hours}"


def utc_label(tz_string: str) -> str:
    """Вернуть подпись текущего UTC-смещения зоны, например 'UTC+3' или 'UTC+5:30'."""
    try:
        return _format_offset(_offset_minutes(tz_string))
    except Exception:  # noqa: BLE001 — неизвестная зона не должна ронять отображение
        return tz_string


@lru_cache
def _locale(language: str) -> Locale:
    return Locale.parse(language)


@lru_cache
def _zone_countries() -> dict[str, str]:
    """Зоны каталога и их страны (код ISO 3166) — из `zone.tab`."""
    return {zone: country for country, zones in pytz.country_timezones.items() for zone in zones}


@lru_cache
def _cldr_names(zone: str) -> tuple[str, ...]:
    """Имена, под которыми зона может храниться в CLDR.

    CLDR держится устаревших имён (`Europe/Kiev`, `Asia/Calcutta`), а в базе tz
    зона уже переименована (`Europe/Kyiv`, `Asia/Kolkata`) — поэтому кроме самой
    зоны пробуем её каноническое имя в CLDR и все его синонимы.
    """
    aliases: dict[str, str] = get_global("zone_aliases")  # синоним → каноническое имя
    canonical = aliases.get(zone, zone)
    synonyms = [alias for alias, target in aliases.items() if target == canonical]
    return tuple(dict.fromkeys([zone, canonical, *synonyms]))


def _city(zone: str, language: str) -> str:
    """Город зоны на языке интерфейса; нет в CLDR — из имени зоны («Buenos Aires»)."""
    time_zones = _locale(language).time_zones
    for name in _cldr_names(zone):
        city = time_zones.get(name, {}).get("city")
        if city:
            return city
    return zone.rsplit("/", 1)[-1].replace("_", " ")


@dataclass(frozen=True)
class ZoneEntry:
    """Пояс каталога: зона IANA, город, страна и текущее смещение."""

    zone: str
    city: str
    country: str
    offset: str


@lru_cache
def _zone_places(language: str) -> tuple[tuple[str, str, str], ...]:
    """(зона, город, страна) для всех зон каталога на языке интерфейса."""
    territories = _locale(language).territories
    return tuple(
        (zone, _city(zone, language), territories.get(country, country))
        for zone, country in _zone_countries().items()
    )


def timezone_catalog(language: str) -> list[ZoneEntry]:
    """Каталог поясов для выбора в настройках: по смещению с запада на восток, внутри
    смещения — по алфавиту. Смещения считаются на текущий момент (летнее время)."""
    keyed: list[tuple[int, str, ZoneEntry]] = []
    for zone, city, country in _zone_places(language):
        minutes = _offset_minutes(zone)
        entry = ZoneEntry(zone, city, country, _format_offset(minutes))
        keyed.append((minutes, city.casefold(), entry))
    keyed.sort(key=lambda item: item[:2])
    return [entry for _, _, entry in keyed]


def timezone_display(tz_string: str, language: str) -> str:
    """Пояс для экрана настроек: город на языке интерфейса («Москва»), а для зон
    без города (UTC, Etc/GMT-3) — смещение («UTC+3»)."""
    if tz_string == "UTC" or tz_string.startswith("Etc/"):
        return utc_label(tz_string)
    return _city(tz_string, language)
