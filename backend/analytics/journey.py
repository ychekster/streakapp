"""Путь посетителей с сайта: где отваливаются люди, пришедшие на лендинг.

Каждый, кто открыл лендинг за период, — один человек: устройство (`anon_id`) или его
аккаунт, если он уже есть (события устройства связываются с аккаунтом при входе, при
/start бота со ссылки лендинга, см. funnel.record_client_event, bot/handlers/start.py).
Дальше две ветки (JOURNEY_PATHS): установка веб-приложения и переход в бота. На шаге
считается каждый, кто дошёл до него или до любого шага ветки дальше: часть шагов шлют не
все устройства. В ветку попадает тот, у кого есть её собственный шаг (не общие «первая
привычка» и «первая отметка»). Тестовые аккаунты не считаются.

По шагу — люди, которые до него дошли и дальше не пошли, а по человеку — все его шаги с
самого начала (visitor).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from backend.analytics.profile import event_item
from backend.constants import (
    JOURNEY_PATHS,
    JOURNEY_PEOPLE_LIMIT,
    VISITOR_EVENTS_LIMIT,
)
from backend.models import Event, User
from backend.repository import Repository, utc_now
from backend.schemas import (
    JourneyPath,
    JourneyPeople,
    JourneyPerson,
    JourneyResponse,
    JourneyStep,
    VisitorJourney,
)

_ENTRY = "landing_view"
_EVENTS = sorted({event for steps in JOURNEY_PATHS.values() for event in steps})
# Общий хвост веток: в ветку по нему не попадают.
_SHARED_TAIL = 2

# Человек: ("u", id аккаунта) или ("a", id устройства).
Person = tuple[str, int | str]


@dataclass
class _Track:
    """Что известно о человеке: его шаги и последнее событие."""

    events: set[str] = field(default_factory=set)
    entered: bool = False
    anon_id: str | None = None
    user_id: int | None = None
    last: Event | None = None


def _name(user: User | None) -> str | None:
    if user is None:
        return None
    return user.first_name or (f"@{user.username}" if user.username else None)


async def _tracks(repo: Repository, days: int) -> dict[Person, _Track]:
    """Люди, открывшие лендинг за `days` дней (по сегодня), и все их шаги с начала периода."""
    since = utc_now() - timedelta(days=days)
    events = await repo.journey_events(since, _EVENTS)
    # Устройство, которое видели с аккаунтом, — этот аккаунт.
    owner: dict[str, int] = {}
    for event in events:
        if event.anon_id is not None and event.user_id is not None:
            owner[event.anon_id] = event.user_id
    tracks: dict[Person, _Track] = defaultdict(_Track)
    for event in events:
        user_id = event.user_id or (owner.get(event.anon_id) if event.anon_id else None)
        if user_id is not None:
            key: Person = ("u", user_id)
        elif event.anon_id is not None:
            key = ("a", event.anon_id)
        else:
            continue
        track = tracks[key]
        track.events.add(event.event)
        track.entered = track.entered or event.event == _ENTRY
        track.user_id = user_id
        track.anon_id = event.anon_id or track.anon_id
        track.last = event
    users = await repo.get_users([key[1] for key in tracks if key[0] == "u"])  # type: ignore[misc]
    return {
        key: track
        for key, track in tracks.items()
        if track.entered and not (track.user_id is not None and _is_test(users, track.user_id))
    }


def _is_test(users: dict[int, User], user_id: int) -> bool:
    user = users.get(user_id)
    return bool(user is not None and user.is_test)


def _in_path(track: _Track, steps: tuple[str, ...]) -> bool:
    return bool(track.events & set(steps[1:-_SHARED_TAIL]))


def _reached(track: _Track, steps: tuple[str, ...], index: int) -> bool:
    """Дошёл до шага `index` ветки: он или любой дальше (первый шаг — все вошедшие)."""
    if index == 0:
        return True
    return _in_path(track, steps) and bool(track.events & set(steps[index:]))


async def journey(repo: Repository, days: int) -> JourneyResponse:
    tracks = list((await _tracks(repo, days)).values())
    paths: list[JourneyPath] = []
    for path, steps in JOURNEY_PATHS.items():
        counts = [
            sum(1 for track in tracks if _reached(track, steps, index))
            for index in range(len(steps))
        ]
        paths.append(
            JourneyPath(
                path=path,
                steps=[
                    JourneyStep(
                        key=step,
                        people=count,
                        from_previous=count / counts[index - 1]
                        if index and counts[index - 1]
                        else None,
                        from_start=count / counts[0] if index and counts[0] else None,
                    )
                    for index, (step, count) in enumerate(zip(steps, counts))
                ],
            )
        )
    return JourneyResponse(days=days, paths=paths)


async def stuck(repo: Repository, days: int, path: str, step: str) -> JourneyPeople:
    """Дошли до шага `step` ветки `path` и дальше не пошли (на последнем шаге — все, кто до
    него дошёл), последние сначала."""
    steps = JOURNEY_PATHS[path]
    index = steps.index(step)
    tracks = (await _tracks(repo, days)).values()
    found = [
        track
        for track in tracks
        if track.last is not None
        and _reached(track, steps, index)
        and (index == len(steps) - 1 or not _reached(track, steps, index + 1))
        # С первого шага в ветку «застрял» — тот, кто ни в одну ветку не пошёл.
        and (index > 0 or not any(_in_path(track, other) for other in JOURNEY_PATHS.values()))
    ]
    found.sort(key=lambda track: track.last.created_at if track.last else datetime.min, reverse=True)
    found = found[:JOURNEY_PEOPLE_LIMIT]
    users = await repo.get_users([track.user_id for track in found if track.user_id is not None])
    return JourneyPeople(
        items=[
            JourneyPerson(
                anon_id=track.anon_id,
                user_id=track.user_id,
                name=_name(users.get(track.user_id)) if track.user_id is not None else None,
                last_event=track.last.event,
                last_at=track.last.created_at,
                platform=track.last.platform,
                src=track.last.src,
            )
            for track in found
            if track.last is not None
        ]
    )


async def visitor(repo: Repository, anon_id: str) -> VisitorJourney:
    """Все шаги устройства с самого начала; его аккаунт, если он уже есть."""
    events = await repo.anon_events(anon_id, VISITOR_EVENTS_LIMIT)
    user_id = next((event.user_id for event in reversed(events) if event.user_id), None)
    user = (await repo.get_users([user_id])).get(user_id) if user_id is not None else None
    return VisitorJourney(
        anon_id=anon_id,
        user_id=user_id,
        name=_name(user),
        items=[event_item(event) for event in events],
    )
