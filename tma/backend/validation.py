"""Валидация входных данных форм TMA.

Каждая функция возвращает разобранное доменное значение или поднимает `ApiError`
(единый формат ошибки API).
"""

from __future__ import annotations

import unicodedata
from datetime import datetime, time

import pytz

from tma.backend.cities import City, city_index
from tma.backend.constants import (
    BROADCAST_SEGMENTS,
    HABIT_COLORS,
    HABIT_NAME_MAX_LENGTH,
    LANGUAGES,
    REMINDER_TIME_FORMAT,
    REVIEW_MAX_LENGTH,
    THEMES,
    WEEKDAYS,
)
from tma.backend.errors import ApiError
from tma.backend.models import FrequencyType
from tma.backend.timezones import looks_like_utc, parse_utc_offset


def validate_name(name: str) -> str:
    """Очистить и проверить название привычки (непустое, не длиннее лимита).

    Управляющие символы (перевод строки, табуляция, NUL…) заменяются пробелом, а
    повторяющиеся пробелы схлопываются: название — одна строка и в приложении, и в
    напоминании в чате, а NUL вообще не принимает PostgreSQL.
    """
    printable = "".join(
        " " if unicodedata.category(char) == "Cc" else char for char in name
    )
    cleaned = " ".join(printable.split())
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
        # pytz находит зону и без учёта регистра — храним каноническое имя.
        return pytz.timezone(text).zone
    except Exception as exc:  # noqa: BLE001 — неизвестная зона → ошибка валидации
        raise ApiError(422, "invalid_timezone", "Не удалось распознать часовой пояс") from exc


def resolve_city(city_id: int) -> City:
    """Город справочника по id (его зона станет поясом пользователя)."""
    city = city_index().get(city_id)
    if city is None:
        raise ApiError(422, "invalid_timezone", "Город не найден")
    return city


# Управляющие символы, которые остаются в многострочном тексте: перевод строки и табуляция.
_KEPT_CONTROL = {"\n", "\t"}


def _clean_text(value: str) -> str:
    """Многострочный текст без управляющих символов, кроме перевода строки и табуляции
    (NUL не принимает PostgreSQL), с переводами строк «\\n» и без пробелов по краям."""
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    return "".join(
        char
        for char in text
        if char in _KEPT_CONTROL or unicodedata.category(char) != "Cc"
    ).strip()


def validate_review(text: str) -> str:
    """Очистить и проверить текст отзыва (непустой, не длиннее REVIEW_MAX_LENGTH)."""
    cleaned = _clean_text(text)
    if not cleaned:
        raise ApiError(422, "invalid_review", "Напишите отзыв")
    if len(cleaned) > REVIEW_MAX_LENGTH:
        raise ApiError(
            422, "invalid_review", f"Отзыв не длиннее {REVIEW_MAX_LENGTH} символов"
        )
    return cleaned


def validate_message(text: str, max_length: int) -> str:
    """Очистить и проверить текст сообщения бота: личного сообщения, ответа на отзыв,
    текстовой рассылки (непустой, не длиннее `max_length`)."""
    cleaned = validate_caption(text, max_length)
    if cleaned is None:
        raise ApiError(422, "invalid_message", "Введите текст сообщения")
    return cleaned


def validate_caption(text: str, max_length: int) -> str | None:
    """Очистить и проверить подпись к фото или видео рассылки; пустая — None (медиа без
    подписи)."""
    cleaned = _clean_text(text)
    if len(cleaned) > max_length:
        raise ApiError(
            422, "invalid_message", f"Сообщение не длиннее {max_length} символов"
        )
    return cleaned or None


def validate_segment(value: str) -> str:
    """Проверить сегмент получателей рассылки."""
    if value not in BROADCAST_SEGMENTS:
        raise ApiError(422, "invalid_segment", "Неизвестный сегмент получателей")
    return value
