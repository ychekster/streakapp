"""Все пользовательские тексты бота.

Принцип: ни одной строки-сообщения в хендлерах. Тексты хранятся в «чистом» виде
(без разметки); жирность применяется при отправке через `aiogram.utils.formatting`,
который сам заботится об экранировании.
"""

from __future__ import annotations

from typing import NamedTuple

# --------------------------------------------------------------------------- #
#  Анимированные эмодзи
# --------------------------------------------------------------------------- #


class CustomEmoji(NamedTuple):
    """Анимированный (custom) эмодзи из набора Telegram.

    Боту они доступны, пока у его владельца Telegram Premium. В тексте сообщения на месте
    анимированного стоит обычный эмодзи `fallback` — его увидит клиент, который
    анимированный показать не может; `id` — custom_emoji_id.
    """

    fallback: str
    id: str


# Перед заголовком приветствия /start.
WELCOME_EMOJI = CustomEmoji(fallback="👋", id="5985478698722136468")
# В начале напоминания о привычке (вместо колокольчика).
REMINDER_EMOJI = CustomEmoji(fallback="🔔", id="6039486778597970865")
# Иконка кнопки «Открыть приложение» — под приветствием и под напоминанием. На кнопке
# нужен только id: иконка стоит перед текстом отдельно от него.
OPEN_APP_EMOJI = CustomEmoji(fallback="✈️", id="6028346797368283073")

# --------------------------------------------------------------------------- #
#  Приветствие (/start)
# --------------------------------------------------------------------------- #

# Жирный заголовок.
WELCOME_TITLE = "Добро пожаловать в Knot"

# Абзац о проекте: что это и как работает.
WELCOME_ABOUT = (
    "Добавляй привычки, которые хочешь соблюдать, отмечай выполнение в одно "
    "касание и следи за тем, как копится твой стрик!"
)

# Жирный призыв под кнопкой запуска приложения.
WELCOME_CALL_TO_ACTION = "Нажми на кнопку, чтобы запустить приложение:"

# Текст inline-кнопки под приветствием (и под напоминанием); перед ним — иконка
# OPEN_APP_EMOJI.
BTN_OPEN_APP = "Открыть приложение"

# Текст кнопки меню слева от поля ввода (bot/main.py). Отдельно от BTN_OPEN_APP: рядом
# с полем ввода места мало, и там кнопка короче — без эмодзи и без слова «приложение».
MENU_BUTTON_TEXT = "Открыть"

# Описание /start в подсказке команд, которая всплывает при вводе «/» в поле сообщения
# (bot/main.py). Одно на все языки Telegram.
START_COMMAND_DESCRIPTION = "Перезапуск бота"

# Языки, для которых прежние версии бота задавали свой список команд. Такой список
# важнее общего, поэтому при старте он удаляется — иначе там осталось бы старое описание.
LEGACY_COMMAND_LANGUAGES: tuple[str, ...] = ("ru", "en")

# --------------------------------------------------------------------------- #
#  Напоминание о привычке (bot/reminders.py)
# --------------------------------------------------------------------------- #

# Приходит в чат во время, заданное в приложении, на языке приложения (ключ — язык
# интерфейса, backend/constants.py LANGUAGES); {name} — название привычки. Перед
# текстом — REMINDER_EMOJI и пробел.
REMINDER_TEXTS: dict[str, str] = {
    "ru": "Пора выполнить «{name}»",
    "en": "Time to do “{name}”",
}

# Напоминание «Пора отметить привычки» — включается в настройках приложения, приходит в
# выбранные дни и время. Перед текстом — тот же REMINDER_EMOJI, под ним — та же кнопка.
CHECKIN_REMINDER_TEXTS: dict[str, str] = {
    "ru": "Пора отметить привычки",
    "en": "Time to check off your habits",
}

# Кнопка под напоминанием: открывает Mini App, где привычку и отмечают. Ничего сама по
# себе не делает — отметка ставится в приложении. По-русски — та же, что под
# приветствием /start.
REMINDER_BUTTONS: dict[str, str] = {
    "ru": BTN_OPEN_APP,
    "en": "Open App",
}

# --------------------------------------------------------------------------- #
#  "Log in via Telegram" from the web app (bot/handlers/web_login.py)
# --------------------------------------------------------------------------- #

# The web app opens the bot with /start login_<code>; the user confirms here (a press
# links the app to this Telegram account).
LOGIN_CONFIRM_TEXT = "Войти в приложение Knot с этим аккаунтом Telegram?"
LOGIN_CONFIRM_BUTTON = "Подтвердить вход"
LOGIN_CANCEL_BUTTON = "Отмена"
LOGIN_DONE_TEXT = "Готово! Вход выполнен, вернитесь в приложение Knot."
LOGIN_EXPIRED_TEXT = "Ссылка для входа устарела. Начните вход в приложении ещё раз."
LOGIN_CANCELLED_TEXT = "Вход отменён."

# --------------------------------------------------------------------------- #
#  Совместные привычки (bot/handlers/group_invite.py, bot/reminders.py)
# --------------------------------------------------------------------------- #

# Ссылка-приглашение открывает бота с /start join_<код>. Ключ — язык интерфейса
# пользователя. Заголовок обычным текстом, под ним столбиком пункты с жирными подписями
# («Название:», «Повтор:»…), внизу подсказка, какую кнопку нажать.
INVITE_TITLE: dict[str, str] = {
    "ru": "Вас приглашают в групповую привычку",
    "en": "You're invited to a group habit",
}
INVITE_NAME: dict[str, str] = {"ru": "Название:", "en": "Name:"}
INVITE_REPEAT: dict[str, str] = {"ru": "Повтор:", "en": "Repeat:"}
INVITE_GOAL: dict[str, str] = {"ru": "Цель:", "en": "Goal:"}
INVITE_COUNT: dict[str, str] = {"ru": "Участников:", "en": "Members:"}
# Значение «Участников:» — «2 из 12».
INVITE_COUNT_VALUE: dict[str, str] = {"ru": "{count} из {limit}", "en": "{count} of {limit}"}
INVITE_MEMBERS: dict[str, str] = {"ru": "Состоят:", "en": "In the habit:"}
INVITE_HINT: dict[str, str] = {
    "ru": "Нажмите «Принять», чтобы присоединиться.",
    "en": "Tap Accept to join.",
}
# Вышедшему, который свою привычку не удалял: вернётся с прежними отметками.
INVITE_REJOIN_HINT: dict[str, str] = {
    "ru": "Нажмите «Вернуться», чтобы снова вести её вместе. Ваши прежние отметки сохранятся.",
    "en": "Tap Rejoin to keep it up together again. Your earlier check-ins stay.",
}
INVITE_ACCEPT: dict[str, str] = {"ru": "Принять", "en": "Accept"}
INVITE_REJOIN: dict[str, str] = {"ru": "Вернуться", "en": "Rejoin"}
INVITE_DECLINE: dict[str, str] = {"ru": "Отклонить", "en": "Decline"}
INVITE_DONE: dict[str, str] = {
    "ru": "Готово! «{name}» уже в ваших привычках.",
    "en": "Done! “{name}” is now in your habits.",
}
INVITE_DECLINED: dict[str, str] = {"ru": "Приглашение отклонено.", "en": "Invitation declined."}
INVITE_EXPIRED: dict[str, str] = {
    "ru": "Приглашение больше не действует.",
    "en": "This invitation is no longer valid.",
}
INVITE_MEMBER: dict[str, str] = {
    "ru": "Вы уже в этой привычке.",
    "en": "You're already in this habit.",
}
INVITE_FULL: dict[str, str] = {
    "ru": "В привычке уже максимум участников.",
    "en": "This habit already has the most people it can.",
}
INVITE_BANNED: dict[str, str] = {
    "ru": "Владелец исключил вас из этой привычки, поэтому вступить по ссылке нельзя.",
    "en": "The habit's owner removed you, so you can't join through the link.",
}
INVITE_HABIT_LIMIT: dict[str, str] = {
    "ru": "У вас уже максимум привычек.",
    "en": "You already have the most habits you can.",
}

# Расписание в приглашении — как «Повтор» в приложении.
SCHEDULE_DAILY: dict[str, str] = {"ru": "Каждый день", "en": "Every day"}
SCHEDULE_EVERY_OTHER_DAY: dict[str, str] = {"ru": "Через день", "en": "Every other day"}
SCHEDULE_MONTHLY: dict[str, str] = {"ru": "Каждый месяц", "en": "Every month"}
SCHEDULE_WEEKDAYS: dict[str, tuple[str, ...]] = {
    "ru": ("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"),
    "en": ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"),
}
# «Пн, Ср и Пт».
SCHEDULE_AND: dict[str, str] = {"ru": " и ", "en": " and "}

# «Отметки участников» (включаются в совместной привычке): другой участник выполнил день.
# {name} — название привычки у получателя, {actor} — @username или имя.
GROUP_MARK_TEXTS: dict[str, str] = {
    "ru": "«{name}»: отметка от {actor}",
    "en": "“{name}”: {actor} checked in",
}
