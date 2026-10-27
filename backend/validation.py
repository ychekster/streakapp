"""Валидация входных данных форм TMA.

Каждая функция возвращает разобранное доменное значение или поднимает `ApiError`
(единый формат ошибки API).
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, time, timedelta

import pytz

from backend.cities import City, city_index
from backend.constants import (
    GRID_LAYOUTS,
    BROADCAST_BUTTONS,
    CUSTOM_HABIT_COLOR_PATTERN,
    FOLDER_NAME_MAX_LENGTH,
    HABIT_COLORS,
    HABIT_DESCRIPTION_MAX_LENGTH,
    HABIT_NAME_MAX_LENGTH,
    NOTE_MAX_LENGTH,
    LANGUAGES,
    MAX_DB_INT,
    MAX_REMINDERS_PER_HABIT,
    GOAL_UNITS,
    MAX_GOAL_SECONDS,
    MAX_TIMES_PER_DAY,
    MIN_GOAL_SECONDS,
    PERIOD_MAX_TIMES,
    REMINDER_TIME_FORMAT,
    REVIEW_MAX_LENGTH,
    START_DATE_MAX_AHEAD_DAYS,
    THEMES,
    WEEKDAYS,
)
from backend.errors import ApiError
from backend.models import FrequencyType
from backend.timezones import looks_like_utc, parse_utc_offset


def _one_line(text: str) -> str:
    """Управляющие символы (перевод строки, табуляция, NUL…) — пробелом, повторяющиеся
    пробелы схлопнуть."""
    printable = "".join(
        " " if unicodedata.category(char) == "Cc" else char for char in text
    )
    return " ".join(printable.split())


def validate_name(name: str) -> str:
    """Очистить и проверить название привычки (непустое, не длиннее лимита).

    Управляющие символы (перевод строки, табуляция, NUL…) заменяются пробелом, а
    повторяющиеся пробелы схлопываются: название — одна строка и в приложении, и в
    напоминании в чате, а NUL вообще не принимает PostgreSQL.
    """
    cleaned = _one_line(name)
    if not cleaned:
        raise ApiError(422, "invalid_name", "Введите название привычки")
    if len(cleaned) > HABIT_NAME_MAX_LENGTH:
        raise ApiError(
            422, "invalid_name", f"Название не длиннее {HABIT_NAME_MAX_LENGTH} символов"
        )
    return cleaned


def validate_folder_name(name: str) -> str:
    """Очистить и проверить название папки — как название привычки (`validate_name`)."""
    cleaned = _one_line(name)
    if not cleaned:
        raise ApiError(422, "invalid_folder_name", "Введите название папки")
    if len(cleaned) > FOLDER_NAME_MAX_LENGTH:
        raise ApiError(
            422,
            "invalid_folder_name",
            f"Название папки не длиннее {FOLDER_NAME_MAX_LENGTH} символов",
        )
    return cleaned


def validate_description(description: str) -> str | None:
    """Очистить и проверить описание привычки — как название (`validate_name`), но
    пустое можно: None — без описания."""
    cleaned = _one_line(description)
    if len(cleaned) > HABIT_DESCRIPTION_MAX_LENGTH:
        raise ApiError(
            422,
            "invalid_description",
            f"Описание не длиннее {HABIT_DESCRIPTION_MAX_LENGTH} символов",
        )
    return cleaned or None


def validate_note(text: str) -> str:
    """Очистить и проверить заметку к дню: строки сохраняются (больше одной пустой подряд
    — нет), прочие управляющие символы — пробелом; пустая — удалить заметку."""
    lines = [_one_line(line) for line in text.replace("\r\n", "\n").split("\n")]
    cleaned = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    if len(cleaned) > NOTE_MAX_LENGTH:
        raise ApiError(422, "invalid_note", f"Заметка не длиннее {NOTE_MAX_LENGTH} символов")
    return cleaned


def validate_frequency(
    frequency_type: str, days: list[str], start_date: date | None, today: date
) -> tuple[FrequencyType, str | None, date | None]:
    """Проверить частоту и собрать строку дней и первый день.

    Для `daily` дни и первый день не нужны (возвращается None). Для `specific_days` —
    хотя бы один валидный код; возвращается строка кодов в каноническом порядке
    («mon,wed,fri»). Для `every_other_day` и `monthly` — первый день: любой прошедший (так
    его сохраняет и изменение старой привычки) и не дальше `START_DATE_MAX_AHEAD_DAYS` вперёд.
    """
    if frequency_type == "daily":
        return FrequencyType.daily, None, None
    if frequency_type == "specific_days":
        chosen = {code for code in days if code in WEEKDAYS}
        if not chosen:
            raise ApiError(422, "invalid_days", "Выберите хотя бы один день недели")
        ordered = ",".join(code for code in WEEKDAYS if code in chosen)
        return FrequencyType.specific_days, ordered, None
    if frequency_type in ("every_other_day", "monthly"):
        if start_date is None or start_date > today + timedelta(days=START_DATE_MAX_AHEAD_DAYS):
            raise ApiError(422, "invalid_start_date", "Выберите дату начала")
        return FrequencyType(frequency_type), None, start_date
    if frequency_type == "flexible":
        return FrequencyType.flexible, None, None
    raise ApiError(422, "invalid_frequency", "Неизвестная частота")


def validate_period(
    frequency: FrequencyType, period: str | None, times: int | None
) -> tuple[str | None, int | None]:
    """Период и цель «Гибкого графика»: week / month / year и от 1 до дней самого
    длинного такого периода (PERIOD_MAX_TIMES). У остальных частот — (None, None)."""
    if frequency != FrequencyType.flexible:
        return None, None
    if period not in PERIOD_MAX_TIMES:
        raise ApiError(422, "invalid_period", "Выберите период")
    if times is None or not 1 <= times <= PERIOD_MAX_TIMES[period]:
        raise ApiError(
            422,
            "invalid_period_times",
            f"Сколько раз за период — от 1 до {PERIOD_MAX_TIMES[period]}",
        )
    return period, times


def validate_days(days: list[str]) -> str:
    """Дни недели напоминания «Пора отметить привычки»: хотя бы один валидный код;
    строка кодов в каноническом порядке («mon,wed,fri»)."""
    chosen = {code for code in days if code in WEEKDAYS}
    if not chosen:
        raise ApiError(422, "invalid_days", "Выберите хотя бы один день недели")
    return ",".join(code for code in WEEKDAYS if code in chosen)


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


def validate_reminder_times(single: str | None, values: list[str] | None) -> list[time]:
    """Напоминания привычки: по возрастанию, без повторов, не больше
    `MAX_REMINDERS_PER_HABIT`; пустой список — без напоминания. `values` не передан
    (старый клиент) — одно напоминание `single`."""
    if values is None:
        values = [] if single is None else [single]
    times = sorted({validate_reminder_time(value) for value in values})  # type: ignore[type-var]
    if len(times) > MAX_REMINDERS_PER_HABIT:
        raise ApiError(
            422,
            "invalid_reminder_time",
            f"Не больше {MAX_REMINDERS_PER_HABIT} напоминаний у привычки",
        )
    return times  # type: ignore[return-value]


def validate_color(value: str) -> str:
    """Проверить, что цвет привычки — ключ палитры или свой цвет «#rrggbb» (вернуть его
    строчными)."""
    if value in HABIT_COLORS:
        return value
    custom = value.lower()
    if re.fullmatch(CUSTOM_HABIT_COLOR_PATTERN, custom):
        return custom
    raise ApiError(422, "invalid_color", "Неизвестный цвет привычки")


def validate_times_per_day(value: int, goal_unit: str = "times") -> int:
    """Проверить цель дня: сколько раз (1–MAX_TIMES_PER_DAY) или, у «Цели по времени»
    (`goal_unit` seconds), сколько секунд (MIN_GOAL_SECONDS–MAX_GOAL_SECONDS)."""
    if goal_unit == "seconds":
        if not MIN_GOAL_SECONDS <= value <= MAX_GOAL_SECONDS:
            raise ApiError(422, "invalid_times_per_day", "Неверная цель по времени")
        return value
    if not 1 <= value <= MAX_TIMES_PER_DAY:
        raise ApiError(422, "invalid_times_per_day", "Неверное число раз в день")
    return value


def validate_goal_unit(value: str) -> str:
    """Проверить, в чём цель привычки (GOAL_UNITS)."""
    if value not in GOAL_UNITS:
        raise ApiError(422, "invalid_goal_unit", "Неизвестная единица цели")
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


def validate_grid_layout(value: str) -> str:
    """Проверить «Вид серий»."""
    if value not in GRID_LAYOUTS:
        raise ApiError(422, "invalid_grid_layout", "Неизвестный вид серий")
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


def validate_broadcast_button(value: str) -> str | None:
    """Проверить кнопку под рассылкой; пустая строка — без кнопки (None)."""
    if value == "":
        return None
    if value not in BROADCAST_BUTTONS:
        raise ApiError(422, "invalid_button", "Неизвестная кнопка")
    return value


def parse_db_int(text: object) -> int | None:
    """Целое из строки ASCII-цифр, которое помещается в колонку БД, иначе None.

    `str.isdigit()` пропускает «²», а `int()` на таких строках и на строках длиннее
    4300 цифр падает — поэтому только цифры 0–9 и не длиннее MAX_DB_INT.
    """
    raw = str(text)
    if not raw.isascii() or not raw.isdecimal() or len(raw) > len(str(MAX_DB_INT)):
        return None
    value = int(raw)
    return value if value <= MAX_DB_INT else None
