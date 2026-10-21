"""Приглашение в совместную привычку (backend/groups.py).

- `/start join_<код>` — ссылка-приглашение: бот показывает привычку (название, расписание,
  участники) и спрашивает «Принять» / «Отклонить». Вышедшему, который свою привычку не
  удалял, — «Вернуться»: его прежняя история снова в счёт.
- «Принять» перепроверяет код (ссылку могли сбросить) и добавляет привычку; сообщение
  меняется на «Готово! «Бег» уже в ваших привычках.» — без кнопок: приложение человек
  откроет там, где ему удобно (Mini App или веб-приложение — аккаунт один). Следом бот
  сверяет фото профиля вступившего (bot/profiles.py) — остальные сразу видят его фото.

Пишет на языке пользователя. Подключается до `start`: его фильтр /start уже.
"""

from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message
from aiogram.utils.formatting import Bold, Text
from loguru import logger

from bot.constants import (
    INVITE_ACCEPT,
    INVITE_DECLINE,
    INVITE_DECLINED,
    INVITE_DETAILS,
    INVITE_DONE,
    INVITE_EXPIRED,
    INVITE_FULL,
    INVITE_HABIT_LIMIT,
    INVITE_MEMBER,
    INVITE_REJOIN,
    INVITE_TITLE,
    SCHEDULE_AND,
    SCHEDULE_DAILY,
    SCHEDULE_EVERY_OTHER_DAY,
    SCHEDULE_MONTHLY,
    SCHEDULE_TIMES,
    SCHEDULE_WEEKDAYS,
)
from bot.handlers.start import record_start
from bot.profiles import refresh_new_mates_photos
from backend import groups
from backend.constants import DEFAULT_LANGUAGE, MAX_GROUP_MEMBERS, WEEKDAYS
from backend.database import Database
from backend.errors import ApiError
from backend.models import FrequencyType, Task
from backend.repository import Repository
from backend.schedule import task_days

router = Router(name="group_invite")

_ACCEPT = "join:ok:"
_DECLINE = "join:no"


def _text(texts: dict[str, str], language: str) -> str:
    return texts.get(language, texts[DEFAULT_LANGUAGE])


def schedule_label(task: Task, language: str) -> str:
    """Расписание привычки — как «Повтор» в приложении; цель больше раза — через «·»."""
    if task.frequency_type == FrequencyType.every_other_day:
        label = _text(SCHEDULE_EVERY_OTHER_DAY, language)
    elif task.frequency_type == FrequencyType.monthly:
        label = _text(SCHEDULE_MONTHLY, language)
    elif task.frequency_type == FrequencyType.daily or len(task_days(task)) == len(WEEKDAYS):
        label = _text(SCHEDULE_DAILY, language)
    else:
        names = SCHEDULE_WEEKDAYS.get(language, SCHEDULE_WEEKDAYS[DEFAULT_LANGUAGE])
        days = [names[WEEKDAYS.index(code)] for code in task_days(task)]
        label = (
            ", ".join(days[:-1]) + _text(SCHEDULE_AND, language) + days[-1]
            if len(days) > 1
            else "".join(days)
        )
    if task.times_per_day > 1:
        label += " · " + _text(SCHEDULE_TIMES, language).format(count=task.times_per_day)
    return label


@router.message(CommandStart(deep_link=True, magic=F.args.startswith(groups.INVITE_PREFIX)))
async def start_invite(message: Message, command: CommandObject, database: Database) -> None:
    """Показать приглашение. Сброшенная или неверная ссылка — «больше не действует»."""
    if message.from_user is None:
        return
    await record_start(database, message.from_user, command.args)
    code = (command.args or "")[len(groups.INVITE_PREFIX):]
    async with database.session_factory() as session:
        repo = Repository(session)
        user = await repo.get_user(message.from_user.id)
        if user is None:
            return
        language = user.language
        preview = await groups.preview_invite(repo, user, code)
    if preview is None:
        await message.answer(_text(INVITE_EXPIRED, language))
        return
    if preview.state == "member":
        await message.answer(_text(INVITE_MEMBER, language))
        return
    if preview.state == "full":
        await message.answer(_text(INVITE_FULL, language))
        return
    content = Text(
        Bold(_text(INVITE_TITLE, language).format(name=preview.task.name)),
        "\n",
        _text(INVITE_DETAILS, language).format(
            schedule=schedule_label(preview.task, language),
            members=", ".join(preview.member_names),
            count=len(preview.member_names),
            limit=MAX_GROUP_MEMBERS,
        ),
    )
    accept = INVITE_REJOIN if preview.state == "rejoin" else INVITE_ACCEPT
    markup = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text=_text(accept, language), callback_data=f"{_ACCEPT}{code}"
                )
            ],
            [InlineKeyboardButton(text=_text(INVITE_DECLINE, language), callback_data=_DECLINE)],
        ]
    )
    await message.answer(**content.as_kwargs(), reply_markup=markup)


_REFUSALS = {
    "group_not_found": INVITE_EXPIRED,
    "group_full": INVITE_FULL,
    "habit_limit": INVITE_HABIT_LIMIT,
}


@router.callback_query(F.data.startswith(_ACCEPT))
async def accept_invite(callback: CallbackQuery, database: Database) -> None:
    """Вступить: код проверяется заново — ссылку могли сбросить, пока сообщение висело."""
    code = (callback.data or "")[len(_ACCEPT):]
    sender = callback.from_user
    async with database.session_factory() as session:
        repo = Repository(session)
        user = await repo.get_user(sender.id)
        if user is None:
            await callback.answer()
            return
        # Имя и @username — свежие из Telegram: под ними человека увидят участники.
        await repo.update_profile(user, sender.username, sender.first_name)
        language = user.language
        try:
            outcome, task = await groups.join(repo, user, code)
        except ApiError as exc:
            await session.rollback()
            await _replace(callback, _text(_REFUSALS.get(exc.code, INVITE_EXPIRED), language))
            return
        name = task.name
        await session.commit()
    text = INVITE_MEMBER if outcome == "member" else INVITE_DONE
    await _replace(callback, _text(text, language).format(name=name))
    if outcome != "member" and callback.bot is not None:
        await refresh_new_mates_photos(callback.bot, database, sender.id)


@router.callback_query(F.data == _DECLINE)
async def decline_invite(callback: CallbackQuery, database: Database) -> None:
    async with database.session_factory() as session:
        user = await Repository(session).get_user(callback.from_user.id)
    language = user.language if user is not None else DEFAULT_LANGUAGE
    await _replace(callback, _text(INVITE_DECLINED, language))


async def _replace(callback: CallbackQuery, text: str) -> None:
    """Ответить на нажатие и заменить приглашение итогом (без кнопок)."""
    await callback.answer()
    if callback.message is None:
        return
    try:
        await callback.message.edit_text(text)  # type: ignore[union-attr]
    except TelegramBadRequest as exc:
        logger.debug("Invite message not edited: {}", exc)
