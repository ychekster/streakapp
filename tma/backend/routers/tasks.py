"""Эндпоинты задач (привычек).

    GET    /tasks                  — список привычек с историей выполнения
    POST   /tasks                  — создать привычку
    PUT    /tasks/{task_id}        — изменить привычку
    DELETE /tasks/{task_id}        — удалить привычку
    POST   /tasks/{task_id}/toggle — отметить/снять отметку выполнения за сегодня

Все требуют валидную `initData`; пользователь регистрируется в БД при первом
запросе (зависимость `get_db_user`). Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Response

from tma.backend.constants import MAX_DB_INT
from tma.backend.dependencies import RepositoryDep, get_db_user
from tma.backend.errors import ApiError
from tma.backend.models import User
from tma.backend.repository import Repository
from tma.backend.schemas import (
    HabitCreate,
    HabitResponse,
    HabitsResponse,
    HabitUpdate,
)
from tma.backend.services import create_habit, list_habits, toggle_today, update_habit

router = APIRouter(prefix="/tasks", tags=["tasks"])

# Идентификатор задачи в пути. Верхняя граница — предел целого в колонке базы:
# без неё число длиннее 64 бит доходило бы до запроса и падало ошибкой драйвера (500)
# вместо понятного ответа о некорректном параметре.
_TaskId = Path(..., ge=1, le=MAX_DB_INT, description="Идентификатор задачи")


@router.get("", response_model=HabitsResponse)
async def get_tasks(
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> HabitsResponse:
    """Список активных привычек пользователя с историей выполнения."""
    habits = await list_habits(repo, db_user)
    return HabitsResponse(habits=habits)


@router.post("", response_model=HabitResponse, status_code=201)
async def create_task(
    payload: HabitCreate,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> HabitResponse:
    """Создать новую привычку и вернуть её."""
    habit = await create_habit(repo, db_user, payload)
    return HabitResponse(habit=habit)


@router.put("/{task_id}", response_model=HabitResponse)
async def update_task(
    payload: HabitUpdate,
    task_id: int = _TaskId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> HabitResponse:
    """Изменить привычку (название, частоту, напоминание, цвет) и вернуть её."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    habit = await update_habit(repo, db_user, task, payload)
    return HabitResponse(habit=habit)


@router.delete("/{task_id}", status_code=204, response_class=Response)
async def delete_task(
    task_id: int = _TaskId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> Response:
    """Удалить привычку (мягко: история остаётся в базе, но нигде не показывается)."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    await repo.soft_delete_task(task)
    return Response(status_code=204)


@router.post("/{task_id}/toggle", response_model=HabitResponse)
async def toggle_task(
    task_id: int = _TaskId,
    db_user: User = Depends(get_db_user),
    repo: Repository = RepositoryDep,
) -> HabitResponse:
    """Переключить отметку выполнения задачи за сегодня и вернуть её новое состояние."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    habit = await toggle_today(repo, db_user, task)
    return HabitResponse(habit=habit)
