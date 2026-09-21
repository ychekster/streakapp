"""Валидация входных данных форм TMA.

Переиспользует валидаторы и константы бота (`bot.utils.validators`,
`bot.constants`), чтобы правила совпадали с теми, что действуют при создании
привычки и смене настроек через бота. Каждая функция возвращает разобранное
доменное значение или поднимает `ApiError` (единый формат ошибки API).
"""

from __future__ import annotations

from datetime import time

import pytz

from bot.constants import EVENING_RANGE, MORNING_RANGE, WEEKDAYS
from bot.database.models import FrequencyType
from bot.utils.validators import (
    is_evening_time_valid,
    is_morning_time_valid,
    looks_like_utc,
    parse_time,
    parse_utc_offset,
)
from tma.backend.constants import HABIT_NAME_MAX_LENGTH
from tma.backend.errors import ApiError

# Допустимые коды дней недели и их канонический порядок (пн → вс).
_WEEKDAY_CODES: set[str] = {code for code, _, _ in WEEKDAYS}
_WEEKDAY_ORDER: tuple[str, ...] = tuple(code for code, _, _ in WEEKDAYS)


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
        chosen = {code for code in days if code in _WEEKDAY_CODES}
        if not chosen:
            raise ApiError(422, "invalid_days", "Выберите хотя бы один день недели")
        ordered = ",".join(code for code in _WEEKDAY_ORDER if code in chosen)
        return FrequencyType.specific_days, ordered
    raise ApiError(422, "invalid_frequency", "Неизвестная частота")


def validate_reminder(reminder_time: str | None) -> time | None:
    """Разобрать необязательное время напоминания (None/пусто — без напоминания)."""
    if not reminder_time:
        return None
    parsed = parse_time(reminder_time)
    if parsed is None:
        raise ApiError(422, "invalid_time", "Время в формате ЧЧ:ММ, например 09:00")
    return parsed


def validate_morning_time(text: str) -> time:
    """Разобрать и проверить утреннее время (в диапазоне MORNING_RANGE)."""
    parsed = parse_time(text)
    if parsed is None:
        raise ApiError(422, "invalid_time", "Время в формате ЧЧ:ММ")
    if not is_morning_time_valid(parsed):
        start, end = MORNING_RANGE
        raise ApiError(
            422,
            "time_out_of_range",
            f"Утреннее уведомление — от {start:02d}:00 до {end:02d}:00",
        )
    return parsed


def validate_evening_time(text: str) -> time:
    """Разобрать и проверить вечернее время (в диапазоне EVENING_RANGE)."""
    parsed = parse_time(text)
    if parsed is None:
        raise ApiError(422, "invalid_time", "Время в формате ЧЧ:ММ")
    if not is_evening_time_valid(parsed):
        start = EVENING_RANGE[0]
        raise ApiError(
            422,
            "time_out_of_range",
            f"Вечернее уведомление — от {start:02d}:00 до 00:00",
        )
    return parsed


def resolve_timezone(value: str) -> str:
    """Привести ввод часового пояса к строке IANA.

    Принимает смещение «UTC±N» (как в боте) или готовое имя зоны IANA. Возвращает
    строку зоны для сохранения, иначе поднимает `ApiError`.
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
