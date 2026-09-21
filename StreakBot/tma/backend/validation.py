"""Валидация входных данных форм TMA.

Каждая функция возвращает разобранное доменное значение или поднимает `ApiError`
(единый формат ошибки API).
"""

from __future__ import annotations

from datetime import datetime, time

import pytz

from tma.backend.constants import (
    HABIT_COLORS,
    HABIT_NAME_MAX_LENGTH,
    LANGUAGES,
    REMINDER_TIME_FORMAT,
    THEMES,
    WEEKDAYS,
)
from tma.backend.errors import ApiError
from tma.backend.models import FrequencyType
from tma.backend.timezones import looks_like_utc, parse_utc_offset


def validate_name(name: str) -> str:
    """Очистить и проверить название привычки (непустое, не длиннее лимита)."""
    cleaned = name.strip()
    if not cleaned:
        raise ApiError(422, "invalid_name", "Введите название привычки")
    if len(cleaned) > HABIT_NAME_MAX_LENGTH:
        raise ApiError(
            422, "invalid_name", f"Название не длиннее {HABIT_NAME_MAX_LENGTH} символов"
        )
    return cleaned


def validate_frequency(
    frequency_type: str, days: list[str]
) -> tuple[FrequencyType, str | None]:
    """Проверить частоту и собрать строку дней.

    Для `daily` дни не нужны (возвращается None). Для `specific_days` — хотя бы один
    валидный код; возвращается строка кодов в каноническом порядке («mon,wed,fri»).
    """
    if frequency_type == "daily":
        return FrequencyType.daily, None
    if frequency_type == "specific_days":
        chosen = {code for code in days if code in WEEKDAYS}
        if not chosen:
            raise ApiError(422, "invalid_days", "Выберите хотя бы один день недели")
        ordered = ",".join(code for code in WEEKDAYS if code in chosen)
        return FrequencyType.specific_days, ordered
    raise ApiError(422, "invalid_frequency", "Неизвестная частота")


def validate_reminder_time(value: str | None) -> time | None:
    """Разобрать время напоминания «ЧЧ:ММ»; None — привычка без напоминания."""
    if value is None:
        return None
    try:
        return datetime.strptime(value.strip(), REMINDER_TIME_FORMAT).time()
    except ValueError as exc:
        raise ApiError(
            422, "invalid_reminder_time", "Укажите время напоминания в формате ЧЧ:ММ"
        ) from exc


def validate_color(value: str) -> str:
    """Проверить, что цвет привычки — ключ палитры."""
    if value not in HABIT_COLORS:
        raise ApiError(422, "invalid_color", "Неизвестный цвет привычки")
    return value


def validate_language(value: str) -> str:
    """Проверить язык интерфейса."""
    if value not in LANGUAGES:
        raise ApiError(422, "invalid_language", "Неизвестный язык")
    return value


def validate_theme(value: str) -> str:
    """Проверить тему оформления."""
    if value not in THEMES:
        raise ApiError(422, "invalid_theme", "Неизвестная тема оформления")
    return value


def resolve_timezone(value: str) -> str:
    """Привести ввод часового пояса к строке IANA.

    Принимает смещение «UTC±N» или готовое имя зоны IANA. Возвращает строку зоны
    для сохранения, иначе поднимает `ApiError`.
    """
    text = value.strip()
    if looks_like_utc(text):
        resolved = parse_utc_offset(text)
        if resolved is None:
            raise ApiError(
                422, "invalid_timezone", "Часовой пояс вне диапазона UTC-12…UTC+14"
            )
        return resolved
    try:
        pytz.timezone(text)
    except Exception as exc:  # noqa: BLE001 — неизвестная зона → ошибка валидации
        raise ApiError(422, "invalid_timezone", "Не удалось распознать часовой пояс") from exc
    return text
