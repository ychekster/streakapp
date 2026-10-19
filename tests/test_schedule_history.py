"""История расписания: смена расписания не переписывает прошлое — прошлые дни
оцениваются по расписанию, которое действовало в тот день (TaskSchedulePeriod)."""

from __future__ import annotations

import asyncio
from datetime import date, timedelta
from types import SimpleNamespace

from backend.database import Database
from backend.models import FrequencyType
from backend.repository import Repository, utc_now
from backend.schedule import due_check_with_history
from backend.schemas import HabitCreate
from backend.services import compute_streaks, list_habits, update_habit, user_today

SUNDAY = date(2026, 9, 27)
MONDAY = SUNDAY - timedelta(days=6)


def test_past_days_keep_their_schedule() -> None:
    # «Через день» с понедельника: пн, ср, пт выполнены; в воскресенье — «будние дни».
    task = SimpleNamespace(
        frequency_type=FrequencyType.specific_days, days="mon,tue,wed,thu,fri", start_date=None
    )
    period = SimpleNamespace(
        until=SUNDAY,
        frequency_type=FrequencyType.every_other_day,
        days=None,
        start_date=MONDAY,
    )
    done = {MONDAY, MONDAY + timedelta(days=2), MONDAY + timedelta(days=4)}
    is_due = due_check_with_history(task, [period])  # type: ignore[arg-type]
    # Вторник и четверг были не по плану, воскресенье по новому расписанию — тоже.
    assert [is_due(MONDAY + timedelta(days=offset)) for offset in range(7)] == [
        True, False, True, False, True, False, False,
    ]
    assert compute_streaks(task, done, SUNDAY, periods=[period]) == (3, 3)  # type: ignore[arg-type]
    # Без истории прошлое считалось бы по будним дням — вторник рвал бы серию.
    assert compute_streaks(task, done, SUNDAY) == (1, 1)  # type: ignore[arg-type]


def _form(**fields: object) -> HabitCreate:
    return HabitCreate(**{"name": "Бег", "frequency_type": "daily", **fields})


def test_update_remembers_the_previous_schedule(db_url: str) -> None:
    async def run() -> tuple[list, list, list, int]:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(1, None, "U", language="en")
                today = user_today(user)
                task = await repo.create_task(
                    1, "Бег", FrequencyType.every_other_day, start_date=today - timedelta(days=6)
                )
                # Создана неделю назад.
                task.created_at = utc_now() - timedelta(days=7)
                for offset in (6, 4, 2):
                    log = await repo.get_or_create_log(task.id, 1, today - timedelta(days=offset))
                    await repo.add_done_log(task, log.scheduled_date)
                await session.commit()
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_user(1)
                task = await repo.get_active_task(task.id, 1)
                # Две смены за день: запоминается расписание до этого дня (через день).
                await update_habit(repo, user, task, _form(frequency_type="daily"))
                await update_habit(
                    repo, user, task, _form(frequency_type="specific_days", days=["mon"])
                )
                await session.commit()
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_user(1)
                [habit] = await list_habits(repo, user)
                periods = await repo.get_schedule_periods([task.id])
                return (
                    [(p.until, p.frequency_type) for p in periods[task.id]],
                    [p.model_dump() for p in habit.schedule_history],
                    [habit.current_streak, habit.best_streak],
                    habit.total_done,
                )
        finally:
            await database.dispose()

    periods, history, streaks, total = asyncio.run(run())
    assert len(periods) == 1 and periods[0][1] == FrequencyType.every_other_day
    assert history[0]["frequency_type"] == "every_other_day"
    assert history[0]["until"] == periods[0][0]
    # Пропусков по прежнему расписанию не было: серия цела.
    assert streaks == [3, 3] and total == 3


def test_new_habit_keeps_no_history(db_url: str) -> None:
    async def run() -> int:
        database = Database(db_url)
        await database.create_tables()
        try:
            async with database.session_factory() as session:
                repo = Repository(session)
                user = await repo.get_or_create_user(2, None, "U", language="en")
                task = await repo.create_task(2, "Бег", FrequencyType.daily)
                await session.refresh(task)
                await update_habit(repo, user, task, _form(times_per_day=3))
                await session.commit()
                return len((await repo.get_schedule_periods([task.id]))[task.id])
        finally:
            await database.dispose()

    # Создана сегодня: прошлого нет — запоминать нечего.
    assert asyncio.run(run()) == 0
