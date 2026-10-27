"""Совместные привычки: приглашение, вступление, выход, исключение, общие поля и то, как
выглядит день группы.

У каждого участника своя привычка (Task) со своими отметками; группа (HabitGroup) их
связывает. День группы выполнен, когда его выполнили все, кто в этот день был в группе
(у кого день попадает в период участия) и не был заморожен, — и те, кто потом ушёл:
прошлое не пересчитывается. Дни ушедшего группа помнит по снимку, сделанному при выходе
(`HabitGroupMark`), а дни тех, кто в группе сейчас, — по их привычкам. Дни вне участия
человека оцениваются по его собственным отметкам: история вступившего начинается с дня
вступления.

Групповой можно сделать и новую, и уже существующую привычку (/sync с `shared`), пока
человек в ней один, — и так же обратно сделать обычной (`unshare`). Вышедший и
исключённый привычку не теряют: она остаётся у него обычной, со всеми отметками, и с
группой больше не связана. Вернувшийся по ссылке вступает как новичок — с новой
привычкой; его прежние дни в группе остаются в счёте. Вышел последний — группы больше
нет. Автоотметки в групповой привычке нет.

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
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from backend import services
from backend.constants import (
    HISTORY_DAYS,
    INVITE_CODE_LENGTH,
    MAX_GROUP_MEMBERS,
    MAX_HABITS_PER_USER,
)
from backend.errors import ApiError
from backend.models import FrequencyType, HabitGroup, HabitGroupMember, Task, User
from backend.repository import Repository
from backend.schedule import period_bounds, task_days
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


@dataclass(kw_only=True)
class _Part:
    """Участие в группе по дням: периоды и что сделано в эти дни. Закрытые периоды — по
    снимку, сделанному при выходе, идущий (с `live_from`) — по живой привычке."""

    periods: list[tuple[date, date | None]]
    # Снимок закрытых периодов.
    past_done: set[date]
    past_units: dict[date, int]
    past_frozen: set[date]
    # Первый день идущего периода (None — вышел) и его привычка по дням.
    live_from: date | None = None
    live_done: set[date] = field(default_factory=set)
    live_counts: dict[date, int] = field(default_factory=dict)
    live_frozen: Callable[[date], bool] = lambda day: False

    def covers(self, day: date) -> bool:
        """Был ли он в группе в этот день."""
        return any(start <= day and (end is None or day < end) for start, end in self.periods)

    def _live(self, day: date) -> bool:
        return self.live_from is not None and day >= self.live_from

    def is_done(self, day: date) -> bool:
        return day in (self.live_done if self._live(day) else self.past_done)

    def count_on(self, day: date, target: int) -> int:
        """Сколько раз выполнил в день (до цели `target`); выполненный день — цель."""
        if self.is_done(day):
            return target
        counts = self.live_counts if self._live(day) else self.past_units
        return min(counts.get(day, 0), target)

    def is_frozen(self, day: date) -> bool:
        return self.live_frozen(day) if self._live(day) else day in self.past_frozen

    def reached(self, start: date, end: date, quota: int) -> bool | None:
        """«Гибкий график»: набрал ли он цель `quota` (дней) за период с `start` по `end`;
        None — был в группе не весь период или замораживал привычку: тогда период по нему
        не оценивается."""
        days = [start + timedelta(days=offset) for offset in range((end - start).days + 1)]
        if not all(self.covers(day) and not self.is_frozen(day) for day in days):
            return None
        return sum(1 for day in days if self.is_done(day)) >= quota


@dataclass(kw_only=True)
class _Member(_Part):
    """Активный участник со всем, что нужно для дней группы."""

    member: HabitGroupMember
    user: User
    task: Task
    # День отметки участника (его пояс и «Отмечать за вчера»).
    today: date


@dataclass
class GroupState:
    """Группа: активные участники по времени вступления, все участия по дням (и вышедших
    — их дни остаются в счёте) и чёрный список."""

    group: HabitGroup
    members: list[_Member]
    parts: list[_Part]
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
    # «Гибкий график»: набрали ли цель за период остальные (services.OthersReached).
    others_reached: Callable[[date, date, int], bool] | None = None


@dataclass
class _Past:
    """Снимок участника: выполненные дни, неполные (сколько раз) и замороженные."""

    done: set[date]
    units: dict[date, int]
    frozen: set[date]

    @classmethod
    def of(cls, marks: list[tuple[date, bool, int, bool]]) -> _Past:
        return cls(
            done={day for day, done, _, _ in marks if done},
            units={day: units for day, done, units, _ in marks if not done and units},
            frozen={day for day, _, _, frozen in marks if frozen},
        )


async def load_groups(repo: Repository, group_ids: Collection[int]) -> dict[int, GroupState]:
    """Группы с участниками (и вышедшими), их отметками, заморозками, периодами и
    снимками — одним набором запросов на все группы."""
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
    former = await repo.former_members(group_ids)
    task_ids = [member.task_id for member in members if member.task_id is not None]
    todays = {user_id: services.user_today(user) for user_id, user in users.items()}
    horizon = max(todays.values(), default=date.today()) + timedelta(days=1)
    since = min(todays.values(), default=date.today()) - timedelta(days=HISTORY_DAYS + 1)
    done = await repo.get_done_dates(task_ids, horizon)
    freezes = await repo.get_freezes(task_ids)
    counts = await repo.get_history_counts(task_ids, since, horizon)
    member_ids = [member.id for member in [*members, *former]]
    periods = await repo.periods_of(member_ids)
    marks = await repo.group_marks_of(member_ids)
    banned = await repo.banned_members(group_ids)
    banned_users = await repo.get_users({member.user_id for member in banned})

    states: dict[int, GroupState] = {}
    for group_id in group_ids:
        group = await repo.get_group(group_id)
        if group is not None:
            states[group_id] = GroupState(
                group=group,
                members=[],
                parts=[],
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
        past = _Past.of(marks[member.id])
        item = _Member(
            member=member,
            user=users[member.user_id],
            task=task,
            today=today,
            periods=periods[member.id],
            past_done=past.done,
            past_units=past.units,
            past_frozen=past.frozen,
            live_from=next((start for start, end in periods[member.id] if end is None), today),
            live_done=done[task.id],
            live_counts=counts[task.id],
            live_frozen=services.frozen_check(task, freezes[task.id], today),
        )
        state.members.append(item)
        state.parts.append(item)
    for member in former:
        state = states.get(member.group_id)
        if state is None or not periods[member.id]:
            continue
        past = _Past.of(marks[member.id])
        state.parts.append(
            _Part(
                periods=periods[member.id],
                past_done=past.done,
                past_units=past.units,
                past_frozen=past.frozen,
            )
        )
    return states


def viewer_part(state: GroupState, task_id: int, today: date) -> ViewerGroup | None:
    """Совместная привычка глазами владельца привычки `task_id`; `today` — его день
    отметки (все даты групп — его). None — его нет среди активных участников.

    Его дни в группе — с вступления этой привычки (`live_from`): прежние периоды
    вернувшегося были с другой привычкой — на его календаре их нет, у остальных они в
    счёте."""
    me = next((item for item in state.members if item.task.id == task_id), None)
    if me is None:
        return None
    others = [item for item in state.parts if item is not me]
    joined = me.live_from or today

    def required(day: date) -> list[_Part]:
        """Остальные, чья часть нужна в этот день (вне моего участия — никто)."""
        if day < joined:
            return []
        return [item for item in others if item.covers(day) and not item.is_frozen(day)]

    def others_done(day: date) -> bool:
        return all(item.is_done(day) for item in required(day))

    def others_reached(start: date, end: date, quota: int) -> bool:
        """«Гибкий график»: период засчитан остальными — каждый, кто был в группе весь
        период (и не замораживал), набрал цель. Вступивший или ушедший посреди периода не
        в счёт; до моего вступления — только я."""
        if start < joined:
            return True
        return all(item.reached(start, end, quota) is not False for item in others)

    history_start = today - timedelta(days=HISTORY_DAYS - 1)
    history_days = [history_start + timedelta(days=offset) for offset in range(HISTORY_DAYS)]
    target = me.task.times_per_day
    others_units, people, fill, mine = [], [], [], []
    for day in history_days:
        needed = required(day)
        units = sum(item.count_on(day, target) for item in needed)
        own = me.count_on(day, target)
        others_units.append(units)
        people.append(len(needed) + 1)
        mine.append(own)
        fill.append(round(min((units + own) / ((len(needed) + 1) * target), 1.0), 4))
    owner_id = state.group.owner_id
    is_owner = owner_id == me.user.telegram_id
    flexible = me.task.frequency_type == FrequencyType.flexible
    if flexible:
        start, end = period_bounds(me.task.period or "week", today)
        quota = min(me.task.period_times or 1, (end - start).days + 1)
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
                done=item.is_done(today),
                count=item.count_on(today, item.task.times_per_day),
                frozen=item.is_frozen(today),
                period_done=min(_period_done(item), quota) if flexible else 0,
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
        others_reached=others_reached(start, end, quota) if flexible else True,
    )
    return ViewerGroup(
        view=view,
        others_done=others_done,
        open_from=view.open_from or today,
        my_units=mine,
        others_reached=others_reached,
    )


def _period_done(item: _Member) -> int:
    """«Гибкий график»: сколько дней участник выполнил в своём текущем периоде (в своих
    днях — пояс и «Отмечать за вчера» у каждого свои). Дни сверх цели — бонусные: в счёт
    их не берут (не больше цели)."""
    start, _ = period_bounds(item.task.period or "week", item.today)
    days = (item.today - start).days + 1
    return sum(1 for offset in range(days) if item.is_done(start + timedelta(days=offset)))


# --------------------------------------------------------------------------- #
#  Общие поля
# --------------------------------------------------------------------------- #


async def _apply_shared_fields(repo: Repository, user: User, task: Task, source: Task) -> None:
    """Общие поля привычки владельца `source` (всё, кроме напоминаний) — на привычку
    участника `task`. Прежнее расписание запоминается, как при изменении в форме;
    автоотметка выключается."""
    await services.remember_schedule(
        repo, user, task, source.frequency_type, source.days, source.start_date,
        source.times_per_day, source.period, source.period_times, source.overtime,
    )
    await repo.set_task_shared_fields(
        task,
        source.name,
        source.description,
        source.frequency_type,
        source.days,
        source.start_date,
        source.times_per_day,
        source.color,
        source.period,
        source.period_times,
        source.overtime,
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
            period=task.period,
            period_times=task.period_times,
            times_per_day=task.times_per_day,
            overtime=task.overtime,
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
    со всеми отметками, а группа запоминает, что он сделал за период участия (снимок):
    её прошлое не меняется ни от выхода, ни от его правок потом. Ушёл владелец — владелец
    тот, кто вступил раньше всех; не осталось никого — группа удаляется."""
    end = services.user_today(user) if user is not None else date.today()
    closed = await repo.deactivate_member(member, end)
    if closed is not None and member.task_id is not None:
        await _remember_days(repo, member, member.task_id, closed[0], end)
    heir = await repo.earliest_active_member(group.id)
    if heir is None:
        await repo.delete_group(group)
    elif group.owner_id == member.user_id:
        await repo.set_group_owner(group, heir.user_id)


async def _remember_days(
    repo: Repository, member: HabitGroupMember, task_id: int, start: date, end: date
) -> None:
    """Снимок участника за дни с `start` по `end` (не включая) — по его привычке."""
    task = await repo.get_user_task(task_id, member.user_id)
    if task is None:
        return
    last = end - timedelta(days=1)
    done = (await repo.get_done_dates([task.id], last))[task.id]
    counts = (await repo.get_history_counts([task.id], start, last))[task.id]
    is_frozen = services.frozen_check(task, (await repo.get_freezes([task.id]))[task.id], end)
    marks = []
    day = start
    while day < end:
        units = counts.get(day, 0)
        frozen = is_frozen(day)
        if day in done or units or frozen:
            marks.append((day, day in done, units, frozen))
        day += timedelta(days=1)
    await repo.save_group_marks(member.id, start, end, marks)


async def leave(repo: Repository, user: User, group_id: int) -> None:
    """«Выйти»: привычка остаётся у него обычной; вернуться можно по ссылке — с новой
    привычкой, его дни в группе остаются в счёте."""
    group, member = await _membership(repo, user, group_id)
    task_id = member.task_id
    await _deactivate(repo, group, member, user)
    await repo.log_action(user.telegram_id, "group_left", ref_id=task_id)


async def kick(repo: Repository, user: User, group_id: int, user_id: int) -> None:
    """Исключить участника (только владелец): как выход — привычка остаётся у него
    обычной, прошлое группы не меняется, — а сам он в чёрном списке: по ссылке не вступит, пока владелец его оттуда не
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
    """Групповую привычку удалили: сначала выход из группы (её дни в группе остаются в
    счёте)."""
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
    # join — можно вступить, member — уже участник, banned — в чёрном списке, full — мест
    # нет.
    state: str


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
    else:
        state = "join"
    return InvitePreview(
        group=group,
        task=source,
        member_names=[member_name(users.get(member.user_id)) for member in members],
        state=state,
    )


async def join(repo: Repository, user: User, code: str) -> tuple[str, Task]:
    """Вступить по ссылке: `joined` — новая привычка с общими полями владельца (и у
    вернувшегося: его прежняя осталась обычной, а прошлые дни в группе — в счёте),
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
    if await repo.count_active_tasks(user.telegram_id) >= MAX_HABITS_PER_USER:
        raise ApiError(
            409, "habit_limit", f"Можно завести не больше {MAX_HABITS_PER_USER} привычек"
        )
    today = services.user_today(user)
    task = await repo.create_task(
        user_id=user.telegram_id,
        name=source.name,
        description=source.description,
        frequency_type=source.frequency_type,
        days=source.days,
        start_date=source.start_date,
        period=source.period,
        period_times=source.period_times,
        color=source.color,
        times_per_day=source.times_per_day,
        overtime=source.overtime,
    )
    await repo.log_action(user.telegram_id, "habit_created", ref_id=task.id)
    if me is not None:
        await repo.reactivate_member(me, task.id, today)
    else:
        await repo.add_member(group, user.telegram_id, task.id, today)
    await repo.log_action(user.telegram_id, "group_joined", ref_id=task.id)
    return "joined", task


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
    поставленная повтора не даёт. Смотрит отметки за последние сутки; отметка задним
    числом (день старше позавчера — исправили его в календаре) не сообщается."""
    pending = await repo.pending_group_marks(now - timedelta(days=1))
    if not pending:
        return [], []
    log_ids = [log.id for log, _ in pending]
    pending = [(log, member) for log, member in pending if _fresh_mark(log.scheduled_date, log.marked_at)]
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
    return notices, log_ids


def _fresh_mark(day: date, marked_at: datetime | None) -> bool:
    """Отметка за свой день, а не задним числом: день — не раньше позавчера по UTC в момент
    отметки (пояса до ±14 ч и «Отмечать за вчера» дают свой день в пределах двух суток)."""
    return marked_at is not None and day >= marked_at.date() - timedelta(days=2)

