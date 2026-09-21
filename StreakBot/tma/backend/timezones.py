"""Разбор и отображение часовых поясов.

Пояс вводится как смещение `UTC±N` (варианты из `GET /meta`) и хранится строкой
IANA (`Etc/GMT-3`, `Asia/Kolkata`, …). Здесь — перевод смещения в зону и
человекочитаемые подписи для экрана настроек.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta

import pytz

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


def utc_label(tz_string: str) -> str:
    """Вернуть подпись текущего UTC-смещения зоны, например 'UTC+3' или 'UTC+5:30'."""
    try:
        offset = datetime.now(pytz.timezone(tz_string)).utcoffset() or timedelta(0)
    except Exception:  # noqa: BLE001 — неизвестная зона не должна ронять отображение
        return tz_string
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    total_minutes = abs(total_minutes)
    hours, minutes = divmod(total_minutes, 60)
    if minutes:
        return f"UTC{sign}{hours}:{minutes:02d}"
    return f"UTC{sign}{hours}"


def format_timezone_display(tz_string: str) -> str:
    """Человекочитаемое представление часового пояса для экрана настроек.

    Для зон Etc/GMT и UTC — просто 'UTC±N'. Для именованных зон — 'Город (UTC±N)'.
    """
    label = utc_label(tz_string)
    if tz_string == "UTC" or tz_string.startswith("Etc/"):
        return label
    city = tz_string.split("/")[-1].replace("_", " ")
    return f"{city} ({label})"
