"""«Подключить ИИ»: what an AI app may do with the user's habits and todos (backend/mcp.py).

Reading builds on what the app gets from `POST /sync` (services.list_habits,
list_todos…). Every change goes through `services.apply_sync` with the same operations
the app sends, so validation, limits, streaks and shared habits behave exactly as when
the person taps in the app; the app picks the change up on its next sync. Deleting
habits, settings, shared habit invitations and import are left to the app on purpose.

Tool names and descriptions are English: they are read by the model, not shown to people.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.constants import (
    FOLDER_NAME_MAX_LENGTH,
    HABIT_DESCRIPTION_MAX_LENGTH,
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    MAX_REMINDERS_PER_HABIT,
    MAX_TIMES_PER_DAY,
    NOTE_MAX_LENGTH,
    TODO_TEXT_MAX_LENGTH,
)
from backend.errors import ApiError
from backend.funnel import record_server_event
from backend.mcp import Context, Registry, Tool
from backend.repository import utc_now
from backend.schemas import (
    Habit,
    HabitCreate,
    SyncCreate,
    SyncMark,
    SyncNote,
    SyncResult,
    SyncTodoCreate,
    SyncTodoDelete,
    SyncTodoFolderCreate,
    SyncTodoUpdate,
    TodoView,
)
from backend.services import (
    apply_sync,
    list_habits,
    list_todo_folders,
    list_todos,
    user_today,
)
from backend.webauth import new_token

# A field named `date` hides the type in its class body: the type goes by this alias.
_Day = date

# The most todos one create_todos call adds, and list_todos returns.
CREATE_TODOS_MAX = 50
LIST_TODOS_MAX = 300


class _Args(BaseModel):
    model_config = ConfigDict(extra="forbid")


# --------------------------------------------------------------------------- #
#  Helpers
# --------------------------------------------------------------------------- #


def _schedule(habit: Habit) -> dict[str, Any]:
    schedule: dict[str, Any] = {"type": habit.frequency_type}
    if habit.frequency_type == "specific_days":
        schedule["days"] = habit.days
    if habit.frequency_type in ("every_other_day", "monthly") and habit.start_date:
        schedule["start_date"] = habit.start_date.isoformat()
    if habit.frequency_type == "flexible":
        schedule["period"] = habit.period
        schedule["times_per_period"] = habit.period_times
    return schedule


def _goal(habit: Habit) -> dict[str, Any]:
    if habit.goal_unit == "seconds":
        return {"unit": "seconds", "per_day": habit.times_per_day}
    return {"unit": "times", "per_day": habit.times_per_day}


def _habit(habit: Habit) -> dict[str, Any]:
    """What the AI needs to know about a habit (not the app's whole view)."""
    summary: dict[str, Any] = {
        "id": habit.id,
        "name": habit.name,
        "schedule": _schedule(habit),
        "goal": _goal(habit),
        "done_today": habit.done_today,
        "scheduled_today": habit.scheduled_today,
        "current_streak": habit.current_streak,
        "best_streak": habit.best_streak,
        "total_done": habit.total_done,
    }
    if habit.description:
        summary["description"] = habit.description
    if habit.times_per_day > 1:
        summary["today_count"] = habit.today_count
    if habit.frequency_type == "flexible":
        summary["done_this_period"] = habit.period_done
    if habit.reminder_times:
        summary["reminders"] = habit.reminder_times
    if habit.frozen_since is not None:
        summary["frozen_since"] = habit.frozen_since.isoformat()
    if habit.archived:
        summary["archived"] = True
    if habit.group is not None:
        summary["shared"] = True
    return summary


def _todo(todo: TodoView, lists: dict[int, str]) -> dict[str, Any]:
    item: dict[str, Any] = {"id": todo.id, "text": todo.text, "done": todo.done_at is not None}
    if todo.folder is not None:
        item["list_id"] = todo.folder
        item["list"] = lists.get(todo.folder)
    if todo.due_date is not None:
        item["due_date"] = todo.due_date.isoformat()
    if todo.remind_time:
        item["remind_time"] = todo.remind_time
    return item


async def _find_habit(ctx: Context, habit_id: int) -> Habit:
    for habit in await list_habits(ctx.repo, ctx.user):
        if habit.id == habit_id:
            return habit
    raise ApiError(404, "task_not_found", f"No habit with id {habit_id}; call list_habits")


async def _apply(ctx: Context, ops: list[Any], action: str) -> list[SyncResult]:
    """Apply operations like `POST /sync`; the first failed one is the tool's error. The
    funnel steps (first habit, first check-in) are recorded as from the app."""
    outcome = await apply_sync(ctx.repo, ctx.user, ops)
    user_id = ctx.user.telegram_id
    if outcome.first_habit:
        await record_server_event(
            ctx.repo, "first_habit_created", user_id, from_telegram=False, user_agent=None
        )
    if outcome.checked_in and await ctx.repo.mark_first_checkin(ctx.user, utc_now()):
        await record_server_event(
            ctx.repo, "first_checkin", user_id, from_telegram=False, user_agent=None
        )
    if any(result.ok for result in outcome.results):
        await ctx.repo.log_action(user_id, "ai", detail=f"{ctx.connection.client_name}: {action}"[:120])
    for result in outcome.results:
        if not result.ok and result.error is not None:
            raise ApiError(422, result.error.code, result.error.message)
    return outcome.results


def _ref() -> str:
    return f"ai-{new_token()[:20]}"


# --------------------------------------------------------------------------- #
#  Reading
# --------------------------------------------------------------------------- #


class NoArgs(_Args):
    pass


async def get_today(ctx: Context, _: NoArgs) -> dict[str, Any]:
    today = user_today(ctx.user)
    habits = [habit for habit in await list_habits(ctx.repo, ctx.user) if not habit.archived]
    todos = await list_todos(ctx.repo, ctx.user)
    lists = {folder.id: folder.name for folder in await list_todo_folders(ctx.repo, ctx.user)}
    open_todos = [todo for todo in todos if todo.done_at is None]
    return {
        "today": today.isoformat(),
        "marks_yesterday": bool(ctx.user.mark_yesterday),
        "habits_due_today": [_habit(habit) for habit in habits if habit.scheduled_today],
        "habits_not_due_today": [
            {"id": habit.id, "name": habit.name, "done_today": habit.done_today}
            for habit in habits
            if not habit.scheduled_today
        ],
        "todos_due_today": [
            _todo(todo, lists) for todo in open_todos if todo.due_date == today
        ],
        "todos_overdue": [
            _todo(todo, lists) for todo in open_todos if todo.due_date and todo.due_date < today
        ],
        "open_todos_without_date": sum(1 for todo in open_todos if todo.due_date is None),
    }


class ListHabitsArgs(_Args):
    include_archived: bool = Field(False, description="Also habits the user put in the archive")


async def list_habits_tool(ctx: Context, args: ListHabitsArgs) -> dict[str, Any]:
    habits = await list_habits(ctx.repo, ctx.user)
    return {
        "today": user_today(ctx.user).isoformat(),
        "habits": [_habit(habit) for habit in habits if args.include_archived or not habit.archived],
    }


class HistoryArgs(_Args):
    habit_id: int = Field(..., ge=1)
    days: int = Field(30, ge=1, le=HISTORY_DAYS, description="How many last days, up to today")


async def get_habit_history(ctx: Context, args: HistoryArgs) -> dict[str, Any]:
    habit = await _find_habit(ctx, args.habit_id)
    today = user_today(ctx.user)
    size = len(habit.history)
    days: list[dict[str, Any]] = []
    for index in range(max(0, size - args.days), size):
        day = today - timedelta(days=size - 1 - index)
        entry: dict[str, Any] = {"date": day.isoformat(), "done": habit.history[index]}
        if habit.history_counts and index < len(habit.history_counts) and habit.history_counts[index]:
            entry["count"] = habit.history_counts[index]
        if habit.frozen_history and index < len(habit.frozen_history) and habit.frozen_history[index]:
            entry["frozen"] = True
        note = habit.notes.get(day)
        if note:
            entry["note"] = note
        days.append(entry)
    return {"habit": _habit(habit), "days": days}


class ListTodosArgs(_Args):
    include_done: bool = Field(False, description="Also completed todos")
    list_id: int | None = Field(None, ge=1, description="Only this list (see `lists`)")


async def list_todos_tool(ctx: Context, args: ListTodosArgs) -> dict[str, Any]:
    folders = await list_todo_folders(ctx.repo, ctx.user)
    lists = {folder.id: folder.name for folder in folders}
    todos = [
        todo
        for todo in await list_todos(ctx.repo, ctx.user)
        if (args.include_done or todo.done_at is None)
        and (args.list_id is None or todo.folder == args.list_id)
    ]
    return {
        "today": user_today(ctx.user).isoformat(),
        "lists": [
            {"id": folder.id, "name": folder.name, **({"auto": folder.kind} if folder.kind else {})}
            for folder in folders
        ],
        "todos": [_todo(todo, lists) for todo in todos[:LIST_TODOS_MAX]],
        "more": max(0, len(todos) - LIST_TODOS_MAX),
    }


# --------------------------------------------------------------------------- #
#  Changing
# --------------------------------------------------------------------------- #


class MarkArgs(_Args):
    habit_id: int = Field(..., ge=1)
    date: _Day | None = Field(None, description="Day to mark (YYYY-MM-DD); default: today")
    done: bool = Field(True, description="false removes the mark")
    count: int | None = Field(
        None,
        ge=0,
        description=(
            "For habits with a goal above 1 per day: how many times were done that day; for "
            "habits with a goal in seconds: seconds spent"
        ),
    )


async def mark_habit(ctx: Context, args: MarkArgs) -> dict[str, Any]:
    habit = await _find_habit(ctx, args.habit_id)
    day = args.date or user_today(ctx.user)
    count = args.count
    done = args.done
    if count is not None:
        done = count >= habit.times_per_day
    elif habit.times_per_day > 1:
        count = habit.times_per_day if done else 0
    await _apply(ctx, [SyncMark(type="mark", task=habit.id, date=day, done=done, count=count)], "mark")
    return {"date": day.isoformat(), "habit": _habit(await _find_habit(ctx, habit.id))}


class NoteArgs(_Args):
    habit_id: int = Field(..., ge=1)
    date: _Day | None = Field(None, description="Day of the note; default: today")
    text: str = Field(..., max_length=NOTE_MAX_LENGTH, description="Empty text deletes the note")


async def add_day_note(ctx: Context, args: NoteArgs) -> dict[str, Any]:
    habit = await _find_habit(ctx, args.habit_id)
    day = args.date or user_today(ctx.user)
    await _apply(ctx, [SyncNote(type="note", task=habit.id, date=day, text=args.text)], "note")
    return {"habit_id": habit.id, "date": day.isoformat(), "note": args.text.strip() or None}


class CreateHabitArgs(_Args):
    name: str = Field(..., min_length=1, max_length=HABIT_NAME_MAX_LENGTH)
    description: str | None = Field(None, max_length=HABIT_DESCRIPTION_MAX_LENGTH)
    frequency_type: Literal["daily", "specific_days", "every_other_day", "monthly", "flexible"] = Field(
        "daily",
        description=(
            "daily; specific_days (with `days`); every_other_day or monthly (from "
            "`start_date`); flexible: `period_times` days per `period`, any days"
        ),
    )
    days: list[Literal["mon", "tue", "wed", "thu", "fri", "sat", "sun"]] = Field(default_factory=list)
    start_date: date | None = None
    period: Literal["week", "month", "year"] | None = None
    period_times: int | None = Field(None, ge=1, le=366)
    times_per_day: int = Field(1, ge=1, le=MAX_TIMES_PER_DAY, description="Goal: times a day")
    reminder_times: list[str] = Field(
        default_factory=list,
        max_length=MAX_REMINDERS_PER_HABIT,
        description="Reminders HH:MM in the user's time zone",
    )


async def create_habit(ctx: Context, args: CreateHabitArgs) -> dict[str, Any]:
    form = HabitCreate(
        name=args.name,
        description=args.description,
        frequency_type=args.frequency_type,
        days=list(args.days),
        start_date=args.start_date or (
            user_today(ctx.user) if args.frequency_type in ("every_other_day", "monthly") else None
        ),
        period=args.period,
        period_times=args.period_times,
        times_per_day=args.times_per_day,
        reminder_times=args.reminder_times,
    )
    results = await _apply(ctx, [SyncCreate(type="create", ref=_ref(), habit=form)], "create habit")
    habit_id = results[0].id
    assert habit_id is not None
    return {"habit": _habit(await _find_habit(ctx, habit_id))}


class NewTodo(_Args):
    text: str = Field(..., min_length=1, max_length=TODO_TEXT_MAX_LENGTH)
    list_id: int | None = Field(None, ge=1, description="List to put it in; none: no list")
    due_date: date | None = None
    remind_time: str | None = Field(None, description="HH:MM on `due_date`")


class CreateTodosArgs(_Args):
    todos: list[NewTodo] = Field(..., min_length=1, max_length=CREATE_TODOS_MAX)


async def create_todos(ctx: Context, args: CreateTodosArgs) -> dict[str, Any]:
    ops = [
        SyncTodoCreate(
            type="todo_create",
            ref=_ref(),
            text=item.text,
            folder=item.list_id,
            due_date=item.due_date,
            remind_time=item.remind_time,
        )
        for item in args.todos
    ]
    results = await _apply(ctx, ops, f"create {len(ops)} todos")
    created = {result.id for result in results}
    lists = {folder.id: folder.name for folder in await list_todo_folders(ctx.repo, ctx.user)}
    return {
        "created": [_todo(todo, lists) for todo in await list_todos(ctx.repo, ctx.user) if todo.id in created]
    }


class UpdateTodoArgs(_Args):
    todo_id: int = Field(..., ge=1)
    text: str | None = Field(None, min_length=1, max_length=TODO_TEXT_MAX_LENGTH)
    done: bool | None = Field(None, description="true completes the todo, false reopens it")
    list_id: int | None = Field(None, ge=1, description="Move to this list")
    remove_from_list: bool = False
    due_date: date | None = Field(None, description="Set the day; send null to clear it")
    remind_time: str | None = Field(None, description="HH:MM; send null to clear it")


async def update_todo(ctx: Context, args: UpdateTodoArgs) -> dict[str, Any]:
    fields: dict[str, Any] = {"type": "todo_update", "key": args.todo_id}
    for name in ("text", "done", "due_date", "remind_time"):
        if name in args.model_fields_set:
            fields[name] = getattr(args, name)
    if args.list_id is not None:
        fields["folder"] = args.list_id
    if args.remove_from_list:
        fields["no_folder"] = True
    await _apply(ctx, [SyncTodoUpdate.model_validate(fields)], "update todo")
    lists = {folder.id: folder.name for folder in await list_todo_folders(ctx.repo, ctx.user)}
    for todo in await list_todos(ctx.repo, ctx.user):
        if todo.id == args.todo_id:
            return {"todo": _todo(todo, lists)}
    raise ApiError(404, "todo_not_found", f"No todo with id {args.todo_id}")


class TodoIdArgs(_Args):
    todo_id: int = Field(..., ge=1)


async def delete_todo(ctx: Context, args: TodoIdArgs) -> dict[str, Any]:
    if not any(todo.id == args.todo_id for todo in await list_todos(ctx.repo, ctx.user)):
        raise ApiError(404, "todo_not_found", f"No todo with id {args.todo_id}")
    await _apply(ctx, [SyncTodoDelete(type="todo_delete", key=args.todo_id)], "delete todo")
    return {"deleted": args.todo_id}


class CreateListArgs(_Args):
    name: str = Field(..., min_length=1, max_length=FOLDER_NAME_MAX_LENGTH)


async def create_todo_list(ctx: Context, args: CreateListArgs) -> dict[str, Any]:
    results = await _apply(
        ctx, [SyncTodoFolderCreate(type="todo_folder_create", ref=_ref(), name=args.name)], "create list"
    )
    return {"list": {"id": results[0].id, "name": args.name.strip()}}


def register(registry: Registry) -> None:
    add = registry.add
    add(Tool(
        "get_today", "Today",
        "The user's current day: habits due today with their status and streaks, other "
        "habits, todos due today and overdue.",
        NoArgs, get_today,
    ))
    add(Tool(
        "list_habits", "List habits",
        "All habits with ids, schedule, goal, today's status and streaks.",
        ListHabitsArgs, list_habits_tool,
    ))
    add(Tool(
        "get_habit_history", "Habit history",
        "Day by day marks of one habit for the last N days, with counts, frozen days and "
        "the user's day notes.",
        HistoryArgs, get_habit_history,
    ))
    add(Tool(
        "list_todos", "List todos",
        "Todo lists and todos (open ones by default) with ids, days and reminders.",
        ListTodosArgs, list_todos_tool,
    ))
    add(Tool(
        "mark_habit", "Mark habit",
        "Mark a habit done (or not done) for today or a past day.",
        MarkArgs, mark_habit, read_only=False,
    ))
    add(Tool(
        "add_day_note", "Day note",
        "Write the user's note to a day of a habit (replaces the note of that day).",
        NoteArgs, add_day_note, read_only=False,
    ))
    add(Tool(
        "create_habit", "Create habit",
        "Create a new habit. Confirm the name and schedule with the user first.",
        CreateHabitArgs, create_habit, read_only=False,
    ))
    add(Tool(
        "create_todos", "Create todos",
        f"Add up to {CREATE_TODOS_MAX} todos at once, optionally into a list, with a day "
        "and a reminder time.",
        CreateTodosArgs, create_todos, read_only=False,
    ))
    add(Tool(
        "update_todo", "Update todo",
        "Change a todo: complete or reopen it, rename, move to another list, set or clear "
        "its day and reminder.",
        UpdateTodoArgs, update_todo, read_only=False,
    ))
    add(Tool(
        "delete_todo", "Delete todo",
        "Delete a todo for good. Prefer completing it unless the user asks to delete.",
        TodoIdArgs, delete_todo, read_only=False, destructive=True,
    ))
    add(Tool(
        "create_todo_list", "Create todo list",
        "Create a new todo list.",
        CreateListArgs, create_todo_list, read_only=False,
    ))
