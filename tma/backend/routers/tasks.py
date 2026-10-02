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

from fastapi import APIRouter, BackgroundTasks, Depends, FastAPI, Path, Request, Response
from loguru import logger

from tma.backend.constants import MAX_DB_INT
from tma.backend.dependencies import Principal, RepositoryDep, get_db_user, get_principal
from tma.backend.errors import ApiError
from tma.backend.funnel import record_server_event
from tma.backend.messaging import send_install_offer
from tma.backend.models import User
from tma.backend.repository import Repository, utc_now
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
    request: Request,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> HabitResponse:
    """Создать новую привычку и вернуть её. The account's first habit ever is a funnel
    step."""
    first = not await repo.has_any_task(db_user.telegram_id)
    habit = await create_habit(repo, db_user, payload)
    if first:
        await record_server_event(
            repo,
            "first_habit_created",
            db_user.telegram_id,
            from_telegram=principal.telegram is not None,
            user_agent=request.headers.get("user-agent"),
        )
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
    request: Request,
    background: BackgroundTasks,
    task_id: int = _TaskId,
    db_user: User = Depends(get_db_user),
    principal: Principal = Depends(get_principal),
    repo: Repository = RepositoryDep,
) -> HabitResponse:
    """Переключить отметку выполнения задачи за сегодня и вернуть её новое состояние.

    The first check-in ever is a funnel step; from the Telegram Mini App it also makes
    the bot offer the web app once (after the response, see _offer_install)."""
    task = await repo.get_active_task(task_id, db_user.telegram_id)
    if task is None:
        raise ApiError(404, "task_not_found", "Задача не найдена")
    habit = await toggle_today(repo, db_user, task)
    from_telegram = principal.telegram is not None
    if habit.done_today and await repo.mark_first_checkin(db_user, utc_now()):
        await record_server_event(
            repo,
            "first_checkin",
            db_user.telegram_id,
            from_telegram=from_telegram,
            user_agent=request.headers.get("user-agent"),
        )
        if from_telegram and db_user.install_offer_sent_at is None:
            background.add_task(_offer_install, request.app, db_user.telegram_id, db_user.language)
    return HabitResponse(habit=habit)


async def _offer_install(app: FastAPI, user_id: int, language: str) -> None:
    """Send the one-time "install the app" offer (bot message, spec §8). Runs after the
    response, so the check-in is not slowed down. The offer is claimed in the database
    first: parallel check-ins or retries never send it twice."""
    tma_url = app.state.settings.tma_url
    if not tma_url:
        return
    try:
        async with app.state.database.session_factory() as session:
            claimed = await Repository(session).mark_install_offer_sent(user_id, utc_now())
            await session.commit()
        if claimed:
            undelivered = await send_install_offer(app.state.bot, user_id, language, tma_url)
            logger.info("Install offer for user {}: {}", user_id, undelivered or "sent")
    except Exception:  # noqa: BLE001 — the offer is optional, never fail loudly
        logger.exception("Could not send the install offer to user {}", user_id)
