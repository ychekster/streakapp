"""Pydantic-схемы ответов API (контракт с фронтендом).

Схемы намеренно отделены от ORM-моделей: модели описывают хранение, схемы —
форму ответа. Так контракт API не зависит от внутренней структуры таблиц.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from tma.backend.constants import GRID_DAYS


class Habit(BaseModel):
    """Привычка пользователя: история выполнения и признак расписания на сегодня."""

    id: int = Field(..., description="Идентификатор задачи")
    name: str = Field(..., description="Название привычки")
    done_today: bool = Field(..., description="Отмечена ли задача выполненной сегодня")
    scheduled_today: bool = Field(
        ...,
        description=(
            "Запланирована ли задача на сегодня (по частоте/дням недели). "
            "True — задачу можно отмечать; False — только просмотр прогресса."
        ),
    )
    history: list[bool] = Field(
        ...,
        description=(
            f"Выполнение за последние {GRID_DAYS} дней (старое → сегодня). "
            "True — день выполнен (статус done), False — пропущен или нет данных. "
            "Индекс 0 — самый старый день, последний — сегодня."
        ),
    )


class HabitsResponse(BaseModel):
    """Ответ `GET /tasks` — список привычек пользователя."""

    habits: list[Habit]


class HabitResponse(BaseModel):
    """Ответ с одной привычкой (создание `POST /tasks`, переключение `.../toggle`)."""

    habit: Habit


# Псевдоним для обратной совместимости имени в роутере переключения.
ToggleResponse = HabitResponse


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


class SettingsResponse(BaseModel):
    """Текущие настройки пользователя (для `GET/PUT /settings`)."""

    timezone: str | None = Field(None, description="Часовой пояс (IANA)")
    timezone_display: str | None = Field(None, description="Человекочитаемый пояс, напр. «Москва (UTC+3)»")
    timezone_offset: str | None = Field(None, description="Смещение пояса, напр. «UTC+3»")


class SettingsUpdate(BaseModel):
    """Запрос `PUT /settings` — частичное обновление (передаются только меняемые поля)."""

    timezone: str | None = Field(None, description="Новый пояс: «UTC±N» или имя IANA")


class Weekday(BaseModel):
    """День недели для выбора частоты привычки."""

    code: str
    short: str
    full: str


class TimezoneOption(BaseModel):
    """Вариант часового пояса для выбора в настройках."""

    value: str
    label: str


class MetaResponse(BaseModel):
    """Справочные данные для форм: дни недели, лимит названия, часовые пояса."""

    weekdays: list[Weekday]
    name_max_length: int
    timezone_offsets: list[TimezoneOption]
