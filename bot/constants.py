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

# The admin panel on a web device (bot/handlers/admin_device.py): the API asks the
# administrator (backend/messaging.py, send_admin_device_request); the bot answers a press
# by replacing the question with one of these (by the administrator's language).
ADMIN_DEVICE_ALLOWED_TEXT = {
    "ru": "Готово! Админ-панель на этом устройстве разрешена, вернитесь в приложение.",
    "en": "Done! The admin panel is allowed on this device, go back to the app.",
}
ADMIN_DEVICE_DECLINED_TEXT = {
    "ru": "Запрос отклонён. Если это были не вы, выйдите на всех устройствах в настройках приложения.",
    "en": "Request declined. If this wasn't you, log out on all devices in the app's settings.",
}
ADMIN_DEVICE_EXPIRED_TEXT = {
    "ru": "Запрос устарел. Откройте админ-панель в приложении ещё раз.",
    "en": "This request has expired. Open the admin panel in the app again.",
}

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
INVITE_ACCEPT: dict[str, str] = {"ru": "Принять", "en": "Accept"}
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
# «Гибкий график»: «3 дня в неделю» / «3 days a week» (bot/handlers/group_invite.py).
SCHEDULE_PERIOD: dict[str, dict[str, str]] = {
    "ru": {"week": "в неделю", "month": "в месяц", "year": "в год"},
    "en": {"week": "a week", "month": "a month", "year": "a year"},
}
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

# «Цель по времени»: идущий таймер набрал цель дня. {name} — название привычки, {goal} —
# цель (TIMER_HOURS / TIMER_MINUTES).
TIMER_GOAL_TEXTS: dict[str, str] = {
    "ru": "«{name}»: цель {goal} выполнена",
    "en": "“{name}”: {goal} goal done",
}
# Напоминание задачи (бета; день и время задачи): после 🔔 — сам текст задачи.
TODO_REMINDER_TEXTS: dict[str, str] = {"ru": "{text}", "en": "{text}"}

# Push веб-приложения (bot/reminders.push_payload): короткий заголовок — о чём (название
# привычки, текст задачи), под ним — текст. Длинный заголовок iOS и Android обрезают,
# текст под ним виден целиком. Сообщения бота — тексты выше.
PUSH_REMINDER_BODY: dict[str, str] = {
    "ru": "Пора выполнить привычку",
    "en": "Time to do this habit",
}
PUSH_CHECKIN_TITLE: dict[str, str] = CHECKIN_REMINDER_TEXTS
PUSH_CHECKIN_BODY: dict[str, str] = {
    "ru": "Отметьте, что уже успели выполнить",
    "en": "Check off what you’ve already done",
}
PUSH_TODO_BODY: dict[str, str] = {
    "ru": "Напоминание о задаче",
    "en": "Task reminder",
}
# {actor} — @username или имя участника совместной привычки.
PUSH_GROUP_MARK_BODY: dict[str, str] = {
    "ru": "Отметка от {actor}",
    "en": "{actor} checked in",
}
# {goal} — цель (TIMER_HOURS / TIMER_MINUTES).
PUSH_TIMER_GOAL_BODY: dict[str, str] = {
    "ru": "{goal}: цель на сегодня выполнена",
    "en": "{goal}: today’s goal is done",
}
# Цель в уведомлении: «1 ч 30 мин», «45 мин», «2 ч».
TIMER_HOURS: dict[str, str] = {"ru": "{} ч", "en": "{} h"}
TIMER_MINUTES: dict[str, str] = {"ru": "{} мин", "en": "{} min"}
