"""Эндпоинты задач (привычек).

    GET    /tasks                  — список привычек с историей выполнения
    POST   /tasks                  — создать привычку
    DELETE /tasks/{task_id}        — удалить привычку
    POST   /tasks/{task_id}/toggle — отметить/снять отметку выполнения за сегодня

Все требуют валидную `initData`; пользователь регистрируется в БД при первом
запросе (зависимость `get_db_user`). Доступ к данным — только через репозиторий.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Path, Response

from tma.backend.dependencies import get_db_user, get_repository
from tma.backend.errors import ApiError
from tma.backend.models import User
from tma.backend.repository import Repository
from tma.backend.schemas import HabitCreate, HabitResponse, HabitsResponse, ToggleResponse
from tma.backend.services import create_habit, list_habits, toggle_today

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=HabitsResponse)
async def get_tasks(
    db_user: User = Depends(get_db_user),
    repo: Repository = Depends(get_repository),
) -> HabitsResponse:
    """Список активных привычек пользователя с историей выполнения."""
    habits = await list_habits(repo, db_user)
    return HabitsResponse(habits=habits)


@router.post("", response_model=HabitResponse, status_code=201)
async def create_task(
    payload: HabitCreate,
    db_user: User = Depends(get_db_user),
    repo: Repository = Depends(get_repository),
) -> HabitResponse:
    """Создать новую привычку и вернуть её."""
    habit = await create_habit(repo, db_user, payload)
    return HabitResponse(habit=habit)


@router.delete("/{task_id}", status_code=204, response_class=Response)
async def delete_task(
    task_id: int = Path(..., ge=1, description="Идентификатор задачи"),
    db_user: User = Depends(get_db_user),
    repo: Repository = Depends(get_repository),
) -> Response:
    """Удалить привычку (мягко: история остаётся в базе, но нигде не показывается)."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    await repo.soft_delete_task(task)
    return Response(status_code=204)


@router.post("/{task_id}/toggle", response_model=ToggleResponse)
async def toggle_task(
    task_id: int = Path(..., ge=1, description="Идентификатор задачи"),
    db_user: User = Depends(get_db_user),
    repo: Repository = Depends(get_repository),
) -> ToggleResponse:
    """Переключить отметку выполнения задачи за сегодня и вернуть её новое состояние."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    habit = await toggle_today(repo, db_user, task)
    return ToggleResponse(habit=habit)
