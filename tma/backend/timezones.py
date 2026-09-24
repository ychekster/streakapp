"""Разбор и отображение часовых поясов.

Пояс выбирается городом и хранится строкой IANA (`Europe/Moscow`), а сам город — его id
в справочнике городов (cities.py): городов у зоны много, и в настройках показывается
тот, что выбрал пользователь («Санкт-Петербург», а не «Москва»). Смещение `UTC±N` API
тоже принимает — так пояс выбирали раньше, и у части пользователей он хранится как
`Etc/GMT-3`.

Здесь — каталог поясов для выбора (`GET /meta/timezones`), поиск города, перевод
смещения в зону и подписи для экрана настроек. Каталог — по поясу на зону из `zone.tab`
базы tz (pytz), у каждой зоны есть страна; город пояса — тот, что дал зоне имя (для
Europe/Moscow — Москва). Названия стран, а также городов зон, которых нет в
справочнике, — из CLDR (библиотека Babel).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from functools import lru_cache

import pytz
from babel import Locale
from babel.core import get_global

from tma.backend.cities import COUNTRY_SHORT_NAMES, City, city_index, normalize
from tma.backend.constants import LANGUAGES

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

# С какой длины запрос в поиске ищет и страну (см. _matching_countries).
_COUNTRY_QUERY_MIN_LENGTH = 3


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


def _requested_offset(text: str) -> int | None:
    """Смещение из поискового запроса («+3», «UTC-5», «+5:30») в минутах; не смещение —
    None."""
    match = _UTC_RE.match(text.strip())
    if not match:
        return None
    sign, hours, minutes = match.groups()
    total = int(hours) * 60 + int(minutes or 0)
    return -total if sign == "-" else total


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


def _country(code: str, language: str) -> str:
    """Страна на языке интерфейса по коду ISO 3166."""
    return _locale(language).territories.get(code, code)


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


@lru_cache(maxsize=1)
def _zone_cities() -> dict[str, City]:
    """Города справочника, давшие имя зонам каталога (Europe/Moscow → Москва): город той
    же зоны и страны, названный как зона или её город в CLDR; из нескольких — самый
    крупный. Зон, для которых такого города нет (Antarctica/Troll и т.п.), здесь нет."""
    index = city_index()
    by_zone: dict[str, list[City]] = {}
    for city in index.cities:
        by_zone.setdefault(city.zone, []).append(city)
    found: dict[str, City] = {}
    for zone, country in _zone_countries().items():
        wanted = {normalize(zone.rsplit("/", 1)[-1])}
        wanted.update(normalize(_city(zone, language)) for language in LANGUAGES)
        matches = [
            city
            for city in by_zone.get(zone, ())
            if city.country == country and not wanted.isdisjoint(index.names(city))
        ]
        if matches:
            found[zone] = max(matches, key=lambda city: city.population)
    return found


def _city_name(city: City, language: str) -> str:
    """Город на языке интерфейса. Если в справочнике нет названия на этом языке, а город
    дал имя зоне, название — из CLDR («Уральск», а не «Ural’sk»)."""
    if not city.has_name(language) and _zone_cities().get(city.zone) is city:
        return _city(city.zone, language)
    return city.name(language)


def selected_city(tz_string: str | None, city_id: int | None) -> City | None:
    """Город пояса пользователя: выбранный им, а если город не выбран (пояс выбран до
    справочника городов) — город, давший имя зоне. Для `UTC±N` города нет."""
    if not tz_string:
        return None
    city = city_index().get(city_id) if city_id is not None else None
    if city is not None and city.zone == tz_string:
        return city
    return _zone_cities().get(tz_string)


@dataclass(frozen=True)
class ZoneEntry:
    """Пояс для выбора: зона IANA, город (и его id, если он есть в справочнике), регион
    (только у города, одноимённого с другим городом страны), страна и текущее смещение."""

    zone: str
    city_id: int | None
    city: str
    region: str | None
    country: str
    offset: str


def _city_entry(city: City, language: str) -> ZoneEntry:
    return ZoneEntry(
        zone=city.zone,
        city_id=city.id,
        city=_city_name(city, language),
        region=city_index().region_name(city, language),
        country=_country(city.country, language),
        offset=_format_offset(_offset_minutes(city.zone)),
    )


def _zone_entry(zone: str, language: str) -> ZoneEntry:
    city = _zone_cities().get(zone)
    if city is not None:
        return _city_entry(city, language)
    return ZoneEntry(
        zone=zone,
        city_id=None,
        city=_city(zone, language),
        region=None,
        country=_country(_zone_countries()[zone], language),
        offset=_format_offset(_offset_minutes(zone)),
    )


def timezone_catalog(language: str) -> list[ZoneEntry]:
    """Каталог поясов для выбора в настройках: по смещению с запада на восток, внутри
    смещения — по алфавиту. Смещения считаются на текущий момент (летнее время)."""
    keyed: list[tuple[int, str, ZoneEntry]] = []
    for zone in _zone_countries():
        entry = _zone_entry(zone, language)
        keyed.append((_offset_minutes(zone), entry.city.casefold(), entry))
    keyed.sort(key=lambda item: item[:2])
    return [entry for _, _, entry in keyed]


def _matching_countries(query: str) -> set[str]:
    """Страны (коды ISO), в названии которых с начала слова стоит запрос («Росс» →
    Россия, «Штаты» и «США» → Соединённые Штаты), — на любом из языков интерфейса. Для
    запроса из одной-двух букв — никаких: под него подошла бы половина стран."""
    wanted = normalize(query)
    if len(wanted) < _COUNTRY_QUERY_MIN_LENGTH:
        return set()
    return {
        code
        for code in set(_zone_countries().values())
        if f" {wanted}" in " " + normalize(" ".join(_country_names(code)))
    }


def _country_names(code: str) -> list[str]:
    names = [_country(code, language) for language in LANGUAGES]
    return [*names, COUNTRY_SHORT_NAMES.get(code, "")]


def search_timezones(query: str, language: str, limit: int) -> list[ZoneEntry]:
    """Пояса по поисковому запросу:
     - смещение («+3», «UTC-5», «+5:30») — пояса каталога с этим смещением сейчас;
     - иначе — города справочника по названию (не больше `limit`, см. CityIndex.search),
       а следом, если запрос похож на название страны, — пояса каталога этой страны.
    """
    offset = _requested_offset(query)
    if offset is not None:
        return [entry for entry in timezone_catalog(language) if _offset_minutes(entry.zone) == offset]

    entries = [_city_entry(city, language) for city in city_index().search(query, limit)]
    countries = _matching_countries(query)
    if countries:
        shown = {entry.city_id for entry in entries}
        entries += [
            entry
            for entry in timezone_catalog(language)
            if _zone_countries()[entry.zone] in countries
            and (entry.city_id is None or entry.city_id not in shown)
        ]
    return entries


def timezone_display(tz_string: str, language: str, city: City | None) -> str:
    """Пояс для экрана настроек: город на языке интерфейса («Санкт-Петербург»), а для
    зон без города (UTC, Etc/GMT-3) — смещение («UTC+3»)."""
    if city is not None:
        return _city_name(city, language)
    if tz_string == "UTC" or tz_string.startswith("Etc/"):
        return utc_label(tz_string)
    return _city(tz_string, language)


def warm_up() -> None:
    """Загрузить справочник городов и связать зоны каталога с городами — при старте API,
    чтобы первый запрос не ждал."""
    _zone_cities()
