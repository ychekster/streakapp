"""Pydantic-схемы ответов API (контракт с фронтендом).

Схемы намеренно отделены от ORM-моделей: модели описывают хранение, схемы —
форму ответа. Так контракт API не зависит от внутренней структуры таблиц.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from tma.backend.constants import DEFAULT_HABIT_COLOR, HISTORY_DAYS


class Habit(BaseModel):
    """Привычка пользователя: расписание, история выполнения и статистика серий."""

    id: int = Field(..., description="Идентификатор задачи")
    name: str = Field(..., description="Название привычки")
    done_today: bool = Field(
        ...,
        description=(
            "Отмечена ли задача выполненной «сегодня» — в день отметки: сегодня, а в "
            "режиме «Отмечать за вчера» — вчера"
        ),
    )
    scheduled_today: bool = Field(
        ...,
        description=(
            "Запланирована ли задача на день отметки (по частоте/дням недели). "
            "True — задачу можно отмечать; False — только просмотр прогресса."
        ),
    )
    frequency_type: Literal["daily", "specific_days"] = Field(
        ..., description="Каждый день или конкретные дни недели"
    )
    days: list[str] = Field(
        ...,
        description="Коды дней недели (mon..sun) для specific_days; для daily — пустой список",
    )
    history: list[bool] = Field(
        ...,
        description=(
            f"Выполнение за последние {HISTORY_DAYS} дней (старое → день отметки). "
            "True — день выполнен (статус done), False — пропущен или нет данных. "
            "Индекс 0 — самый старый день, последний — день отметки."
        ),
    )
    current_streak: int = Field(
        ...,
        description=(
            "Текущая серия: подряд выполненные дни по сегодня включительно. "
            "Неотмеченный сегодняшний день серию не прерывает — день ещё не закончился."
        ),
    )
    best_streak: int = Field(..., description="Лучшая серия за всё время")
    total_done: int = Field(..., description="Сколько раз привычка выполнена за всё время")
    reminder_time: str | None = Field(
        ...,
        description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания",
    )
    color: str = Field(..., description="Цвет (тема) привычки — ключ палитры: blue, green, …")


class HabitsResponse(BaseModel):
    """Ответ `GET /tasks` — список привычек пользователя."""

    habits: list[Habit]


class HabitResponse(BaseModel):
    """Ответ с одной привычкой (создание, изменение, переключение отметки)."""

    habit: Habit


class HabitCreate(BaseModel):
    """Запрос `POST /tasks` — создание привычки."""

    name: str = Field(..., description="Название привычки")
    frequency_type: Literal["daily", "specific_days"] = Field(
        ..., description="Каждый день или конкретные дни недели"
    )
    days: list[str] = Field(
        default_factory=list,
        description="Коды дней недели (mon..sun) для specific_days; для daily игнорируется",
    )
    reminder_time: str | None = Field(
        None, description="Время напоминания «ЧЧ:ММ» в поясе пользователя; null — без напоминания"
    )
    color: str = Field(DEFAULT_HABIT_COLOR, description="Цвет (тема) привычки — ключ палитры")


class HabitUpdate(HabitCreate):
    """Запрос `PUT /tasks/{task_id}` — изменение привычки (все поля формы, как при создании)."""


class SettingsResponse(BaseModel):
    """Текущие настройки пользователя (для `GET/PUT /settings`)."""

    timezone: str | None = Field(None, description="Часовой пояс (IANA)")
    timezone_city: int | None = Field(
        None, description="Город пояса — id в справочнике городов (нет у «UTC±N»)"
    )
    timezone_display: str | None = Field(
        None,
        description="Пояс на языке интерфейса: город («Санкт-Петербург») или смещение («UTC+3»)",
    )
    timezone_offset: str | None = Field(None, description="Смещение пояса, напр. «UTC+3»")
    language: str = Field(..., description="Язык интерфейса: ru, en")
    theme: str = Field(..., description="Тема оформления: light, dark или system (как в системе)")
    mark_yesterday: bool = Field(
        ..., description="«Отмечать за вчера»: отметки ставятся за вчерашний день"
    )


class SettingsUpdate(BaseModel):
    """Запрос `PUT /settings` — частичное обновление (передаются только меняемые поля)."""

    timezone: str | None = Field(None, description="Новый пояс: имя IANA или «UTC±N»")
    timezone_city: int | None = Field(
        None, description="Новый пояс городом — id в справочнике (вместо `timezone`)"
    )
    language: str | None = Field(None, description="Язык интерфейса: ru, en")
    theme: str | None = Field(None, description="Тема оформления: light, dark, system")
    mark_yesterday: bool | None = Field(None, description="Отмечать за вчера")


class TimezoneEntry(BaseModel):
    """Часовой пояс для выбора в настройках — город и его зона."""

    zone: str = Field(..., description="Зона IANA, напр. «Europe/Moscow»")
    city_id: int | None = Field(
        None, description="Город в справочнике (нет у зон без города в справочнике)"
    )
    city: str = Field(..., description="Город на языке интерфейса")
    region: str | None = Field(
        None, description="Регион — только если в стране есть одноимённый город"
    )
    country: str = Field(..., description="Страна на языке интерфейса")
    offset: str = Field(..., description="Текущее смещение, напр. «UTC+3»")


class TimezonesResponse(BaseModel):
    """Ответ `GET /meta/timezones`: каталог поясов с запада на восток или результаты
    поиска."""

    timezones: list[TimezoneEntry]


class MetaResponse(BaseModel):
    """Справочные данные для форм: лимит длины названия привычки."""

    name_max_length: int
