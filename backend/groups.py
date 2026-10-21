"""Совместные привычки: приглашение, вступление, выход, исключение, общие поля и то, как
выглядит день группы.

У каждого участника своя привычка (Task) со своими отметками; группа (HabitGroup) их
связывает. День группы для участника выполнен, когда его выполнил он сам и все остальные
**активные сейчас** участники, у которых этот день попадает в период участия и которые в
этот день не были заморожены. Поэтому выход и исключение пересчитывают прошлое у
оставшихся, а возврат его восстанавливает. Дни вне участия человека оцениваются по его
собственным отметкам: история вступившего начинается с дня вступления.

Групповой можно сделать и новую, и уже существующую привычку (/sync с `shared`), пока
человек в ней один, — и так же обратно сделать обычной (`unshare`). Вышедший и
исключённый привычку не теряют: она остаётся у него обычной, со всеми отметками, а по
ссылке возвращается в группу с ними же; вышел последний — группы больше нет. Автоотметки
в групповой привычке нет.

Общие поля (название, описание, расписание, цель на день, цвет — всё, кроме напоминаний)
берутся с привычки владельца, и меняет их только он (services.update_habit →
`share_owner_changes`). Вступают по ссылке через бота
(bot/handlers/group_invite.py), остальное — API /groups (routers/groups.py). Только
аккаунты с Telegram: гостю веб-приложения — `group_needs_telegram`.
"""

from __future__ import annotations

import secrets
import string
from collections.abc import Callable, Collection
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from backend import services
from backend.constants import (
    HABIT_NAME_MAX_LENGTH,
    HISTORY_DAYS,
    INVITE_CODE_LENGTH,
    MAX_GROUP_MEMBERS,
    MAX_HABITS_PER_USER,
)
from backend.errors import ApiError
from backend.models import HabitGroup, HabitGroupMember, Task, User
from backend.repository import Repository
from backend.schedule import task_days
from backend.schemas import BannedMember, GroupMember, GroupMemberHabitResponse, HabitGroupView

# Параметр /start ссылки-приглашения: `join_<код>`.
INVITE_PREFIX = "join_"
_CODE_ALPHABET = string.ascii_letters + string.digits


def member_name(user: User | None) -> str:
    """Как участник подписан у остальных: @username, если есть, иначе имя из Telegram."""
    if user is None:
        return "?"
    if user.username:
        return f"@{user.username}"
    return user.first_name or "?"


def invite_url(bot_username: str, group: HabitGroup) -> str:
    """Ссылка-приглашение: открывает чат с ботом, он предлагает вступить."""
    return f"https://t.me/{bot_username}?start={INVITE_PREFIX}{group.invite_code}"


def _require_telegram(user: User) -> None:
    if user.telegram_id <= 0:
        raise ApiError(
            403, "group_needs_telegram", "Групповые привычки — только со входом через Telegram"
        )


async def _new_code(repo: Repository) -> str:
    while True:
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(INVITE_CODE_LENGTH))
        if not await repo.invite_code_taken(code):
            return code


# --------------------------------------------------------------------------- #
#  Как выглядит день группы
# --------------------------------------------------------------------------- #


@dataclass
class _Member:
    """Активный участник со всем, что нужно для дней группы."""

    member: HabitGroupMember
    user: User
    task: Task
    # День отметки участника (его пояс и «Отмечать за вчера»).
    today: date
    periods: list[tuple[date, date | None]]
    done: set[date]
    counts: dict[date, int]
    is_frozen: Callable[[date], bool]

    def covers(self, day: date) -> bool:
        """Был ли он в группе в этот день."""
        return any(start <= day and (end is None or day < end) for start, end in self.periods)

    def count_on(self, day: date) -> int:
        """Сколько раз выполнил в день (до цели); выполненный день — цель."""
        if day in self.done:
            return self.task.times_per_day
        return min(self.counts.get(day, 0), self.task.times_per_day)


@dataclass
class GroupState:
    """Группа, её активные участники по времени вступления и чёрный список."""

    group: HabitGroup
    members: list[_Member]
    banned: list[User]


@dataclass
class ViewerGroup:
    """Совместная привычка глазами участника: что показать и как считать его дни."""

    view: HabitGroupView
    # Выполнили ли день все остальные, кто тогда был в группе и не был заморожен.
    others_done: Callable[[date], bool]
    # С этого дня день ещё не закончился у кого-то из участников.
    open_from: date
    # Моя часть по дням истории (выполненный день — цель).
    my_units: list[int]


async def load_groups(repo: Repository, group_ids: Collection[int]) -> dict[int, GroupState]:
    """Группы с активными участниками, их отметками, заморозками и периодами — одним
    набором запросов на все группы."""
    if not group_ids:
        return {}
    members = await repo.active_members(group_ids)
    users = await repo.get_users({member.user_id for member in members})
    tasks = await repo.get_tasks(
        {member.task_id for member in members if member.task_id is not None}
    )
    members = [
        member
        for member in members
        if member.task_id in tasks and tasks[member.task_id].is_active and member.user_id in users
    ]
    task_ids = [member.task_id for member in members if member.task_id is not None]
    todays = {user_id: services.user_today(user) for user_id, user in users.items()}
    horizon = max(todays.values(), default=date.today()) + timedelta(days=1)
    since = min(todays.values(), default=date.today()) - timedelta(days=HISTORY_DAYS + 1)
    done = await repo.get_done_dates(task_ids, horizon)
    freezes = await repo.get_freezes(task_ids)
    counts = await repo.get_history_counts(task_ids, since, horizon)
    periods = await repo.periods_of([member.id for member in members])
    banned = await repo.banned_members(group_ids)
    banned_users = await repo.get_users({member.user_id for member in banned})

    states: dict[int, GroupState] = {}
    for group_id in group_ids:
        group = await repo.get_group(group_id)
        if group is not None:
            states[group_id] = GroupState(
                group=group,
                members=[],
                banned=[
                    banned_users[member.user_id]
                    for member in banned
                    if member.group_id == group_id and member.user_id in banned_users
                ],
            )
    for member in members:
        state = states.get(member.group_id)
        if state is None or member.task_id is None:
            continue
        task = tasks[member.task_id]
        today = todays[member.user_id]
        state.members.append(
            _Member(
                member=member,
                user=users[member.user_id],
                task=task,
                today=today,
                periods=periods[member.id],
                done=done[task.id],
                counts=counts[task.id],
                is_frozen=services.frozen_check(task, freezes[task.id], today),
            )
        )
    return states


def viewer_part(state: GroupState, task_id: int, today: date) -> ViewerGroup | None:
    """Совместная привычка глазами владельца привычки `task_id`; `today` — его день
    отметки (все даты групп — его). None — его нет среди активных участников."""
    me = next((item for item in state.members if item.task.id == task_id), None)
    if me is None:
        return None
    others = [item for item in state.members if item is not me]

    def others_done(day: date) -> bool:
        if not me.covers(day):
            return True
        return all(
            day in item.done
            for item in others
            if item.covers(day) and not item.is_frozen(day)
        )

    def required(day: date) -> list[_Member]:
        """Остальные, чья часть нужна в этот день (вне моего участия — никто)."""
        if not me.covers(day):
            return []
        return [item for item in others if item.covers(day) and not item.is_frozen(day)]

    history_start = today - timedelta(days=HISTORY_DAYS - 1)
    history_days = [history_start + timedelta(days=offset) for offset in range(HISTORY_DAYS)]
    target = me.task.times_per_day
    others_units, people, fill, mine = [], [], [], []
    for day in history_days:
        needed = required(day)
        units = sum(min(item.count_on(day), target) for item in needed)
        own = min(me.count_on(day), target)
        others_units.append(units)
        people.append(len(needed) + 1)
        mine.append(own)
        fill.append(round(min((units + own) / ((len(needed) + 1) * target), 1.0), 4))
    owner_id = state.group.owner_id
    is_owner = owner_id == me.user.telegram_id
    view = HabitGroupView(
        id=state.group.id,
        is_owner=is_owner,
        notify_marks=me.member.notify_marks,
        members=[
            GroupMember(
                user_id=item.user.telegram_id,
                name=member_name(item.user),
                is_me=item is me,
                is_owner=item.user.telegram_id == owner_id,
                done=today in item.done,
                count=item.count_on(today),
                frozen=item.is_frozen(today),
                photo=item.user.photo_id,
            )
            for item in state.members
        ],
        banned=[
            BannedMember(user_id=user.telegram_id, name=member_name(user), photo=user.photo_id)
            for user in state.banned
        ]
        if is_owner
        else [],
        others_history=[others_done(day) for day in history_days],
        others_next_day=others_done(today + timedelta(days=1)),
        open_from=min(item.today for item in state.members),
        others_units=others_units,
        people=people,
        fill_history=fill,
    )
    return ViewerGroup(
        view=view, others_done=others_done, open_from=view.open_from or today, my_units=mine
    )


# --------------------------------------------------------------------------- #
#  Общие поля
# --------------------------------------------------------------------------- #


async def _free_name(
    repo: Repository, user_id: int, name: str, exclude_task_id: int | None = None
) -> str:
    """Название, не занятое другой привычкой пользователя: занято — с номером («Бег (2)»)."""
    candidate, number = name, 2
    while await repo.task_name_exists(user_id, candidate, exclude_task_id=exclude_task_id):
        suffix = f" ({number})"
        candidate = name[: HABIT_NAME_MAX_LENGTH - len(suffix)] + suffix
        number += 1
    return candidate


async def _apply_shared_fields(repo: Repository, user: User, task: Task, source: Task) -> None:
    """Общие поля привычки владельца `source` (всё, кроме напоминаний) — на привычку
    участника `task`. Прежнее расписание запоминается, как при изменении в форме;
    автоотметка выключается."""
    await services.remember_schedule(
        repo, user, task, source.frequency_type, source.days, source.start_date,
        source.times_per_day,
    )
    name = (
        task.name
        if task.name == source.name
        else await _free_name(repo, task.user_id, source.name, exclude_task_id=task.id)
    )
    await repo.set_task_shared_fields(
        task,
        name,
        source.description,
        source.frequency_type,
        source.days,
        source.start_date,
        source.times_per_day,
        source.color,
    )


async def _owner_task(repo: Repository, group: HabitGroup) -> Task | None:
    """Привычка владельца — источник общих полей (нет владельца среди активных — самого
    раннего участника)."""
    members = await repo.active_members([group.id])
    source = next((item for item in members if item.user_id == group.owner_id), None)
    source = source or (members[0] if members else None)
    if source is None or source.task_id is None:
        return None
    return await repo.get_active_task(source.task_id, source.user_id)


async def _active_membership(
    repo: Repository, task: Task
) -> tuple[HabitGroup, HabitGroupMember] | None:
    member = await repo.get_member_by_task(task.id)
    if member is None or not member.active:
        return None
    group = await repo.get_group(member.group_id)
    return (group, member) if group is not None else None


async def restrict_update(repo: Repository, user: User, task: Task, payload):  # type: ignore[no-untyped-def]
    """Форма участника совместной привычки: всё, кроме напоминаний, меняет только владелец
    (у остальных остаётся как есть), автоотметки в совместной привычке нет."""
    membership = await _active_membership(repo, task)
    if membership is None:
        return payload
    group, _ = membership
    updates: dict[str, object] = {"auto_mark": False}
    if group.owner_id != user.telegram_id:
        updates.update(
            name=task.name,
            description=task.description,
            color=task.color,
            frequency_type=task.frequency_type.value,
            days=task_days(task),
            start_date=task.start_date,
            times_per_day=task.times_per_day,
        )
    return payload.model_copy(update=updates)


async def share_owner_changes(repo: Repository, user: User, task: Task) -> None:
    """Владелец изменил привычку — общие поля у всех остальных участников такие же."""
    membership = await _active_membership(repo, task)
    if membership is None or membership[0].owner_id != user.telegram_id:
        return
    group, _ = membership
    for member in await repo.active_members([group.id]):
        if member.task_id is None or member.task_id == task.id:
            continue
        other = await repo.get_active_task(member.task_id, member.user_id)
        other_user = await repo.get_user(member.user_id)
        if other is not None and other_user is not None:
            await _apply_shared_fields(repo, other_user, other, task)


# --------------------------------------------------------------------------- #
#  Приглашение, вступление, выход
# --------------------------------------------------------------------------- #


async def create_group(repo: Repository, user: User, task: Task) -> HabitGroup:
    """Привычка `task` (новая или уже существующая) — групповая: группа, где пользователь —
    владелец и пока единственный участник. Уже групповая — та же группа. Дни до
    сегодняшнего оцениваются по его собственным отметкам."""
    _require_telegram(user)
    membership = await _active_membership(repo, task)
    if membership is not None:
        return membership[0]
    if task.auto_mark:
        await repo.set_auto_mark(task, False)
    group = await repo.create_group(user.telegram_id, await _new_code(repo))
    await repo.add_member(group, user.telegram_id, task.id, services.user_today(user))
    await repo.log_action(user.telegram_id, "group_created", ref_id=task.id)
    return group


async def _membership(
    repo: Repository, user: User, group_id: int
) -> tuple[HabitGroup, HabitGroupMember]:
    group = await repo.get_group(group_id)
    member = await repo.get_member(group_id, user.telegram_id) if group is not None else None
    if group is None or member is None or not member.active:
        raise ApiError(404, "group_not_found", "Групповая привычка не найдена")
    return group, member


def _require_owner(group: HabitGroup, user: User) -> None:
    if group.owner_id != user.telegram_id:
        raise ApiError(403, "group_not_owner", "Это может только владелец привычки")


async def reset_invite(repo: Repository, user: User, group_id: int) -> HabitGroup:
    """«Сбросить ссылку» (владелец): прежняя ссылка больше не действует."""
    group, _ = await _membership(repo, user, group_id)
    _require_owner(group, user)
    await repo.set_invite_code(group, await _new_code(repo))
    return group


async def invite_of(repo: Repository, user: User, group_id: int) -> HabitGroup:
    """Группа участника — за ссылкой-приглашением."""
    group, _ = await _membership(repo, user, group_id)
    return group


async def _deactivate(
    repo: Repository, group: HabitGroup, member: HabitGroupMember, user: User | None
) -> None:
    """Участник больше не в группе (с его дня отметки); привычка остаётся у него обычной,
    со всеми отметками (периоды участия хранятся, чтобы вернуться по ссылке). Ушёл
    владелец — владелец тот, кто вступил раньше всех; не осталось никого — группа удаляется."""
    end = services.user_today(user) if user is not None else date.today()
    await repo.deactivate_member(member, end)
    heir = await repo.earliest_active_member(group.id)
    if heir is None:
        await repo.delete_group(group)
    elif group.owner_id == member.user_id:
        await repo.set_group_owner(group, heir.user_id)


async def leave(repo: Repository, user: User, group_id: int) -> None:
    """«Выйти»: привычка остаётся у него обычной, по ссылке возвращается в группу со
    всеми отметками."""
    group, member = await _membership(repo, user, group_id)
    task_id = member.task_id
    await _deactivate(repo, group, member, user)
    await repo.log_action(user.telegram_id, "group_left", ref_id=task_id)


async def kick(repo: Repository, user: User, group_id: int, user_id: int) -> None:
    """Исключить участника (только владелец): привычка остаётся у него обычной, как при
    выходе, а сам он — в чёрном списке: по ссылке не вступит, пока владелец его оттуда не
    уберёт."""
    group, _ = await _membership(repo, user, group_id)
    _require_owner(group, user)
    target = await repo.get_member(group_id, user_id)
    if target is None or not target.active or user_id == user.telegram_id:
        raise ApiError(404, "group_member_not_found", "Участник не найден")
    await _deactivate(repo, group, target, await repo.get_user(user_id))
    await repo.set_member_banned(target, True)
    await repo.log_action(user.telegram_id, "group_kicked", ref_id=user_id)


async def unban(repo: Repository, user: User, group_id: int, user_id: int) -> None:
    """Убрать из чёрного списка (только владелец): по ссылке снова можно вступить."""
    group, _ = await _membership(repo, user, group_id)
    _require_owner(group, user)
    target = await repo.get_member(group_id, user_id)
    if target is None or target.banned_at is None:
        raise ApiError(404, "group_member_not_found", "Участник не найден")
    await repo.set_member_banned(target, False)
    await repo.log_action(user.telegram_id, "group_unbanned", ref_id=user_id)


async def photo_owner(repo: Repository, user: User, group_id: int, user_id: int) -> User:
    """Участник, чьё фото просят: его видят только участники той же привычки, а
    исключённого из чёрного списка — владелец."""
    group, _ = await _membership(repo, user, group_id)
    target = await repo.get_member(group_id, user_id)
    visible = target is not None and (
        target.active or (target.banned_at is not None and group.owner_id == user.telegram_id)
    )
    owner = await repo.get_user(user_id) if visible else None
    if owner is None:
        raise ApiError(404, "group_member_not_found", "Участник не найден")
    return owner


async def member_habit(
    repo: Repository, user: User, group_id: int, user_id: int
) -> GroupMemberHabitResponse:
    """Страница участника (любой участник смотрит любого, себя тоже): его привычка по его
    отметкам — сетка, серии, счёт — как обычная, в его днях. Его напоминания не видны."""
    await _membership(repo, user, group_id)
    target = await repo.get_member(group_id, user_id)
    owner = await repo.get_user(user_id) if target is not None and target.active else None
    task = (
        await repo.get_active_task(target.task_id, user_id)
        if owner is not None and target is not None and target.task_id is not None
        else None
    )
    if owner is None or task is None:
        raise ApiError(404, "group_member_not_found", "Участник не найден")
    habit = await services.own_habit(repo, owner, task)
    habit = habit.model_copy(update={"reminder_time": None, "reminder_times": []})
    return GroupMemberHabitResponse(habit=habit, day=services.user_today(owner))


async def set_notify(repo: Repository, user: User, group_id: int, on: bool) -> None:
    """«Отметки участников» включить или выключить."""
    _, member = await _membership(repo, user, group_id)
    await repo.set_member_notify(member, on)


async def unshare(repo: Repository, user: User, task: Task) -> None:
    """Выключить «Групповую привычку»: можно, только пока в ней никого, кроме него, —
    группа удаляется (ссылка больше не действует), привычка остаётся обычной."""
    membership = await _active_membership(repo, task)
    if membership is None:
        return
    group, _ = membership
    if await repo.count_active_members(group.id) > 1:
        raise ApiError(
            409, "group_has_members", "В привычке есть другие участники — из неё можно только выйти"
        )
    await repo.delete_group(group)
    await repo.log_action(user.telegram_id, "group_unshared", ref_id=task.id)


async def forget_task(repo: Repository, user: User, task: Task) -> None:
    """Групповую привычку удалили: сначала выход из группы."""
    membership = await _active_membership(repo, task)
    if membership is not None:
        group, member = membership
        await _deactivate(repo, group, member, user)


@dataclass
class InvitePreview:
    """Что показать в боте по ссылке-приглашению."""

    group: HabitGroup
    # Привычка владельца: название, расписание, цель.
    task: Task
    member_names: list[str]
    # join — можно вступить, rejoin — вернуться со своей историей, member — уже участник,
    # banned — в чёрном списке, full — мест нет.
    state: str


async def _reusable_task(
    repo: Repository, user: User, member: HabitGroupMember | None
) -> Task | None:
    """Прежняя привычка вышедшего, с которой он вернётся (осталась у него обычной или
    удалена), — если она не в другой группе."""
    if member is None or member.task_id is None:
        return None
    task = await repo.get_user_task(member.task_id, user.telegram_id)
    if task is None:
        return None
    current = await repo.get_member_by_task(task.id)
    if current is not None and current.active and current.id != member.id:
        return None
    return task


async def preview_invite(repo: Repository, user: User, code: str) -> InvitePreview | None:
    """Приглашение по коду; None — ссылка не действует (сброшена или неверная)."""
    group = await repo.get_group_by_code(code)
    if group is None:
        return None
    source = await _owner_task(repo, group)
    if source is None:
        return None
    members = await repo.active_members([group.id])
    users = await repo.get_users({member.user_id for member in members})
    me = await repo.get_member(group.id, user.telegram_id)
    if me is not None and me.active:
        state = "member"
    elif me is not None and me.banned_at is not None:
        state = "banned"
    elif len(members) >= MAX_GROUP_MEMBERS:
        state = "full"
    elif await _reusable_task(repo, user, me) is not None:
        state = "rejoin"
    else:
        state = "join"
    return InvitePreview(
        group=group,
        task=source,
        member_names=[member_name(users.get(member.user_id)) for member in members],
        state=state,
    )


async def join(repo: Repository, user: User, code: str) -> tuple[str, Task]:
    """Вступить по ссылке: `joined` — новая привычка с общими полями владельца, `rejoined`
    — вернулась его прежняя привычка со всеми отметками (её прошлые периоды снова в счёт),
    `member` — уже участник."""
    _require_telegram(user)
    group = await repo.get_group_by_code(code)
    source = await _owner_task(repo, group) if group is not None else None
    if group is None or source is None:
        raise ApiError(404, "group_not_found", "Приглашение больше не действует")
    me = await repo.get_member(group.id, user.telegram_id)
    if me is not None and me.active and me.task_id is not None:
        task = await repo.get_active_task(me.task_id, user.telegram_id)
        if task is not None:
            return "member", task
    if me is not None and me.banned_at is not None:
        raise ApiError(403, "group_banned", "Владелец исключил вас из этой привычки")
    if await repo.count_active_members(group.id) >= MAX_GROUP_MEMBERS:
        raise ApiError(409, "group_full", "В привычке уже максимум участников")
    today = services.user_today(user)
    old = await _reusable_task(repo, user, me)
    if (old is None or not old.is_active) and (
        await repo.count_active_tasks(user.telegram_id) >= MAX_HABITS_PER_USER
    ):
        raise ApiError(
            409, "habit_limit", f"Можно завести не больше {MAX_HABITS_PER_USER} привычек"
        )
    if old is not None and me is not None:
        if not old.is_active:
            await repo.restore_task(old)
        await _apply_shared_fields(repo, user, old, source)
        await repo.reactivate_member(me, old.id, today, keep_periods=True)
        task, outcome = old, "rejoined"
    else:
        task = await repo.create_task(
            user_id=user.telegram_id,
            name=await _free_name(repo, user.telegram_id, source.name),
            description=source.description,
            frequency_type=source.frequency_type,
            days=source.days,
            start_date=source.start_date,
            color=source.color,
            times_per_day=source.times_per_day,
        )
        await repo.log_action(user.telegram_id, "habit_created", ref_id=task.id)
        if me is not None:
            await repo.reactivate_member(me, task.id, today, keep_periods=False)
        else:
            await repo.add_member(group, user.telegram_id, task.id, today)
        outcome = "joined"
    await repo.log_action(user.telegram_id, "group_joined", ref_id=task.id)
    return outcome, task


# --------------------------------------------------------------------------- #
#  «Отметки участников»
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class GroupMarkNotice:
    """Уведомление участнику: другой участник выполнил день совместной привычки."""

    user_id: int
    task_id: int
    # Название привычки у получателя и кто отметил (@username или имя).
    habit_name: str
    actor: str
    language: str
    # Можно прислать в Telegram («Уведомления» в Mini App включены).
    telegram: bool = True


async def due_group_marks(
    repo: Repository, now: datetime
) -> tuple[list[GroupMarkNotice], list[int]]:
    """Уведомления об отметках, которые пора прислать, и записи отметок, о которых они
    (записи помечаются, даже если сообщать некому: так «Отметки участников», включённые
    позже, не принесут старых). Одна отметка — одно уведомление за день: снятая и снова
    поставленная повтора не даёт. Смотрит отметки за последние сутки."""
    pending = await repo.pending_group_marks(now - timedelta(days=1))
    if not pending:
        return [], []
    group_ids = {member.group_id for _, member in pending}
    members = await repo.active_members(group_ids)
    users = await repo.get_users({member.user_id for member in members})
    tasks = await repo.get_tasks(
        {member.task_id for member in members if member.task_id is not None}
    )
    notices: list[GroupMarkNotice] = []
    for _, actor in pending:
        actor_name = member_name(users.get(actor.user_id))
        for member in members:
            if (
                member.group_id != actor.group_id
                or member.user_id == actor.user_id
                or not member.notify_marks
                or member.task_id not in tasks
            ):
                continue
            user = users.get(member.user_id)
            if user is None or user.blocked_at is not None:
                continue
            notices.append(
                GroupMarkNotice(
                    user_id=member.user_id,
                    task_id=member.task_id,
                    habit_name=tasks[member.task_id].name,
                    actor=actor_name,
                    language=user.language,
                    telegram=user.telegram_notifications,
                )
            )
    return notices, [log.id for log, _ in pending]

