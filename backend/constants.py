"""Неизменяемые структурные константы API.

Магические числа не разбросаны по коду — они собраны здесь и переиспользуются
в сервисах и схемах ответа.
"""

from __future__ import annotations

# Длина истории выполнения привычки в ответе API: 14 рядов по 26 столбцов = 364 дня.
# Экран привычки во фронтенде показывает её целиком, список — последние 8 рядов
# по 23 столбца (184 дня). Самый старый день — левый верхний угол сетки, сегодня — правый нижний
# (индекс 0 в истории = самый старый, последний = сегодня).
HISTORY_DAYS = 364

# Префикс схемы авторизации в заголовке `Authorization` (рекомендация Telegram):
#   Authorization: tma <initData>
INIT_DATA_AUTH_SCHEME = "tma"
# The installed web app authenticates with its session token instead:
#   Authorization: Bearer <token>
WEB_SESSION_AUTH_SCHEME = "bearer"

# Предел целого числа, которое принимает колонка базы: 64-битное знаковое (SQLite
# INTEGER, PostgreSQL BIGINT). Идентификаторы в пути и курсоры страниц ограничены им:
# большее значение — не «не найдено», а ошибка драйвера на ровном месте, поэтому такие
# запросы отсекаются проверкой параметров (422), не доходя до базы.
MAX_DB_INT = 2**63 - 1

# Максимальная длина названия привычки (совпадает с длиной колонки tasks.name).
HABIT_NAME_MAX_LENGTH = 100

# Сколько активных привычек может быть у пользователя. Лимит защищает от раздувания
# базы и от шквала напоминаний одному пользователю в одну минуту (их рассылка общая
# для всех, см. bot/reminders.py). Реальным пользователям хватает с запасом.
MAX_HABITS_PER_USER = 50

# Максимальный размер тела запроса. Самый большой запрос приложения — форма
# привычки — меньше килобайта; больший отвергается (413) до разбора, чтобы запрос
# любого размера не разворачивался в памяти. Исключение — загрузка медиа рассылки
# (BROADCAST_UPLOAD_MAX_BYTES ниже).
MAX_REQUEST_BODY_BYTES = 64 * 1024

# Ответы API больше этого размера сжимаются (gzip).
GZIP_MIN_BYTES = 1024

# Запросы дольше этого порога (в секундах) пишутся в лог предупреждением.
SLOW_REQUEST_SECONDS = 1.0

# Цвета (темы) привычки — ключи палитры фронтенда (`--palette-*` в
# frontend/src/styles/variables.css, список — HABIT_COLORS в constants.ts).
# По умолчанию — синий: так выглядели все привычки до появления выбора цвета.
HABIT_COLORS: tuple[str, ...] = (
    "blue",
    "lightblue",
    "teal",
    "green",
    "yellow",
    "orange",
    "red",
    "pink",
    "purple",
    "indigo",
    "brown",
    "graphite",
)
DEFAULT_HABIT_COLOR = "blue"
# Длина колонки tasks.color (с запасом под будущие ключи палитры).
HABIT_COLOR_MAX_LENGTH = 20

# Синхронизация изменений, сделанных на устройстве (`POST /sync`): id, который устройство
# даёт новой привычке (колонка tasks.client_ref), — не длиннее этого; операций в одном
# запросе — не больше SYNC_MAX_OPS (устройство отправляет накопленное частями).
CLIENT_REF_MAX_LENGTH = 64
SYNC_MAX_OPS = 200

# Время напоминания в API — «ЧЧ:ММ» в поясе пользователя (например, "09:00").
REMINDER_TIME_FORMAT = "%H:%M"

# Коды дней недели в порядке `date.weekday()` (понедельник == 0). Подписи дней — на
# языке интерфейса, во фронтенде.
WEEKDAYS: tuple[str, ...] = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")

# Первый день привычки «через день» — не дальше стольких дней от сегодня.
START_DATE_MAX_AHEAD_DAYS = 366

# Языки интерфейса (на языке пользователя бот пишет и напоминания). Новый пользователь
# получает язык своего Telegram: русский, если Telegram на русском, иначе английский.
# У заведённых раньше — русский: другого языка у приложения тогда не было.
LANGUAGES: tuple[str, ...] = ("ru", "en")
DEFAULT_LANGUAGE = "ru"

# Поиск города для часового пояса: сколько городов вернуть и самый длинный запрос.
TIMEZONE_SEARCH_LIMIT = 50
TIMEZONE_QUERY_MAX_LENGTH = 100

# Темы оформления: светлая, тёмная и системная ("system" — следует за системой).
THEMES: tuple[str, ...] = ("light", "dark", "system")
# Тема нового пользователя: как в системе (в Telegram — как в Telegram).
DEFAULT_THEME = "system"

# --------------------------------------------------------------------------- #
#  Отзывы
# --------------------------------------------------------------------------- #

# Максимальная длина отзыва (совпадает с REVIEW_MAX_LENGTH во фронтенде).
REVIEW_MAX_LENGTH = 2000
# Сколько отзывов пользователь может оставить за сутки: защищает раздел отзывов
# админ-панели от потока одинаковых сообщений.
MAX_REVIEWS_PER_DAY = 5

# --------------------------------------------------------------------------- #
#  Активность пользователей (аналитика админ-панели)
# --------------------------------------------------------------------------- #

# Время последнего запроса пользователя (`users.last_seen_at`) обновляется не чаще
# раза в столько секунд: иначе каждый запрос приложения был бы ещё и записью в базу.
LAST_SEEN_RESOLUTION_SECONDS = 60
# «Сейчас в приложении» — был запрос за последние столько минут.
ACTIVE_NOW_MINUTES = 5

# --------------------------------------------------------------------------- #
#  Админ-панель
# --------------------------------------------------------------------------- #

# Первый администратор: добавляется в пустой список при старте API (и миграцией 0008).
# Дальше список ведут сами администраторы в админ-панели.
SEED_ADMIN_IDS: tuple[int, ...] = (6422071424,)

# --------------------------------------------------------------------------- #
#  Аналитика админ-панели (backend/analytics/)
# --------------------------------------------------------------------------- #

# Дни аналитики считаются по времени владельца — Алматы, а не по UTC: день активности
# (user_activity), день отметки (checkin_days) и границы периодов.
ANALYTICS_TIMEZONE = "Asia/Almaty"
# Периоды аналитики: сегодня, последние 7 / 30 / 90 дней (сегодня включительно), всё время.
ANALYTICS_PERIODS: tuple[str, ...] = ("today", "7", "30", "90", "all")
DEFAULT_ANALYTICS_PERIOD = "30"
# Платформа, на которой пользователь появился впервые (users.signup_platform).
PLATFORMS: tuple[str, ...] = ("telegram", "web")
# Устройство по последнему запросу (users.device).
DEVICES: tuple[str, ...] = ("ios", "android", "desktop")

# «Активирован»: в первые ACTIVATION_WINDOW_DAYS дней (день прихода — первый) отметил
# привычку хотя бы в ACTIVATION_MIN_DAYS разных дней. Значения по умолчанию — админ
# меняет их в настройках панели (таблица app_config).
DEFAULT_ACTIVATION_WINDOW_DAYS = 3
DEFAULT_ACTIVATION_MIN_DAYS = 2
ACTIVATION_WINDOW_MAX_DAYS = 14
# «Живой пользователь»: отмечал привычки хотя бы LIVE_MIN_DAYS разных дней за последние
# LIVE_WINDOW_DAYS дней. Главный показатель здоровья приложения.
LIVE_WINDOW_DAYS = 7
LIVE_MIN_DAYS = 3
# «Ушёл»: не открывал приложение столько дней (бота не блокировал).
CHURN_DAYS = 14
# Напоминание «сработало», если привычку отметили в течение стольких часов после него.
REMINDER_EFFECT_HOURS = 2

# Источники трафика. Источник запоминается при первом приходе и больше не меняется;
# без метки — «напрямую» (direct). Метка в ссылке: у бота — /start src_<источник>_<подпись>,
# у веб-версии — ?src=<источник>_<подпись> (лендинг передаёт её дальше). Источник — латиница
# и цифры, подпись (номер поста) — ещё и «_», «-».
SOURCE_DIRECT = "direct"
# Готовые источники генератора ссылок и фильтра «Источник»; «other» в фильтре — любой
# другой источник, кроме перечисленных и «напрямую».
SOURCE_PRESETS: tuple[str, ...] = ("threads", "instagram", "friends")
SOURCE_OTHER = "other"
SOURCE_MAX_LENGTH = 16
SOURCE_TAG_MAX_LENGTH = 32
# Префикс параметра /start (и startapp Mini App) с источником.
SOURCE_START_PREFIX = "src_"
# Внутренние значения `src` веб-воронки (переход из Telegram в установку) — это не
# источник трафика.
INTERNAL_SOURCES: tuple[str, ...] = ("direct", "bot", "settings", "install", "unknown")

# Группа людей из аналитики (таблица segments): не больше стольких id.
SEGMENT_MAX_USERS = 20_000
SEGMENT_TITLE_MAX_LENGTH = 160
# Лента действий в профиле — страницами по столько записей.
TIMELINE_PAGE_SIZE = 50

# Распределение числа привычек у пользователей (старая сводка): 0, 1, …, «N и больше».
HABITS_DISTRIBUTION_MAX = 5

# Страницы списков пользователей и отзывов (бесконечная прокрутка).
ADMIN_PAGE_SIZE = 30
ADMIN_PAGE_SIZE_MAX = 100
# Самый длинный поисковый запрос по пользователям.
ADMIN_SEARCH_MAX_LENGTH = 100

# Пределы Bot API: текст сообщения и подпись к фото или видео.
MESSAGE_MAX_LENGTH = 4096
CAPTION_MAX_LENGTH = 1024

# Фильтры пользователей — в списке пользователей и в получателях рассылки (см.
# audience.py): признак → его значения; подписи — во фронтенде. Условия разных признаков
# складываются через «и». Строка фильтра — «признак:значение» через запятую, например
# "app:opened,habits:any"; пустая — все пользователи.
AUDIENCE_FILTERS: dict[str, tuple[str, ...]] = {
    "app": ("opened", "never"),  # открывали приложение / только запустили бота
    "habits": ("any", "none"),  # добавили хотя бы одну привычку / ни одной
    # Были в приложении за 1, 7, 30 дней / открывали его, но не заходят 3, 7, 14, 30 дней.
    "activity": (
        "1d", "7d", "30d", "inactive_3d", "inactive_7d", "inactive_14d", "inactive_30d",
    ),
    # Появились сегодня (по Алматы), за 24 часа, 7, 30, 90 дней.
    "joined": ("today", "1d", "7d", "30d", "90d"),
    "platform": PLATFORMS,  # пришли из Telegram / из веб-приложения
    "device": DEVICES,  # iPhone / Android / компьютер
    # Источник: готовые, «напрямую» и любой другой.
    "source": (*SOURCE_PRESETS, SOURCE_DIRECT, SOURCE_OTHER),
    "activated": ("yes", "no"),  # активирован (см. ACTIVATION_*) / нет
    # На каком шаге воронки застрял: запустил бота, но не открыл приложение; открыл, но
    # не добавил привычку; добавил, но ни разу не отметил; отмечал, но не активирован.
    "stuck": ("no_open", "no_habit", "no_checkin", "not_activated"),
    "uninstalled": ("likely",),  # вероятно удалил веб-приложение
    "reminders": ("any", "none"),  # есть напоминания (о привычке или «пора отметить») / нет
    "streak": ("3", "7", "14", "30"),  # текущая серия от N дней
    "language": LANGUAGES,  # язык интерфейса
    "reviews": ("any", "none"),  # оставляли отзыв / нет
    "bot": ("ok", "blocked"),  # заблокировали бота / нет
    "access": ("ok", "blocked"),  # заблокированы администратором / нет
    "test": ("yes", "no"),  # тестовый аккаунт (не входит в аналитику) / нет
}
# Группа людей из аналитики: признак «segment», значение — id группы (segments.id).
# Значения у него не перечислены — проверяется число.
SEGMENT_FILTER = "segment"
# Самая длинная строка фильтра в запросе (все признаки сразу — меньше 300 символов).
AUDIENCE_MAX_LENGTH = 300
# Признаки, которых нет у рассылки: заблокировавшие бота и заблокированные
# администратором рассылок не получают никогда.
BROADCAST_EXCLUDED_FILTERS: tuple[str, ...] = ("bot", "access")

# Кнопка под рассылкой (необязательная): открыть приложение, сразу экран отзыва или
# сразу форму новой привычки.
BROADCAST_BUTTONS: tuple[str, ...] = ("open_app", "review", "new_habit")
# Медиа рассылки: тип содержимого файла → вид сообщения и предел размера (пределы
# загрузки Bot API: фото — 10 МБ, видео — 50 МБ).
BROADCAST_PHOTO_TYPES: tuple[str, ...] = ("image/jpeg", "image/png", "image/webp")
BROADCAST_VIDEO_TYPES: tuple[str, ...] = ("video/mp4", "video/quicktime")
BROADCAST_PHOTO_MAX_BYTES = 10 * 1024 * 1024
BROADCAST_VIDEO_MAX_BYTES = 50 * 1024 * 1024
# Путь создания рассылки: только ему разрешено тело больше MAX_REQUEST_BODY_BYTES
# (файл видео и поля формы).
BROADCAST_UPLOAD_PATH = "/admin/broadcasts"
BROADCAST_UPLOAD_MAX_BYTES = BROADCAST_VIDEO_MAX_BYTES + 64 * 1024

# --------------------------------------------------------------------------- #
#  Web app (PWA) funnel analytics
# --------------------------------------------------------------------------- #

# Funnel steps in order (spec §10). The landing and the app send most of them
# (`POST /events`); the server adds first_habit_created, first_checkin and
# account_linked itself. Unknown names are rejected.
FUNNEL_EVENTS: tuple[str, ...] = (
    "landing_view",
    "desktop_qr_view",
    "choose_telegram",
    "choose_install",
    "inapp_escape_attempt",
    "inapp_hint_shown",
    "install_screen_view",
    "install_prompt_shown",
    "install_prompt_accepted",
    "install_prompt_dismissed",
    "app_installed",
    "first_standalone_launch",
    "first_habit_created",
    "first_checkin",
    "push_permission_granted",
    "push_permission_denied",
    "account_linked",
)
# «Открыл приложение» (POST /events, событие app_open) — откуда: кнопка меню бота,
# приветствие, напоминание, рассылка, push-уведомление, предложение установить, прямая
# ссылка на Mini App, иконка веб-приложения. Пишется в ленту действий, не в воронку.
APP_OPEN_EVENT = "app_open"
APP_OPEN_SOURCES: tuple[str, ...] = (
    "menu", "welcome", "reminder", "broadcast", "push", "install_offer", "link", "icon",
)
# Accepted values of the event context fields (anything else is stored as null).
EVENT_PLATFORMS: tuple[str, ...] = ("ios", "android", "desktop")
EVENT_CONTEXTS: tuple[str, ...] = ("in_app", "browser", "standalone", "telegram")
# Largest `props` of an event, serialized (bytes).
EVENT_PROPS_MAX_BYTES = 2048
# Rate limits without an account (burst, per second): new guest accounts per address
# (a phone creates one on its first launch) and funnel events per device.
GUEST_RATE_LIMIT: tuple[int, float] = (10, 0.1)
EVENT_RATE_LIMIT: tuple[int, float] = (60, 2.0)
