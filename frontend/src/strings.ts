/**
 * Вся пользовательская копия интерфейса в одном месте — на русском и английском.
 * Ни одной строки-сообщения прямо в компонентах: они берут строки текущего языка
 * через useStrings() (preferences.ts). Длинные тексты политики конфиденциальности и
 * условий использования — в legal.ts.
 */

import type { ApiErrorCode } from "./api/client";
import { LEGAL_EN, LEGAL_RU } from "./legal";
import type { Period } from "./types/habit";
import type { Language } from "./types/settings";

/** Названия языков в меню выбора — каждое на своём языке. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  ru: "Русский",
  en: "English",
};

function ruTimes(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  return ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "раза" : "раз";
}

/** «1 привычка», «2 привычки», «5 привычек». */
function ruHabits(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return `${count} привычка`;
  }
  return `${count} ${ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "привычки" : "привычек"}`;
}

/** «1 папка», «2 папки», «5 папок». */
function ruFolders(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return `${count} папка`;
  }
  return `${count} ${ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "папки" : "папок"}`;
}

function ruDays(count: number): string {
  const tens = count % 100;
  const ones = count % 10;
  if (ones === 1 && tens !== 11) {
    return "день";
  }
  return ones >= 2 && ones <= 4 && !(tens >= 12 && tens <= 14) ? "дня" : "дней";
}

const RU_PER: Record<Period, string> = { week: "в неделю", month: "в месяц", year: "в год" };
const EN_PER: Record<Period, string> = { week: "a week", month: "a month", year: "a year" };

const RU = {
  screenTitle: "Привычки",
  // Приглушённый подзаголовок второй секции: привычки, не запланированные на день
  // отметки (сегодня, а в режиме «Отмечать за вчера» — вчера).
  otherSubheadingToday: "Не запланированы на сегодня",
  otherSubheadingYesterday: "Не запланированы на вчера",
  frozenSubheading: "Заморожены",

  emptyTitle: "Нет привычек",
  emptyDescription: "Создайте новую привычку для отслеживания прогресса",
  // Папка без привычек (вкладка над списком).
  folderEmptyTitle: "Папка пуста",
  folderEmptyDescription: "Добавьте в неё привычки в настройках: Настройки → Папки",

  errorTitle: "Что-то пошло не так",
  errorRetry: "Повторить",
  habitsLoadFailed: "Не удалось загрузить привычки",
  crashDescription: "Приложение столкнулось с ошибкой. Перезапустите его, данные не пострадали.",
  crashReload: "Перезапустить",

  outsideTitle: "Откройте в Telegram",
  outsideDescription:
    "Это мини-приложение работает внутри Telegram. Откройте его кнопкой в боте Knot.",

  // --- Нижняя навигация ---
  tabHabits: "Привычки",
  tabSettings: "Настройки",
  addHabit: "Добавить привычку",

  // --- Настройки ---
  settingsTitle: "Настройки",
  settingsLoading: "Загрузка настроек…",
  // Админ-панель ещё загружается (обычно она загружена заранее — см. App.tsx).
  adminLoading: "Загрузка…",
  settingsLoadFailed: "Не удалось загрузить настройки",
  settingsSaveFailed: "Не удалось сохранить настройку",
  settingsTimezone: "Часовой пояс",
  settingsTimezoneNone: "Не выбран",
  settingsLanguage: "Язык",
  settingsTheme: "Тема",
  themeNames: { light: "Светлая", dark: "Тёмная", system: "Системная" },
  settingsMarkYesterday: "Отмечать за вчера",
  settingsMarkYesterdayFooter:
    "Отметки ставятся за вчерашний день, а не за сегодняшний. Удобно, если вы подводите итоги дня на следующее утро.",
  settingsReview: "Написать отзыв",
  // «Вид сетки»: ряд настроек и его экран с картинками.
  settingsGridLayout: "Вид сетки",
  gridLayoutTitle: "Вид сетки",
  gridLayoutNames: { rolling: "Со сдвигом", fixed: "По порядку", calendar: "Календарь" },
  gridLayoutFooters: {
    rolling:
      "Сегодняшний день всегда в правом нижнем кружке, а с каждым новым днём сетка сдвигается влево.",
    fixed:
      "Сетка заполняется день за днём с левого верхнего кружка, а когда кружки закончатся, начинается заново.",
    calendar:
      "Сетка разбита по месяцам и дням недели: у каждой даты своё место, как в календаре.",
  },
  // «Папки»: ряд настроек, список папок, форма папки и выбор привычек в неё.
  settingsFolders: "Папки",
  foldersTitle: "Папки",
  // «Архив»: ряд настроек и экран архивных привычек.
  settingsArchive: "Архив",
  // «Экспорт данных» / «Импорт данных» (data/userData.ts).
  settingsExport: "Экспорт данных",
  settingsImport: "Импорт данных",
  settingsDataFooter:
    "Сохраните привычки, отметки, заметки, папки и настройки в файл. На другом аккаунте или устройстве загрузите его через «Импорт данных», и привычки добавятся к текущим.",
  exportShareTitle: "Мои данные Knot",
  exportSentTitle: "Файл в чате с ботом",
  exportSentMessage:
    "Сохраните его или перешлите себе на другой аккаунт. Загрузить данные — Настройки → «Импорт данных».",
  exportFailed: "Не удалось выгрузить данные. Попробуйте ещё раз.",
  importConfirmTitle: "Импортировать данные?",
  importConfirmMessage: (habits: number, folders: number) =>
    `Добавится ${ruHabits(habits)}${folders > 0 ? ` и ${ruFolders(folders)}` : ""} — текущие останутся. Настройки заменятся настройками из файла.`,
  importConfirm: "Импортировать",
  importCancel: "Отмена",
  importDoneTitle: "Данные загружены",
  importDoneMessage: (habits: number, folders: number) =>
    `Добавлено: ${ruHabits(habits)}${folders > 0 ? `, ${ruFolders(folders)}` : ""}.`,
  importFailed: "Не удалось импортировать данные. Попробуйте ещё раз.",
  importBadFile: "Этот файл не подходит. Выберите файл, сохранённый через «Экспорт данных».",
  archiveTitle: "Архив",
  archiveEmptyTitle: "В архиве пусто",
  archiveEmptyDescription:
    "Сюда попадают привычки, которые вы архивировали в их настройках: они работают как обычно, но не видны в списке",
  foldersDescription:
    "Вы можете создать папки с нужными привычками и переключаться между ними.",
  foldersHeading: "Папки",
  foldersEdit: "Изменить",
  foldersDone: "Готово",
  foldersCreate: "Создать папку",
  foldersAll: "Все привычки",
  foldersFooter: "Чтобы удалить папку или изменить порядок, нажмите «Изменить».",
  foldersLimitFooter: "Больше папок создать нельзя.",
  folderRemove: (name: string) => `Удалить папку «${name}»`,
  folderReorder: (name: string) => `Переместить «${name}»`,
  folderCreateTitle: "Новая папка",
  folderEditTitle: "Папка",
  folderNameHeading: "Название папки",
  folderNamePlaceholder: "Название папки",
  folderHabitsHeading: "Привычки в папке",
  folderAddHabits: "Добавить привычки",
  folderHabitsFooter: "Выберите типы привычек или сами привычки, которые нужно показывать в этой папке.",
  folderCreateSubmit: "Создать папку",
  folderEditSubmit: "Сохранить",
  folderSaveFailed: "Не удалось сохранить папку",
  folderDelete: "Удалить папку",
  folderDeleteTitle: "Удалить папку",
  folderDeleteMessage: (name: string) =>
    `Папка «${name}» будет удалена. Привычки из неё останутся в списке.`,
  folderDeleteConfirm: "Удалить",
  folderDeleteCancel: "Отменить",
  folderPickerTitle: "Привычки в папке",
  folderPickerSearch: "Поиск привычек",
  folderPickerDone: "Готово",
  folderPickerEmpty: "Привычек пока нет",
  folderPickerTypesHeading: "Типы привычек",
  folderPickerHabitsHeading: "Привычки",
  folderHabitTypeNames: {
    group: "Групповые привычки",
    personal: "Личные привычки",
    frozen: "Замороженные",
    unscheduled: "Не на сегодня",
  },
  folderHabitCount: (count: number) => `${count}`,
  foldersRecommendedHeading: "Рекомендуемые папки",
  foldersRecommendedAdd: "Добавить",
  folderKindNames: { unfinished: "Невыполненные", today: "На сегодня" },
  folderKindDescriptions: {
    unfinished: "Ещё не выполненные сегодня",
    today: "Все привычки на сегодня",
  },
  folderKindFooter: {
    unfinished:
      "Привычки попадают в эту папку сами: запланированные на сегодня и ещё не выполненные.",
    today: "Привычки попадают в эту папку сами: все запланированные на сегодня.",
  },
  folderKindEmptyTitle: { unfinished: "Всё выполнено", today: "На сегодня ничего нет" },
  folderKindEmptyDescription: {
    unfinished: "Все привычки на сегодня отмечены",
    today: "Сегодня ни одна привычка не запланирована",
  },
  foldersSwipe: "Переключение свайпом",
  foldersSwipeFooter:
    "Свайп влево или вправо по списку привычек открывает соседнюю папку.",
  // Напоминание «Пора отметить привычки»: ряд настроек и его экран.
  settingsCheckinReminder: "Напоминание",
  settingsCheckinReminderOff: "Выкл.",
  checkinReminderTitle: "Напоминание",
  checkinReminderToggle: "Напоминать отмечать",
  checkinReminderTime: "Время",
  // Вход в админ-панель — виден только администраторам.
  settingsAdminPanel: "Админ-панель",

  // --- Web app (PWA): install, account, notifications ---
  settingsInstall: "Добавить на рабочий стол",
  settingsAccount: "Аккаунт",
  settingsAccountGuest: "Не привязан",
  settingsAccountOffline: "Нет связи",
  settingsAccountFooter:
    "Привяжите Telegram, чтобы не потерять привычки: они будут и здесь, и в Telegram-боте, и на новом телефоне.",
  settingsAttention: "Требует внимания",
  webBack: "Назад",
  webStartFailedTitle: "Не удалось запустить",
  webStartFailedDescription: "Проверьте интернет и попробуйте ещё раз.",
  accountTitle: "Аккаунт",
  accountFooter: "Те же привычки будут в Telegram-боте и на любом телефоне, где вы войдёте через Telegram.",
  accountLogout: "Выйти из аккаунта",
  accountLogoutTitle: "Выйти из аккаунта?",
  accountLogoutMessage: "Привычки останутся в вашем Telegram. Войдите снова, и они вернутся.",
  accountLogoutConfirm: "Выйти",
  accountLogoutCancel: "Отмена",
  accountActionFailed: "Что-то пошло не так. Попробуйте ещё раз чуть позже.",
  accountLogoutFailed: "Не удалось выйти",
  accountLogoutUnsent: "Не все изменения успели сохраниться. Проверьте интернет и попробуйте ещё раз.",
  handoffMergeTitle: "Войти в аккаунт по ссылке?",
  handoffMergeMessage:
    "Привычки с этого телефона перейдут в аккаунт Telegram, из которого открыта ссылка. Если ссылку вам прислал кто-то другой, нажмите «Отмена».",
  handoffMergeConfirm: "Войти",
  handoffMergeCancel: "Отмена",
  accountLogoutEverywhere: "Выйти на всех устройствах",
  accountLogoutEverywhereTitle: "Выйти на всех устройствах?",
  accountLogoutEverywhereMessage:
    "Веб-приложение выйдет из аккаунта на всех устройствах, где вы входили.",
  // Web app: this device stays logged in.
  accountLogoutOthersMessage:
    "Вы выйдете из аккаунта на всех других устройствах. На этом устройстве вход сохранится.",
  accountLinkFailed: "Не удалось привязать Telegram",
  accountCreated: "Дата регистрации",
  accountHabits: "Привычек",
  accountCheckins: "Всего отметок",
  accountBestStreak: "Лучшая серия",
  accountDays: (count: number) => {
    const tens = count % 100;
    const ones = count % 10;
    const word =
      tens >= 11 && tens <= 14 ? "дней" : ones === 1 ? "день" : ones >= 2 && ones <= 4 ? "дня" : "дней";
    return `${count} ${word}`;
  },
  accountDevices: "Устройств с входом",
  accountDevicesFooterWeb: "Телефоны и компьютеры, где выполнен вход в веб-приложение, включая этот.",
  accountDevicesFooterTelegram: "Телефоны и компьютеры, где выполнен вход в веб-приложение.",
  notificationsRow: "Уведомления",
  notificationsDenied:
    "Уведомления запрещены. Разрешите их в настройках телефона: «Настройки» → «Уведомления» → Knot.",
  notificationsDeniedTitle: "Уведомления запрещены",
  notificationsDeniedHint:
    "Телефон больше не спрашивает разрешение. Включите их сами: «Настройки» → «Уведомления» → Knot.",
  notificationsOnFailed: "Не удалось включить уведомления",
  notificationsOffFailed: "Не удалось выключить уведомления",
  notificationsOffTitle: "Выключить уведомления?",
  notificationsOffMessage: "Напоминания о привычках перестанут приходить на этот телефон.",
  notificationsOffConfirm: "Выключить",
  notificationsOffCancel: "Отмена",
  telegramNotificationsOffMessage:
    "Бот перестанет присылать в Telegram напоминания о привычках и новости Knot.",
  installTitle: "Приложение на телефоне",
  installDescription: "Установка откроется в браузере. Привычки останутся те же.",
  installOpen: "Открыть в браузере",
  installFailed: "Не удалось подготовить ссылку. Попробуйте ещё раз.",

  // --- Экран «Написать отзыв» ---
  reviewTitle: "Написать отзыв",
  reviewDescription: "Расскажите, что вам нравится и что можно сделать лучше.",
  reviewPlaceholder: "Ваш отзыв",
  reviewSend: "Отправить",
  // История своих отзывов под полем и ответ администратора в ней.
  reviewHistoryHeading: "Ваши отзывы",
  reviewReplyLabel: "Ответ",
  reviewFailed: "Не удалось отправить отзыв. Попробуйте ещё раз.",

  // --- Выбор часового пояса ---
  timezoneTitle: "Часовой пояс",
  timezoneSearch: "Поиск",
  timezoneSearchClear: "Очистить",
  timezoneLoading: "Загрузка часовых поясов…",
  timezonesLoadFailed: "Не удалось загрузить часовые пояса",
  timezoneNothingFound: "Ничего не найдено",

  // --- Экран привычки ---
  openHabit: "Открыть привычку",
  // Число дней совпадает с HISTORY_DAYS (constants.ts).
  habitHistoryHeading: "Последние 364 дня",
  // То же в «Виде сетки» «Календарь»: месяцы, а не дни (HISTORY_CALENDAR_ROWS × 4).
  habitHistoryCalendarHeading: "Последние 8 месяцев",
  habitHistoryLabel: "История выполнения",
  habitMainHeading: "Основное",
  statCurrentStreak: "Текущая серия",
  statBestStreak: "Лучшая серия",
  statTotalDone: "Всего выполнено",
  statTotalTime: "Всего времени",
  statTotalTimes: "Всего повторений",
  statStreakGoal: "Цель серии",
  goalDaily: "Ежедневно",
  goalEveryOtherDay: "Через день",
  goalMonthly: "Каждый месяц",
  // «Гибкий график»: серии — в периодах («5 нед.»), выполнено — в днях (без «из скольких»),
  // вместо «Цели серии» — сколько сделано в текущем периоде («2 / 3»). У года вместо серий
  // — сколько раз нужно, чтобы успеть к 31 декабря, и прогноз: к какому дню цель будет
  // набрана в нынешнем темпе (не успевает — сколько выйдет к концу года).
  streakInPeriods: {
    week: (count: number) => `${count} нед.`,
    month: (count: number) => `${count} мес.`,
    year: (count: number) => `${count}`,
  } as Record<Period, (count: number) => string>,
  statDaysDone: "Дней выполнено",
  statThisPeriod: {
    week: "На этой неделе",
    month: "В этом месяце",
    year: "В этом году",
  } as Record<Period, string>,
  statNeedPerWeek: "Нужно в неделю",
  statTooLate: "Уже не успеть",
  statGoalBy: "Будет выполнено",
  statForecast: "Прогноз на год",
  statForecastNone: "Прогноз",
  statGoalReached: "Цель выполнена",
  // Календарь экрана привычки (HabitCalendar.tsx).
  calendarHeading: "Календарь",
  // Те же разделы у групповой привычки — про всю группу (у участника — без «группы»).
  groupHistoryHeading: "Последние 364 дня группы",
  groupHistoryCalendarHeading: "Последние 8 месяцев группы",
  groupMainHeading: "Основное группы",
  groupCalendarHeading: "Календарь группы",
  calendarPrevMonth: "Предыдущий месяц",
  calendarNextMonth: "Следующий месяц",
  monthNames: [
    "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
    "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
  ],
  // Подписи месяцев над сеткой «Календарь».
  monthShortNames: [
    "Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
  ],
  // «16 октября» — для скринридеров.
  monthNamesOf: [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ],
  calendarDayStates: {
    done: "выполнено",
    partial: "выполнено не полностью",
    missed: "не выполнено",
    frozen: "заморожено",
    rest: "не запланировано",
    off: "нет отметки",
    unknown: "нет данных",
  },
  habitSettingsHeading: "Настройки",
  editHabit: "Редактировать привычку",
  freezeHabit: "Заморозить привычку",
  unfreezeHabit: "Разморозить привычку",
  // Бот сам отмечает привычку: без напоминания — с началом дня, с напоминанием — сразу
  // после него.
  autoMarkHabit: "Автоотметка",
  freezeDialogTitle: "Заморозить привычку",
  freezeDialogMessage:
    "Текущая серия сохранится: пропуски не будут её прерывать, а дни заморозки отметятся в истории снежинками. Отмечать привычку и получать напоминания можно будет после разморозки.",
  freezeDialogConfirm: "Заморозить",
  freezeDialogCancel: "Отменить",
  // Архив: ряд в настройках привычки и подтверждение.
  archiveHabit: "Архивировать привычку",
  unarchiveHabit: "Разархивировать привычку",
  archiveDialogTitle: "Архивировать привычку",
  archiveDialogMessage:
    "Привычка пропадёт из списка и папок и будет в Настройках → Архив. Отмечать её и смотреть статистику можно и там, серия сохранится, а напоминания приходить не будут.",
  archiveDialogConfirm: "Архивировать",
  archiveDialogCancel: "Отменить",
  deleteHabit: "Удалить привычку",
  deleteDialogTitle: "Удалить привычку",
  deleteDialogMessage: "Вы уверены, что хотите навсегда удалить эту привычку?",
  deleteDialogCancel: "Отменить",
  deleteDialogConfirm: "Удалить",
  deleteFailed: "Не удалось удалить привычку. Попробуйте ещё раз.",

  // --- Групповая привычка (экран привычки, страница участника) ---
  groupMembersHeading: "Участники",
  groupMe: "Вы",
  groupOwner: "владелец",
  groupMemberDone: "выполнено",
  groupMemberFrozen: "заморожено",
  // Сколько раз участник выполнил привычку «несколько раз в день» (для скринридеров).
  groupMemberCount: (count: number, total: number) => `выполнено ${count} из ${total}`,
  groupAddMember: "Добавить участника",
  inviteShareText: (name: string) => `Присоединяйся к привычке «${name}» в Knot`,
  inviteCopiedTitle: "Ссылка скопирована",
  inviteCopiedMessage: "Отправьте её друзьям, с которыми хотите выполнять привычку.",
  groupNotify: "Отметки участников",
  // «Чёрный список» (владелец): исключённые по ссылке не вступят.
  blockedTitle: "Чёрный список",
  blockedEmptyTitle: "Список пуст",
  blockedEmptyDescription: "Здесь будут исключённые участники",
  blockedFooter:
    "Они не могут вступить по ссылке. Нажмите на человека, чтобы убрать его из списка.",
  unbanDialogTitle: "Убрать из чёрного списка",
  unbanDialogMessage: (name: string) => `${name} снова сможет вступить по ссылке-приглашению.`,
  unbanDialogConfirm: "Убрать",
  resetInvite: "Сбросить ссылку",
  resetInviteDialogTitle: "Сбросить ссылку",
  resetInviteDialogMessage:
    "Старая ссылка перестанет работать. Участники останутся в привычке.",
  resetInviteDialogConfirm: "Сбросить",
  leaveGroup: "Выйти из привычки",
  leaveGroupDialogTitle: "Выйти из привычки",
  leaveGroupDialogMessage:
    "Привычка останется у вас обычной со всеми отметками. Вернуться можно по ссылке-приглашению.",
  // Выходит владелец: владельцем станет тот, кто вступил раньше всех.
  leaveGroupOwnerDialogMessage:
    "Привычка останется у вас обычной со всеми отметками. Владельцем станет участник, который вступил раньше всех.",
  // В привычке больше никого: после выхода группы не будет.
  leaveGroupAloneDialogMessage:
    "Привычка станет обычной, отметки сохранятся. Ссылка-приглашение перестанет работать.",
  leaveGroupDialogConfirm: "Выйти",
  kickDialogTitle: (name: string) => `Исключить ${name}`,
  kickDialogMessage:
    "Привычка останется у участника обычной. Вернуться по ссылке он не сможет, пока вы не уберёте его из чёрного списка.",
  kickDialogConfirm: "Исключить",
  // Страница участника (владелец, не себя).
  kickMember: "Исключить участника",
  groupDialogCancel: "Отменить",
  // Кнопка окна-сообщения в Telegram (в браузере её подписывает сам браузер — «OK»).
  alertOk: "Понятно",
  groupActionFailed: "Не удалось выполнить действие",
  groupLoginTitle: "Войдите через Telegram",
  groupLoginMessage: "Групповые привычки доступны после входа через Telegram.",
  groupLoginConfirm: "Войти",


  // --- Кнопка отметки (подписи для скринридеров) ---
  checkMark: (name: string) => `Отметить выполнено: ${name}`,
  checkUnmark: (name: string) => `Снять отметку: ${name}`,
  checkDone: (name: string) => `${name}: выполнено`,
  checkNotScheduled: (name: string) => `${name}: не запланировано`,
  checkFrozen: (name: string) => `${name}: заморожено`,
  // Привычка «несколько раз в день»: нажатие считает ещё один раз.
  checkCount: (name: string, count: number, total: number) =>
    `Отметить ещё раз: ${name} (${count} из ${total})`,
  // «Сверх плана»: нажатие — ещё раз, удержание — окно счёта.
  checkCountUp: (name: string, count: number, total: number) =>
    `Отметить ещё раз: ${name} (сделано ${count}, цель ${total}). Удерживайте, чтобы открыть счёт`,
  // «Цель по времени»: кнопка ▶ запускает таймер, ❚❚ — останавливает.
  checkTimerStart: (name: string, done: string, goal: string) =>
    `Запустить таймер: ${name} (${done} из ${goal})`,
  checkTimerStop: (name: string, done: string) => `Остановить таймер: ${name} (${done})`,

  // --- Время «Цели по времени»: «1 ч 30 мин», «45 мин», «2 ч», «0 мин» ---
  durationHours: (hours: number) => `${hours} ч`,
  durationMinutes: (minutes: number) => `${minutes} мин`,

  // --- Таймер: полоска над вкладками и экран на весь экран ---
  timerOpen: (name: string) => `Открыть таймер: ${name}`,
  timerPause: "Пауза",
  timerResume: "Продолжить",
  timerStart: "Старт",
  timerEditTime: "Изменить время за день",
  timerLeft: (left: string) => `Осталось ${left}`,
  timerHabitRow: "Привычка",
  streakDaysValue: (count: number) => `${count} ${ruDays(count)}`,
  timerGoal: (goal: string) => `Цель — ${goal}`,
  timerGoalDone: "Цель выполнена",

  // --- Окно счёта «Сверх плана» (удержание кнопки отметки) ---
  countSheetToday: "Сегодня",
  countSheetYesterday: "Вчера",
  countSheetClose: "Закрыть",
  countSheetLess: "Меньше на один",
  countSheetMore: "Больше на один",
  countSheetValue: "Сколько раз сделано",
  countSheetAdd: (step: number) => `Прибавить ${step}`,
  countSheetReset: "Сбросить",
  countSheetFill: "Заполнить день",
  // То же у «Цели по времени»: шаги — минуты.
  countSheetLessMinute: "Меньше на минуту",
  countSheetMoreMinute: "Больше на минуту",
  countSheetMinutes: "Сколько минут",
  countSheetAddMinutes: (minutes: number) => `Прибавить ${minutes} мин`,

  // --- Окно дня (нажатие на день в календаре): отметка за этот день и заметка ---
  // «Пн, 14 октября».
  daySheetDate: (weekday: string, day: number, monthOf: string) => `${weekday}, ${day} ${monthOf}`,
  daySheetMark: "Отметить выполненной",
  daySheetUnmark: "Снять отметку",
  daySheetNote: "Заметка к дню",
  // Подпись окна для скринридеров; свайп влево-вправо — соседний день.
  daySheetLabel: (name: string, date: string) => `${name}, ${date}. Свайп — соседний день`,
  // Плашка после серии быстрых нажатий: «Вода: +12» — длинное название сокращается, число
  // видно всегда.
  undoTapsSuffix: (taps: number) => `: +${taps}`,
  undo: "Отменить",

  // --- Создание и редактирование привычки ---
  formCreateTitle: "Новая привычка",
  formEditTitle: "Редактирование",
  formCreateSubmit: "Добавить привычку",
  formCreateFailed: "Не удалось создать привычку",
  formEditFailed: "Не удалось сохранить привычку",
  formInfoHeading: "Информация",
  formNamePlaceholder: "Название",
  formDescriptionPlaceholder: "Описание (необязательно)",
  formFrequencyHeading: "Частота",
  formRepeat: "Повтор",
  // Повтор по дням недели: подпись — выбранные дни (weekdayLabel.ts); все — «Каждый день».
  formDaily: "Каждый день",
  formEveryOtherDay: "Через день",
  formMonthly: "Каждый месяц",
  // «Гибкий график»: N дней за неделю / месяц / год, в любые дни («3 дня в неделю»).
  formFlexible: "Гибкий график",
  formPeriod: "Период",
  periodNames: { week: "Неделя", month: "Месяц", year: "Год" } as Record<Period, string>,
  formPeriodTimes: (count: number, period: Period) =>
    `${count} ${ruDays(count)} ${RU_PER[period]}`,
  formPeriodLess: "Меньше дней за период",
  formPeriodMore: "Больше дней за период",
  // Год: число вводится с клавиатуры.
  formYearTimes: "Дней в год",
  // Первый день привычки «через день» / «каждый месяц»: «Сегодня», «Завтра» или дата.
  formStartDate: "Начало",
  dateToday: "Сегодня",
  dateTomorrow: "Завтра",
  // Цель: сколько раз в день выполнить привычку («1 раз в день», «3 раза в день»,
  // «5 раз в день»), степпер −/+.
  formGoalHeading: "Цель",
  // «По времени» — вместо галочки таймер ▶, цель — время в день.
  formGoalType: "Тип цели",
  formGoalByCount: "По количеству",
  formGoalByTime: "По времени",
  formTimesPerDay: (count: number) => `${count} ${ruTimes(count)} в день`,
  formTimesLess: "Меньше раз в день",
  formTimesMore: "Больше раз в день",
  // «Цель по времени»: «45 мин в день», степпер −/+ по 5 минут.
  formGoalTime: (time: string) => `${time} в день`,
  formTimeLess: "Меньше времени",
  formTimeMore: "Больше времени",
  formReminderHeading: "Напоминание",
  formReminderToggle: "Напоминать",
  formReminderTime: "Время",
  formReminderAdd: "Добавить напоминание",
  formReminderRemove: (time: string) => `Удалить напоминание ${time}`,
  formThemeHeading: "Тема",
  formAdvanced: "Дополнительно",
  formAutoMarkHeading: "Автоотметка",
  formAutoMarkToggle: "Отмечать автоматически",
  formAutoMarkFooter:
    "Привычка отмечается сама: без напоминания в начале дня, а с напоминанием сразу после того, как оно придёт.",
  formOvertimeToggle: "Можно больше цели",
  // «Групповая привычка» — пока в привычке никого, кроме вас; подпись — что это и как
  // пригласить.
  formSharedHeading: "Групповая привычка (Beta)",
  formSharedToggle: "Вести с друзьями",
  formSharedFooter:
    "Выполняйте привычку вместе с друзьями. После сохранения пригласите их кнопкой «Добавить участника» на экране привычки. День засчитывается, только когда его выполнили все.",

  // Дни недели (ключи — WEEKDAYS в constants.ts): в выборе дней, в цели серии
  // («Пн, Ср, Пт») и для скринридеров.
  // Набор дней недели (weekdayLabel.ts): «Будние дни», «Выходные», «Пн, Ср и Пт»; ни
  // одного — «Никогда».
  daysWorkdays: "Будние дни",
  daysWeekends: "Выходные",
  daysNever: "Никогда",
  daysList: (days: string[]) =>
    days.length > 1 ? `${days.slice(0, -1).join(", ")} и ${days[days.length - 1]}` : days.join(""),
  weekdays: {
    mon: { short: "Пн", abbr: "Пн", full: "Понедельник" },
    tue: { short: "Вт", abbr: "Вт", full: "Вторник" },
    wed: { short: "Ср", abbr: "Ср", full: "Среда" },
    thu: { short: "Чт", abbr: "Чт", full: "Четверг" },
    fri: { short: "Пт", abbr: "Пт", full: "Пятница" },
    sat: { short: "Сб", abbr: "Сб", full: "Суббота" },
    sun: { short: "Вс", abbr: "Вс", full: "Воскресенье" },
  },
  // Подписи цветов для скринридеров (ключи — HABIT_COLORS в constants.ts).
  colorNames: {
    blue: "Синий",
    lightblue: "Голубой",
    teal: "Бирюзовый",
    green: "Зелёный",
    yellow: "Жёлтый",
    orange: "Оранжевый",
    red: "Красный",
    pink: "Розовый",
    purple: "Фиолетовый",
    indigo: "Индиго",
    brown: "Коричневый",
    graphite: "Графитовый",
  },
  colorCustom: "Свой цвет",

  // Ошибки API по кодам (см. errors.ts). Кода нет в списке — показывается текст,
  // который подходит к действию («Не удалось сохранить привычку» и т.п.).
  apiErrors: {
    network_error: "Нет подключения к интернету. Проверьте связь и попробуйте ещё раз.",
    invalid_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    missing_init_data: "Не удалось подтвердить личность Telegram. Откройте приложение заново.",
    task_not_found: "Привычка не найдена. Возможно, её уже удалили",
    habit_limit: "Достигнут предел числа привычек. Удалите ненужную, чтобы добавить новую",
    folder_limit: "Достигнут предел числа папок. Удалите ненужную, чтобы добавить новую",
    folder_not_found: "Папка не найдена. Возможно, её уже удалили",
    invalid_folder_name: "Введите название папки",
    rate_limited: "Слишком много действий подряд. Подождите пару секунд",
    export_chat_unavailable: "Откройте чат с ботом и нажмите «Старт» — файл придёт туда.",
    invalid_import_file: "Этот файл не подходит. Выберите файл, сохранённый через «Экспорт данных».",
    invalid_name: "Введите название привычки",
    invalid_description: "Описание слишком длинное",
    invalid_days: "Выберите хотя бы один день недели",
    invalid_start_date: "Выберите дату начала",
    invalid_period: "Выберите период",
    invalid_period_times: "Столько раз за период не получится",
    invalid_note: "Заметка слишком длинная",
    invalid_reminder_time: "Укажите время напоминания",
    invalid_timezone: "Не удалось распознать часовой пояс",
    invalid_review: "Напишите отзыв",
    review_limit: "Сегодня вы уже оставили много отзывов. Попробуйте завтра",
    user_blocked: "Доступ к приложению ограничен",
    invalid_session: "Сессия устарела. Откройте приложение заново",
    handoff_invalid: "Ссылка устарела. Откройте её заново из Telegram",
    stale_init_data: "Закройте и откройте приложение заново: ссылка выдаётся только сразу после открытия",
    login_expired: "Вход устарел. Попробуйте ещё раз",
    account_conflict: "Этот вход уже привязан к другому аккаунту Telegram",
    telegram_already_linked: "К аккаунту уже привязан другой Telegram",
    invalid_telegram_login: "Telegram не подтвердил вход. Попробуйте ещё раз.",
    push_unavailable: "Уведомления пока не настроены на сервере",
    push_not_delivered: "Не удалось доставить уведомление. Разрешите уведомления для Knot.",
    group_needs_telegram: "Групповые привычки доступны после входа через Telegram",
    group_not_found: "Групповая привычка не найдена. Возможно, вас уже исключили",
    group_full: "В привычке уже максимум участников",
    group_not_owner: "Это может только владелец привычки",
    group_member_not_found: "Участник уже вышел из привычки",
    group_has_members: "В привычке есть другие участники, поэтому из неё можно только выйти",
  } as Partial<Record<ApiErrorCode, string>>,

  // --- Документы ---
  privacyPolicy: LEGAL_RU.privacy,
  termsOfUse: LEGAL_RU.terms,
};

export type Strings = typeof RU;

const EN: Strings = {
  screenTitle: "Habits",
  otherSubheadingToday: "Not scheduled for today",
  otherSubheadingYesterday: "Not scheduled for yesterday",
  frozenSubheading: "Frozen",

  emptyTitle: "No habits",
  emptyDescription: "Create a new habit to track your progress",
  folderEmptyTitle: "Folder Is Empty",
  folderEmptyDescription: "Add habits to it in Settings → Folders",

  errorTitle: "Something went wrong",
  errorRetry: "Try Again",
  habitsLoadFailed: "Couldn’t load your habits",
  crashDescription: "The app ran into an error. Restart it, your data is safe.",
  crashReload: "Restart",

  outsideTitle: "Open in Telegram",
  outsideDescription:
    "This mini app runs inside Telegram. Open it with the button in the Knot chat.",

  tabHabits: "Habits",
  tabSettings: "Settings",
  addHabit: "Add Habit",

  settingsTitle: "Settings",
  settingsLoading: "Loading settings…",
  adminLoading: "Loading…",
  settingsLoadFailed: "Couldn’t load settings",
  settingsSaveFailed: "Couldn’t save the setting",
  settingsTimezone: "Time Zone",
  settingsTimezoneNone: "Not Set",
  settingsLanguage: "Language",
  settingsTheme: "Theme",
  themeNames: { light: "Light", dark: "Dark", system: "System" },
  settingsMarkYesterday: "Mark as Yesterday",
  settingsMarkYesterdayFooter:
    "Habits are marked for the previous day instead of today. Handy if you review your day the next morning.",
  settingsReview: "Write a Review",
  settingsGridLayout: "Grid Style",
  gridLayoutTitle: "Grid Style",
  gridLayoutNames: { rolling: "Rolling", fixed: "In Order", calendar: "Calendar" },
  gridLayoutFooters: {
    rolling: "Today is always the bottom-right dot, and the grid shifts left with each new day.",
    fixed:
      "The grid fills day by day from the top-left dot, and starts over once it’s full.",
    calendar: "The grid is split into months and weekdays, so every date has its own spot, like in a calendar.",
  },
  settingsFolders: "Folders",
  foldersTitle: "Folders",
  settingsArchive: "Archive",
  settingsExport: "Export Data",
  settingsImport: "Import Data",
  settingsDataFooter:
    "Save your habits, check-ins, notes, folders and settings to a file. Load it on another account or device with “Import Data”, and the habits are added to your current ones.",
  exportShareTitle: "My Knot data",
  exportSentTitle: "File Sent to the Bot Chat",
  exportSentMessage:
    "Save it or forward it to your other account. To load the data: Settings → “Import Data”.",
  exportFailed: "Couldn’t export your data. Please try again.",
  importConfirmTitle: "Import Data?",
  importConfirmMessage: (habits: number, folders: number) =>
    `${habits} ${habits === 1 ? "habit" : "habits"}${folders > 0 ? ` and ${folders} ${folders === 1 ? "folder" : "folders"}` : ""} will be added — your current ones stay. Settings will be replaced with the ones from the file.`,
  importConfirm: "Import",
  importCancel: "Cancel",
  importDoneTitle: "Data Imported",
  importDoneMessage: (habits: number, folders: number) =>
    `Added ${habits} ${habits === 1 ? "habit" : "habits"}${folders > 0 ? ` and ${folders} ${folders === 1 ? "folder" : "folders"}` : ""}.`,
  importFailed: "Couldn’t import the data. Please try again.",
  importBadFile: "This file won’t work. Choose a file saved with “Export Data”.",
  archiveTitle: "Archive",
  archiveEmptyTitle: "Archive Is Empty",
  archiveEmptyDescription:
    "Habits you archive in their settings go here: they work as usual but don’t show in the list",
  foldersDescription: "Create folders for different groups of habits and quickly switch between them.",
  foldersHeading: "Folders",
  foldersEdit: "Edit",
  foldersDone: "Done",
  foldersCreate: "Create a Folder",
  foldersAll: "All Habits",
  foldersFooter: "Tap “Edit” to delete folders or change their order.",
  foldersLimitFooter: "You can’t create more folders.",
  folderRemove: (name: string) => `Delete folder “${name}”`,
  folderReorder: (name: string) => `Move “${name}”`,
  folderCreateTitle: "New Folder",
  folderEditTitle: "Folder",
  folderNameHeading: "Folder Name",
  folderNamePlaceholder: "Folder Name",
  folderHabitsHeading: "Included Habits",
  folderAddHabits: "Add Habits",
  folderHabitsFooter: "Choose habit types or habits that will appear in this folder.",
  folderCreateSubmit: "Create Folder",
  folderEditSubmit: "Save",
  folderSaveFailed: "Couldn’t save the folder",
  folderDelete: "Delete Folder",
  folderDeleteTitle: "Delete Folder",
  folderDeleteMessage: (name: string) =>
    `The folder “${name}” will be deleted. Its habits will stay in the list.`,
  folderDeleteConfirm: "Delete",
  folderDeleteCancel: "Cancel",
  folderPickerTitle: "Included Habits",
  folderPickerSearch: "Search Habits",
  folderPickerDone: "Done",
  folderPickerEmpty: "No habits yet",
  folderPickerTypesHeading: "Habit Types",
  folderPickerHabitsHeading: "Habits",
  folderHabitTypeNames: {
    group: "Group Habits",
    personal: "Personal Habits",
    frozen: "Frozen",
    unscheduled: "Not Due Today",
  },
  folderHabitCount: (count: number) => `${count}`,
  foldersRecommendedHeading: "Recommended Folders",
  foldersRecommendedAdd: "Add",
  folderKindNames: { unfinished: "Unfinished", today: "Today" },
  folderKindDescriptions: {
    unfinished: "Not done yet today",
    today: "All habits due today",
  },
  folderKindFooter: {
    unfinished: "Habits get into this folder by themselves: those due today and not done yet.",
    today: "Habits get into this folder by themselves: all those due today.",
  },
  folderKindEmptyTitle: { unfinished: "All Done", today: "Nothing for Today" },
  folderKindEmptyDescription: {
    unfinished: "Every habit due today is checked off",
    today: "No habits are due today",
  },
  foldersSwipe: "Switch by Swiping",
  foldersSwipeFooter: "Swipe left or right across the habits list to open the next folder.",
  settingsCheckinReminder: "Reminder",
  settingsCheckinReminderOff: "Off",
  checkinReminderTitle: "Reminder",
  checkinReminderToggle: "Remind Me to Check In",
  checkinReminderTime: "Time",
  settingsAdminPanel: "Admin Panel",

  settingsInstall: "Add to Home Screen",
  settingsAccount: "Account",
  settingsAccountGuest: "Not linked",
  settingsAccountOffline: "No connection",
  settingsAccountFooter:
    "Link Telegram so you don’t lose your habits: they’ll be here, in the Telegram bot and on a new phone.",
  settingsAttention: "Needs attention",
  webBack: "Back",
  webStartFailedTitle: "Couldn’t start",
  webStartFailedDescription: "Check your connection and try again.",
  accountTitle: "Account",
  accountFooter: "The same habits are in the Telegram bot and on any phone where you log in with Telegram.",
  accountLogout: "Log Out",
  accountLogoutTitle: "Log out?",
  accountLogoutMessage: "Your habits stay with your Telegram. Log in again to get them back.",
  accountLogoutConfirm: "Log Out",
  accountLogoutCancel: "Cancel",
  accountActionFailed: "Something went wrong. Please try again a bit later.",
  accountLogoutFailed: "Couldn’t log out",
  accountLogoutUnsent: "Some changes haven’t been saved yet. Check your connection and try again.",
  handoffMergeTitle: "Log in with this link?",
  handoffMergeMessage:
    "The habits on this phone will move to the Telegram account the link was opened from. If someone else sent you the link, tap Cancel.",
  handoffMergeConfirm: "Log In",
  handoffMergeCancel: "Cancel",
  accountLogoutEverywhere: "Log Out on All Devices",
  accountLogoutEverywhereTitle: "Log out on all devices?",
  accountLogoutEverywhereMessage:
    "The web app will log out on every device where you logged in.",
  accountLogoutOthersMessage:
    "You’ll be logged out on all other devices. This device stays logged in.",
  accountLinkFailed: "Couldn’t link Telegram",
  accountCreated: "Joined",
  accountHabits: "Habits",
  accountCheckins: "Total Check-ins",
  accountBestStreak: "Best Streak",
  accountDays: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
  accountDevices: "Logged-in Devices",
  accountDevicesFooterWeb: "Phones and computers logged in to the web app, this one included.",
  accountDevicesFooterTelegram: "Phones and computers logged in to the web app.",
  notificationsRow: "Notifications",
  notificationsDenied:
    "Notifications aren’t allowed. Allow them in your phone’s Settings → Notifications → Knot.",
  notificationsDeniedTitle: "Notifications are blocked",
  notificationsDeniedHint:
    "Your phone won’t ask again. Turn them on yourself: Settings → Notifications → Knot.",
  notificationsOnFailed: "Couldn’t turn on notifications",
  notificationsOffFailed: "Couldn’t turn off notifications",
  notificationsOffTitle: "Turn off notifications?",
  notificationsOffMessage: "Habit reminders will stop arriving on this phone.",
  notificationsOffConfirm: "Turn Off",
  notificationsOffCancel: "Cancel",
  telegramNotificationsOffMessage:
    "The bot will stop sending habit reminders and Knot news to Telegram.",
  installTitle: "App on Your Phone",
  installDescription: "The install page opens in your browser. Your habits stay the same.",
  installOpen: "Open in Browser",
  installFailed: "Couldn’t prepare the link. Please try again.",

  reviewTitle: "Write a Review",
  reviewDescription: "Tell us what you like and what could be better.",
  reviewPlaceholder: "Your review",
  reviewSend: "Send",
  reviewHistoryHeading: "Your Reviews",
  reviewReplyLabel: "Reply",
  reviewFailed: "Couldn’t send your review. Please try again.",

  timezoneTitle: "Time Zone",
  timezoneSearch: "Search",
  timezoneSearchClear: "Clear",
  timezoneLoading: "Loading time zones…",
  timezonesLoadFailed: "Couldn’t load time zones",
  timezoneNothingFound: "No Results",

  openHabit: "Open habit",
  habitHistoryHeading: "Last 364 days",
  habitHistoryCalendarHeading: "Last 8 months",
  habitHistoryLabel: "Completion history",
  habitMainHeading: "Overview",
  statCurrentStreak: "Current streak",
  statBestStreak: "Best streak",
  statTotalDone: "Total completed",
  statTotalTime: "Total time",
  statTotalTimes: "Total reps",
  statStreakGoal: "Streak goal",
  goalDaily: "Daily",
  goalEveryOtherDay: "Every Other Day",
  goalMonthly: "Every Month",
  streakInPeriods: {
    week: (count: number) => `${count} wk`,
    month: (count: number) => `${count} mo`,
    year: (count: number) => `${count}`,
  },
  statDaysDone: "Days completed",
  statThisPeriod: { week: "This week", month: "This month", year: "This year" },
  statNeedPerWeek: "Needed a week",
  statTooLate: "Out of reach",
  statGoalBy: "Will be reached",
  statForecast: "Year forecast",
  statForecastNone: "Forecast",
  statGoalReached: "Goal reached",
  calendarHeading: "Calendar",
  groupHistoryHeading: "Group’s last 364 days",
  groupHistoryCalendarHeading: "Group’s last 8 months",
  groupMainHeading: "Group overview",
  groupCalendarHeading: "Group calendar",
  calendarPrevMonth: "Previous month",
  calendarNextMonth: "Next month",
  monthNames: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  monthShortNames: [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ],
  monthNamesOf: [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ],
  calendarDayStates: {
    done: "completed",
    partial: "partly completed",
    missed: "not completed",
    frozen: "frozen",
    rest: "not scheduled",
    off: "no mark",
    unknown: "no data",
  },
  habitSettingsHeading: "Settings",
  editHabit: "Edit Habit",
  freezeHabit: "Freeze Habit",
  unfreezeHabit: "Unfreeze Habit",
  autoMarkHabit: "Auto Check-Off",
  freezeDialogTitle: "Freeze Habit",
  freezeDialogMessage:
    "Your current streak will be kept: missed days won’t break it, and frozen days will show as snowflakes in the history. You can check the habit off and get reminders again after unfreezing it.",
  freezeDialogConfirm: "Freeze",
  freezeDialogCancel: "Cancel",
  archiveHabit: "Archive Habit",
  unarchiveHabit: "Unarchive Habit",
  archiveDialogTitle: "Archive Habit",
  archiveDialogMessage:
    "The habit will leave the list and folders and move to Settings → Archive. You can still check it off and see its stats there, and its streak is kept, but reminders won’t come.",
  archiveDialogConfirm: "Archive",
  archiveDialogCancel: "Cancel",
  deleteHabit: "Delete Habit",
  deleteDialogTitle: "Delete Habit",
  deleteDialogMessage: "Are you sure you want to permanently delete this habit?",
  deleteDialogCancel: "Cancel",
  deleteDialogConfirm: "Delete",
  deleteFailed: "Couldn’t delete the habit. Please try again.",

  groupMembersHeading: "Members",
  groupMe: "You",
  groupOwner: "owner",
  groupMemberDone: "done",
  groupMemberFrozen: "frozen",
  groupMemberCount: (count: number, total: number) => `${count} of ${total} done`,
  groupAddMember: "Add Member",
  inviteShareText: (name: string) => `Join me in the habit “${name}” on Knot`,
  inviteCopiedTitle: "Link Copied",
  inviteCopiedMessage: "Send it to the friends you want to do the habit with.",
  groupNotify: "Members’ Check-Ins",
  blockedTitle: "Blocked",
  blockedEmptyTitle: "No One Here",
  blockedEmptyDescription: "Removed members will appear here",
  blockedFooter:
    "They can’t join through the link. Tap someone to remove them from the list.",
  unbanDialogTitle: "Unblock",
  unbanDialogMessage: (name: string) => `${name} will be able to join through the invite link again.`,
  unbanDialogConfirm: "Unblock",
  resetInvite: "Reset Link",
  resetInviteDialogTitle: "Reset Link",
  resetInviteDialogMessage:
    "The old link will stop working. Members stay in the habit.",
  resetInviteDialogConfirm: "Reset",
  leaveGroup: "Leave Habit",
  leaveGroupDialogTitle: "Leave Habit",
  leaveGroupDialogMessage:
    "The habit stays with you as an ordinary one, with all your check-ins. You can come back through the invite link.",
  leaveGroupOwnerDialogMessage:
    "The habit stays with you as an ordinary one, with all your check-ins. The member who joined first becomes the owner.",
  leaveGroupAloneDialogMessage:
    "The habit becomes an ordinary one and keeps its check-ins. The invite link will stop working.",
  leaveGroupDialogConfirm: "Leave",
  kickDialogTitle: (name: string) => `Remove ${name}`,
  kickDialogMessage:
    "The habit stays with them as an ordinary one. They can’t come back through the link until you unblock them.",
  kickDialogConfirm: "Remove",
  kickMember: "Remove Member",
  groupDialogCancel: "Cancel",
  alertOk: "Got it",
  groupActionFailed: "Couldn’t do that",
  groupLoginTitle: "Log In with Telegram",
  groupLoginMessage: "Group habits are available after logging in with Telegram.",
  groupLoginConfirm: "Log In",


  checkMark: (name: string) => `Mark as done: ${name}`,
  checkUnmark: (name: string) => `Unmark: ${name}`,
  checkDone: (name: string) => `${name}: done`,
  checkNotScheduled: (name: string) => `${name}: not scheduled`,
  checkFrozen: (name: string) => `${name}: frozen`,
  checkCount: (name: string, count: number, total: number) =>
    `Mark once more: ${name} (${count} of ${total})`,
  checkCountUp: (name: string, count: number, total: number) =>
    `Mark once more: ${name} (${count} done, goal ${total}). Hold to open the count`,
  checkTimerStart: (name: string, done: string, goal: string) =>
    `Start the timer: ${name} (${done} of ${goal})`,
  checkTimerStop: (name: string, done: string) => `Stop the timer: ${name} (${done})`,

  durationHours: (hours: number) => `${hours} h`,
  durationMinutes: (minutes: number) => `${minutes} min`,

  timerOpen: (name: string) => `Open the timer: ${name}`,
  timerPause: "Pause",
  timerResume: "Resume",
  timerStart: "Start",
  timerEditTime: "Edit the day’s time",
  timerLeft: (left: string) => `${left} left`,
  timerHabitRow: "Habit",
  streakDaysValue: (count: number) => `${count} ${count === 1 ? "day" : "days"}`,
  timerGoal: (goal: string) => `Goal: ${goal}`,
  timerGoalDone: "Goal done",

  countSheetToday: "Today",
  countSheetYesterday: "Yesterday",
  countSheetClose: "Close",
  countSheetLess: "One less",
  countSheetMore: "One more",
  countSheetValue: "Times done",
  countSheetAdd: (step: number) => `Add ${step}`,
  countSheetReset: "Reset",
  countSheetFill: "Fill the Day",
  countSheetLessMinute: "One minute less",
  countSheetMoreMinute: "One minute more",
  countSheetMinutes: "Minutes done",
  countSheetAddMinutes: (minutes: number) => `Add ${minutes} min`,

  daySheetDate: (weekday: string, day: number, monthOf: string) => `${weekday}, ${monthOf} ${day}`,
  daySheetMark: "Mark as Done",
  daySheetUnmark: "Unmark",
  daySheetNote: "Note for the day",
  daySheetLabel: (name: string, date: string) => `${name}, ${date}. Swipe for the next day`,
  undoTapsSuffix: (taps: number) => `: +${taps}`,
  undo: "Undo",

  formCreateTitle: "New Habit",
  formEditTitle: "Edit Habit",
  formCreateSubmit: "Add Habit",
  formCreateFailed: "Couldn’t create the habit",
  formEditFailed: "Couldn’t save the habit",
  formInfoHeading: "Details",
  formNamePlaceholder: "Name",
  formDescriptionPlaceholder: "Description (optional)",
  formFrequencyHeading: "Frequency",
  formRepeat: "Repeat",
  formDaily: "Every Day",
  formEveryOtherDay: "Every Other Day",
  formMonthly: "Every Month",
  formFlexible: "Flexible",
  formPeriod: "Period",
  periodNames: { week: "Week", month: "Month", year: "Year" },
  formPeriodTimes: (count: number, period: Period) =>
    `${count} ${count === 1 ? "day" : "days"} ${EN_PER[period]}`,
  formPeriodLess: "Fewer days a period",
  formPeriodMore: "More days a period",
  formYearTimes: "Days a year",
  formStartDate: "Starts",
  dateToday: "Today",
  dateTomorrow: "Tomorrow",
  formGoalHeading: "Goal",
  formGoalType: "Goal Type",
  formGoalByCount: "By Count",
  formGoalByTime: "By Time",
  formTimesPerDay: (count: number) =>
    count === 1 ? "Once a day" : count === 2 ? "Twice a day" : `${count} times a day`,
  formTimesLess: "Fewer times a day",
  formTimesMore: "More times a day",
  formGoalTime: (time: string) => `${time} a day`,
  formTimeLess: "Less time",
  formTimeMore: "More time",
  formReminderHeading: "Reminder",
  formReminderToggle: "Remind Me",
  formReminderTime: "Time",
  formReminderAdd: "Add Reminder",
  formReminderRemove: (time: string) => `Remove reminder ${time}`,
  formThemeHeading: "Color",
  formAdvanced: "Advanced",
  formAutoMarkHeading: "Auto Check-Off",
  formAutoMarkToggle: "Check Off Automatically",
  formAutoMarkFooter:
    "The habit checks itself off at the start of the day, or right after its reminder if it has one.",
  formOvertimeToggle: "Allow More Than the Goal",
  formSharedHeading: "Group Habit (Beta)",
  formSharedToggle: "Do It with Friends",
  formSharedFooter:
    "Do the habit together with friends. Once it’s saved, invite them with the Add Member button on the habit’s screen. A day counts only when everyone has done it.",

  daysWorkdays: "Weekdays",
  daysWeekends: "Weekends",
  daysNever: "Never",
  daysList: (days: string[]) =>
    days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days[days.length - 1]}` : days.join(""),
  weekdays: {
    mon: { short: "Mo", abbr: "Mon", full: "Monday" },
    tue: { short: "Tu", abbr: "Tue", full: "Tuesday" },
    wed: { short: "We", abbr: "Wed", full: "Wednesday" },
    thu: { short: "Th", abbr: "Thu", full: "Thursday" },
    fri: { short: "Fr", abbr: "Fri", full: "Friday" },
    sat: { short: "Sa", abbr: "Sat", full: "Saturday" },
    sun: { short: "Su", abbr: "Sun", full: "Sunday" },
  },
  colorNames: {
    blue: "Blue",
    lightblue: "Light Blue",
    teal: "Teal",
    green: "Green",
    yellow: "Yellow",
    orange: "Orange",
    red: "Red",
    pink: "Pink",
    purple: "Purple",
    indigo: "Indigo",
    brown: "Brown",
    graphite: "Graphite",
  },
  colorCustom: "Custom color",

  apiErrors: {
    network_error: "No internet connection. Check your connection and try again.",
    invalid_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    missing_init_data: "Couldn’t verify your Telegram account. Please reopen the app.",
    task_not_found: "Habit not found. It may have been deleted",
    habit_limit: "You’ve reached the habit limit. Delete one to add a new one",
    folder_limit: "You’ve reached the folder limit. Delete one to add a new one",
    folder_not_found: "Folder not found. It may have been deleted",
    invalid_folder_name: "Enter a folder name",
    rate_limited: "Too many actions in a row. Wait a couple of seconds",
    export_chat_unavailable: "Open the chat with the bot and tap “Start” — the file will arrive there.",
    invalid_import_file: "This file won’t work. Choose a file saved with “Export Data”.",
    invalid_name: "Enter a habit name",
    invalid_description: "The description is too long",
    invalid_days: "Choose at least one day of the week",
    invalid_start_date: "Choose a start date",
    invalid_period: "Choose a period",
    invalid_period_times: "That many times a period isn’t possible",
    invalid_note: "The note is too long",
    invalid_reminder_time: "Set a reminder time",
    invalid_timezone: "Couldn’t recognize the time zone",
    invalid_review: "Write your review",
    review_limit: "You’ve sent a lot of reviews today. Try again tomorrow",
    user_blocked: "Your access to the app has been restricted",
    invalid_session: "Your session has expired. Reopen the app",
    handoff_invalid: "This link has expired. Open it again from Telegram",
    stale_init_data: "Close and reopen the app: the link is only issued right after opening it",
    login_expired: "The login has expired. Please try again",
    account_conflict: "This login is already linked to another Telegram account",
    telegram_already_linked: "Another Telegram account is already linked",
    invalid_telegram_login: "Telegram didn’t confirm the login. Please try again.",
    push_unavailable: "Notifications aren’t set up on the server yet",
    push_not_delivered: "Couldn’t deliver the notification. Allow notifications for Knot.",
    group_needs_telegram: "Group habits are available after logging in with Telegram",
    group_not_found: "Group habit not found. You may have been removed",
    group_full: "This habit already has the most people it can",
    group_not_owner: "Only the habit’s owner can do this",
    group_member_not_found: "This person has already left the habit",
    group_has_members: "Other people are in this habit, so you can only leave it",
  },

  privacyPolicy: LEGAL_EN.privacy,
  termsOfUse: LEGAL_EN.terms,
};

/** Сколько слов должно быть в тексте, чтобы его последние два слова склеивались. */
const MIN_WORDS_TO_JOIN = 4;

/** Строки интерфейса по языкам. */
export const STRINGS: Record<Language, Strings> = {
  ru: keepLastWordsTogether(RU),
  en: keepLastWordsTogether(EN),
};

/**
 * Без «висящего» слова на последней строке: в каждом тексте из MIN_WORDS_TO_JOIN слов
 * и больше пробел между двумя последними словами заменяется неразрывным, и они
 * переносятся только вместе. Остальные строки не меняются — браузер переносит их как
 * обычно (без сужения абзаца, как у CSS `text-wrap: pretty` в Safari). Короткие
 * подписи и кусочки фраз не трогаем. Применяется ко всем строкам сразу, в том числе к
 * результатам функций-шаблонов.
 */
export function keepLastWordsTogether<T>(value: T): T {
  if (typeof value === "string") {
    return joinLastWords(value) as T;
  }
  if (typeof value === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    return ((...args: unknown[]) => keepLastWordsTogether(fn(...args))) as T;
  }
  if (Array.isArray(value)) {
    return value.map(keepLastWordsTogether) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, keepLastWordsTogether(item)]),
    ) as T;
  }
  return value;
}

function joinLastWords(text: string): string {
  if (text.trim().split(/\s+/).length < MIN_WORDS_TO_JOIN) {
    return text;
  }
  // Последний обычный пробел перед последним словом (в конце строки — без пробела).
  return text.replace(/ (\S+)$/, " $1");
}
