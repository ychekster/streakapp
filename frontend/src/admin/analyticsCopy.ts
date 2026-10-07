/**
 * Тексты аналитики админ-панели (ru и en) — часть строк панели: `useAdminStrings().an`
 * (см. adminStrings.ts). Подсказки ⓘ — одно-два предложения простым языком: что это и как
 * считается; термины — те же, что в backend/analytics/data.py.
 */

import type { ChangeKind } from "../types/admin";

/** Число по-русски: «1 234». */
function ru(value: number): string {
  return value.toLocaleString("ru-RU");
}

/** Число по-английски: «1,234». */
function en(value: number): string {
  return value.toLocaleString("en-US");
}

function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (units === 1 && tens !== 11) {
    return one;
  }
  if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) {
    return few;
  }
  return many;
}

const people = (count: number) =>
  `${ru(count)} ${plural(count, "человек", "человека", "человек")}`;
const peopleEn = (count: number) => `${en(count)} ${count === 1 ? "person" : "people"}`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** Подпись источника: готовые — по-человечески, остальные — как в ссылке. */
function sourceRu(name: string): string {
  return (
    { direct: "Напрямую", threads: "Threads", instagram: "Instagram", friends: "Друзья" }[name] ??
    name
  );
}

function sourceEn(name: string): string {
  return (
    { direct: "Direct", threads: "Threads", instagram: "Instagram", friends: "Friends" }[name] ??
    name
  );
}

export const ANALYTICS_RU = {
  title: "Аналитика",
  loadFailed: "Не удалось загрузить аналитику",
  periods: {
    today: "Сегодня",
    "7": "7 дней",
    "30": "30 дней",
    "90": "90 дней",
    all: "Всё время",
  } as Record<string, string>,
  periodNote: {
    today: "сегодня",
    "7": "за 7 дней",
    "30": "за 30 дней",
    "90": "за 90 дней",
    all: "за всё время",
  } as Record<string, string>,
  compareTo: {
    today: "ко вчера",
    "7": "к прошлым 7 дням",
    "30": "к прошлым 30 дням",
    "90": "к прошлым 90 дням",
    all: "",
  } as Record<string, string>,
  previousPeriod: {
    today: "вчера",
    "7": "за прошлые 7 дней",
    "30": "за прошлые 30 дней",
    "90": "за прошлые 90 дней",
    all: "",
  } as Record<string, string>,
  periodLabel: "Период",
  platform: "Платформа",
  platformAll: "Все",
  platformNames: { telegram: "Telegram", web: "Веб-приложение" } as Record<string, string>,
  source: "Источник",
  sourceAll: "Все",
  sourceName: sourceRu,
  sourceWithTag: (source: string, tag: string | null) =>
    tag ? `${sourceRu(source)} · ${tag}` : sourceRu(source),
  sections: {
    summary: "Сводка",
    funnel: "Воронка",
    retention: "Удержание",
    churn: "Отток",
    habits: "Привычки",
    sources: "Источники",
    messaging: "Рассылки",
  } as Record<string, string>,
  collectingSince: (date: string) => `Данные собираются с ${date}`,
  noData: "Нет данных",
  info: "Что это",
  showPeople: "Показать людей",
  noPrevious: "Сравнить не с чем",
  copyTable: "Скопировать таблицу",
  copied: "Скопировано",
  downloadCsv: "Скачать CSV",
  duration: (minutes: number) => {
    if (minutes < 60) {
      return `≈ ${Math.max(1, Math.round(minutes))} мин`;
    }
    if (minutes < 48 * 60) {
      return `≈ ${Math.round(minutes / 60)} ч`;
    }
    return `≈ ${Math.round(minutes / 1440)} дн`;
  },
  points: (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value * 100))} п.п.`,
  people,

  // --- Сводка ---
  liveTitle: "Живые пользователи",
  liveInfo:
    "Люди, которые отмечали привычки хотя бы 3 разных дня за последние 7 дней. Главный показатель здоровья приложения.",
  liveCompare: "к неделе назад",
  liveWeeks: "8 недель",
  newTitle: "Новые пользователи",
  newInfo:
    "Появились впервые: нажали /start в боте, открыли Mini App или открыли веб-приложение. Администраторы и тестовые аккаунты не считаются.",
  activationTitle: "Активация",
  activationInfo: (window: number, min: number) =>
    `Доля новых, кто в первые ${window} ${plural(window, "день", "дня", "дней")} отметил привычку хотя бы в ${min} ${plural(min, "разный день", "разных дня", "разных дней")}. Считаются те, у кого эти дни уже прошли.`,
  activationPending: (count: number) => `ещё ${people(count)} в процессе`,
  d7Title: "Удержание D7",
  d7Info:
    "Доля людей, отметивших привычку ровно на 7-й день после прихода. Считаются те, чей 7-й день пришёлся на период.",
  d7Cohort: (count: number) => `из ${people(count)}`,
  todayHeading: "Сегодня",
  openedToday: "Открыли приложение",
  openedTodayInfo: "Разные люди, которые открывали приложение сегодня (по времени Алматы).",
  checkedToday: "Отметили привычку",
  checkedTodayInfo: "Разные люди, которые отметили хотя бы одну привычку сегодня.",
  onlineNow: "Сейчас в приложении",
  onlineInfo: "Открывали приложение за последние 5 минут.",
  yesterday: (count: number) => `вчера ${ru(count)}`,
  leftHeading: "Ушли за период",
  blockedBot: "Заблокировали бота",
  blockedInfo: "Заблокировали бота в Telegram за период. Им не приходят напоминания и рассылки.",
  becameInactive: "Стали неактивными",
  becameInactiveInfo:
    "Не открывают приложение 14 дней, бота не блокировали. Считаются те, у кого эти 14 дней закончились в периоде.",
  uninstalled: "Вероятно удалили веб-приложение",
  uninstalledInfo:
    "Удаление нельзя узнать напрямую. Считаем по признакам: аккаунт только веб-приложения не заходит 14 дней или его уведомления перестали доходить.",
  changesHeading: "Что изменилось",
  noChanges: "Без резких изменений.",
  change: (kind: ChangeKind, current: number, previous: number, source: string | null, period: string) => {
    const from = source ? `, в основном из ${sourceRu(source)}` : "";
    switch (kind) {
      case "new_users": {
        const change = previous ? Math.round(((current - previous) / previous) * 100) : null;
        if (change === null) {
          return `Новых: ${ru(current)}, а в прошлом периоде не было${from}`;
        }
        return current > previous
          ? `Новых на ${change}% больше, чем ${period}${from}`
          : `Новых на ${Math.abs(change)}% меньше, чем ${period}${from}`;
      }
      case "activation":
        return `Активация ${current > previous ? "выросла" : "упала"} с ${percent(previous)} до ${percent(current)}`;
      case "live":
        return `Живых пользователей ${ru(current)}, неделю назад было ${ru(previous)}`;
      case "d7":
        return `Удержание D7 ${current > previous ? "выросло" : "упало"} с ${percent(previous)} до ${percent(current)}`;
      case "blocked":
        return `Вчера ${people(current)} заблокировали бота, обычно ${ru(previous)} в день`;
      case "inactive":
        return `Стали неактивными ${people(current)}, в прошлом периоде — ${ru(previous)}`;
    }
  },

  // --- Воронка ---
  funnelTelegram: "Telegram",
  funnelWeb: "Веб-приложение",
  steps: {
    started: "Запустили бота",
    opened: "Открыли приложение",
    habit: "Добавили привычку",
    checkin: "Первый раз отметили",
    activated: "Активированы",
    day7: "Вернулись через неделю",
    landing: "Открыли страницу",
    install_screen: "Открыли экран установки",
    installed: "Установили",
  } as Record<string, string>,
  stepInfo: {
    started: "Пришли в Telegram: нажали /start или открыли Mini App по ссылке.",
    day7: "Открывали приложение на 7-й день после прихода или позже.",
    landing: "Разные устройства, открывшие страницу knot за период.",
    install_screen: "Разные устройства, дошедшие до инструкции по установке.",
    installed: "Первый запуск с экрана «Домой»: появился аккаунт веб-приложения.",
  } as Record<string, string>,
  fromPrevious: (value: string) => `${value} от прошлого шага`,
  fromStart: (value: string) => `${value} от начала`,
  usually: (time: string) => `обычно ${time} до следующего`,
  funnelFooter:
    "Нажмите на шаг — откроются те, кто на нём застрял: дошёл до этого шага, но не до следующего. Им можно сразу сделать рассылку.",
  pageStepsFooter: "Первые два шага считают устройства на странице установки — людей в них ещё нет.",
  stuckTitle: (step: string) => `Застряли: ${step.toLowerCase()}`,
  reachedTitle: (step: string) => `Дошли: ${step.toLowerCase()}`,
  bySource: "По источникам",

  // --- Удержание ---
  basisOpen: "По открытиям",
  basisCheckin: "По отметкам",
  basisInfo:
    "«По открытиям» — человек открыл приложение. «По отметкам» — отметил хотя бы одну привычку: это строже и честнее.",
  weeksHeading: "По неделям прихода",
  weeksInfo:
    "Строка — люди, пришедшие за неделю. Столбец — доля из них, активных через столько недель. Нажмите на ячейку, чтобы увидеть людей.",
  week: (date: string) => `Неделя ${date}`,
  weekShort: (index: number) => `Н${index}`,
  cohortColumn: "Неделя",
  sizeColumn: "Людей",
  curveHeading: "Кривая удержания",
  curveInfo:
    "Доля пришедших за период, активных на N-й день после прихода. Считаются только те, у кого этот день уже прошёл.",
  compareNone: "Все вместе",
  comparePlatform: "Telegram и веб",
  compareSource: "По источникам",
  compareLabel: "Сравнить",
  curveGroup: (key: string) =>
    key === "all" ? "Все" : key === "telegram" ? "Telegram" : key === "web" ? "Веб" : sourceRu(key),
  dayN: (day: number) => `День ${day}`,
  retentionDays: "D1 · D7 · D30",
  dInfo: (day: number) =>
    `Доля людей, активных ровно на ${day}-й день после прихода. Считаются те, чей ${day}-й день пришёлся на период.`,
  leaveHeading: "Когда уходят",
  leaveInfo:
    "Пришедшие за период и уже ушедшие: через сколько дней после прихода они были в приложении в последний раз.",
  leaveBuckets: {
    never: "Не открыли приложение",
    "0": "В тот же день",
    "1": "На следующий день",
    "2-3": "Через 2–3 дня",
    "4-7": "Через 4–7 дней",
    "8-14": "Через 8–14 дней",
    "15+": "Через 15+ дней",
  } as Record<string, string>,
  stillActive: "Ещё с нами",

  // --- Отток и возврат ---
  blockedHeading: "Заблокировали бота",
  blockedHadHabit: (count: number) => `добавляли привычку: ${ru(count)}`,
  blockedActivated: (count: number) => `были активированы: ${ru(count)}`,
  blockedByDay: "Блокировки по дням",
  blockedDaysNote: "Блокировки до начала сбора данных видны только у тех, кто до сих пор не разблокировал бота.",
  inactiveHeading: "Неактивные 14+ дней",
  inactiveInfo: "Открывали приложение, но не заходят 14 дней и больше. Бота не блокировали.",
  inactiveBuckets: {
    "14-30": "14–30 дней",
    "31-60": "31–60 дней",
    "61-90": "61–90 дней",
    "91+": "Больше 90 дней",
  } as Record<string, string>,
  inactiveNow: "Сейчас",
  uninstalledHeading: "Вероятно удалили веб-приложение",
  uninstalledNow: "Сейчас",
  returnedHeading: "Вернулись",
  returnedInfo:
    "Не заходили больше 14 дней и снова открыли приложение. Причина — откуда открыли в день возвращения.",
  returnReasons: {
    reminder: "Напоминание",
    broadcast: "Рассылка",
    push: "Push-уведомление",
    self: "Сами",
    unknown: "До начала сбора данных",
  } as Record<string, string>,
  groupsHeading: "Готовые группы для рассылки",
  groups: {
    gone_active: "Ушли, но были активны",
    habit_abandoned: "Добавили привычку и бросили",
    start_no_open: "Нажали /start, но не открыли приложение",
  } as Record<string, string>,
  groupsFooter:
    "Нажмите на группу — откроется список, а оттуда одной кнопкой рассылка именно этим людям. Группы — по всем людям, без периода.",

  // --- Привычки ---
  perUserHeading: "Привычек на человека",
  perUserInfo: "Среди тех, кто открывал приложение и не заблокировал бота.",
  average: "В среднем",
  withoutHabits: "Без привычек",
  perUserBucket: (key: string) => `${key} ${key === "1" ? "привычка" : key === "2-3" ? "привычки" : "привычек"}`,
  topHeading: "Топ привычек",
  topFooter: "Похожие названия объединены: «Читать», «читать 📚» и «Чтение» — одна строка.",
  habitColumn: "Привычка",
  peopleColumn: "Людей",
  habitsColumn: "Привычек",
  frequencyHeading: "Как часто",
  frequency: {
    daily: "Каждый день",
    specific_days: "По дням недели",
    every_other_day: "Через день",
  } as Record<string, string>,
  withReminder: (count: number, total: number) =>
    `С напоминанием — ${ru(count)} из ${ru(total)} привычек`,
  reminderHours: "Во сколько ставят напоминания",
  deletedHeading: "Удалённые привычки",
  deletedCount: "Удалили",
  deletedMedian: "Обычно живут",
  deletedMedianValue: (days: number) =>
    days < 1 ? "меньше дня" : `${ru(Math.round(days))} ${plural(Math.round(days), "день", "дня", "дней")}`,
  deletedFirstWeek: "Удаляют в первую неделю",
  deletedFirstWeekInfo: "Доля привычек, удалённых в первые 7 дней, среди созданных хотя бы неделю назад.",
  deletedTop: "Чаще всего удаляют",
  streaksHeading: "Серии",
  streaksInfo: "Самая длинная серия человека среди его привычек — как он видит её сам.",
  streaksCurrent: "Текущие",
  streaksBest: "Лучшие",
  streakBucket: (key: string) => `${key} ${key === "1-2" ? "дня" : "дней"}`,
  contentHeading: "Для контента",
  contentLine: (count: number, days: number) =>
    `${people(count)} держат серию ${ru(days)}+ дней`,
  longestStreak: (days: number) => `Самая длинная серия сейчас — ${ru(days)} ${plural(days, "день", "дня", "дней")}`,
  completionHeading: "Доля выполнения",
  completionInfo: "Сколько запланированных на день привычек отметили. Удалённые привычки не считаются.",
  completionByDay: "По дням",
  completionByWeekday: "По дням недели",
  weekdays: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  worstWeekday: (day: string) => `Хуже всего отмечают: ${day}`,
  hoursHeading: "Во сколько отмечают",
  hoursInfo: "Отметки за период по часам — по времени пользователя.",
  featuresHeading: "Какими функциями пользуются",
  features: {
    mark_yesterday: "Отмечать за вчера",
    checkin_reminder: "Напоминание «Пора отметить»",
    habit_reminder: "Напоминания о привычках",
    push: "Push-уведомления",
    dark_theme: "Тёмная тема",
    english: "Английский язык",
  } as Record<string, string>,
  featuresFooter: (count: number) =>
    `Доля от ${people(count)}, которые открывали приложение и не заблокировали бота.`,

  // --- Источники и аудитория ---
  sourcesHeading: "Источники",
  sourcesInfo:
    "Новые за период по источнику: сколько открыли приложение, активировались, удержались на 7-й день и сколько сейчас «живых». Нажмите на заголовок столбца, чтобы отсортировать.",
  columnNew: "Новые",
  columnOpened: "Открыли",
  columnActivated: "Активированы",
  columnD7: "D7",
  columnLive: "Живые",
  sourceColumn: "Источник",
  makeLink: "Создать ссылку с меткой",
  platformsHeading: "Telegram или веб",
  devicesHeading: "Телефон",
  devices: {
    ios: "iPhone",
    android: "Android",
    desktop: "Компьютер",
    unknown: "Неизвестно",
  } as Record<string, string>,
  languagesHeading: "Язык",
  languages: { ru: "Русский", en: "Английский" } as Record<string, string>,
  timezonesHeading: "Часовые пояса",
  webGuestsHeading: "Гости веб-приложения",
  webUsers: "Пришли через веб",
  webLinked: "Привязали Telegram",
  webGuests: "Остались гостями",
  webGoogleNote: "Входа через Google в приложении пока нет — считается только Telegram.",
  cohortNote: (period: string) => `Новые ${period}`,

  // --- Напоминания и рассылки ---
  remindersHeading: "Напоминания",
  sentTelegram: "Отправлено в Telegram",
  sentPush: "Отправлено push",
  notDelivered: "Не дошло",
  followed: "Отметили в течение 2 часов",
  followedInfo:
    "Доля напоминаний, после которых привычку отметили в течение 2 часов (у «Пора отметить» — любую).",
  openedFromReminder: "Открыли приложение по напоминанию",
  openedFromPush: "Открыли по push-уведомлению",
  compareHeading: "С напоминаниями и без",
  compareInfo: "Среди людей с привычками: насколько лучше держатся те, у кого есть напоминания.",
  withReminders: "С напоминаниями",
  withoutReminders: "Без напоминаний",
  liveShare: "Живые",
  d7Share: "D7",
  broadcastsHeading: "Рассылки",
  broadcastsEmpty: "За период рассылок не было",
  broadcastUntracked: "Получатели этой рассылки не записывались — она была до начала сбора данных.",
  broadcastDelivered: (sent: number, total: number) => `Дошла: ${ru(sent)} из ${ru(total)}`,
  opened24: "Открыли за 24 ч",
  opened72: "Открыли за 72 ч",
  checked72: "Отметили привычку",
  blocked24: "Заблокировали за сутки",
  buttonOpens: "Нажали кнопку",
  mediaBroadcast: { photo: "Фото", video: "Видео" } as Record<string, string>,
  offerHeading: "Предложение установить веб-приложение",
  offerInfo: "Бот предлагает установить приложение после первой отметки.",
  offerShown: "Показали",
  offerClicked: "Нажали «Установить»",
  offerInstalled: "Установили",
  promptHeading: "Кнопка установки на Android",
  promptShown: "Показали",
  promptAccepted: "Согласились",
  promptInstalled: "Установили",

  // --- Люди за цифрой ---
  peopleTitle: "Люди",
  peopleCount: (count: number) => people(count),
  peopleBroadcast: "Рассылка этим людям",
  peopleBroadcastFooter:
    "Рассылку получат только те, у кого есть Telegram и кто не заблокировал бота. Список — на момент нажатия.",
  peopleEmpty: "Никого нет",
  peopleFailed: "Не удалось собрать список",
  segmentChip: (title: string) => `Группа: ${title}`,
  segmentRow: "Группа из аналитики",
  segmentFallback: (id: string) => `№${id}`,
  removeSegment: "Убрать группу",

  // --- Генератор ссылок ---
  linksTitle: "Ссылки с меткой",
  linksSource: "Источник",
  linksOther: "Другое",
  linksCustom: "Название источника",
  linksCustomPlaceholder: "например, tiktok",
  linksTag: "Подпись",
  linksTagPlaceholder: "например, post12",
  linksTagFooter:
    "Латиница, цифры, «-» и «_». Подпись поможет понять, какой именно пост привёл людей.",
  linksBot: "Ссылка на бота",
  linksBotFooter: "Сразу открывает бота в Telegram. Источник запомнится, когда человек нажмёт «Запустить».",
  linksWeb: "Ссылка на веб-версию",
  linksWebFooter:
    "Открывает страницу knot: человек сам выбирает Telegram или установку на телефон, метка сохраняется в обоих случаях. Для Threads и Instagram — лучший вариант.",
  linksCopy: "Скопировать",
  linksCopied: "Скопировано",
  linksBotMissing: "Не удалось узнать имя бота — задайте TELEGRAM_BOT_USERNAME на сервере.",
  linksTooLong: (max: number) => `Источник и подпись вместе — не длиннее ${max} символов.`,

  // --- Профиль ---
  summaryHeading: "Сводка",
  profileSource: "Откуда пришёл",
  profilePlatform: "Платформа",
  profileCame: "Пришёл",
  profileLastSeen: "Последний раз",
  profileStatus: "Статус",
  statuses: {
    active: "Активен",
    not_opened: "Не открыл приложение",
    churned: "Ушёл",
    bot_blocked: "Заблокировал бота",
    uninstalled: "Вероятно удалил веб-приложение",
  } as Record<string, string>,
  activationLabel: "Активация",
  activation: (value: boolean | null): string =>
    value === null ? "Ещё идёт" : value ? "Активирован" : "Не активирован",
  liveLabel: "Живой",
  yes: "Да",
  no: "Нет",
  streakLabel: "Серия",
  streakValue: (current: number, best: number) => `${ru(current)} · лучшая ${ru(best)}`,
  checkinDays: "Дней с отметками",
  completion30: "Выполнение за 30 дней",
  lastCheckin: "Последняя отметка",
  testAccount: "Тестовый аккаунт",
  testFooter: "Тестовые аккаунты и администраторы не входят в аналитику.",
  timelineHeading: "Лента действий",
  timelineEmpty: "Действий пока нет",
  timelineMore: "Показать ещё",
  timelineFailed: "Не удалось загрузить ленту",
  timeline: {
    joined: "Пришёл",
    first_open: "Впервые открыл приложение",
    start: "Нажал /start",
    app_open: "Открыл приложение",
    habit_created: "Создал привычку",
    habit_updated: "Изменил привычку",
    habit_deleted: "Удалил привычку",
    habit_frozen: "Заморозил привычку",
    habit_unfrozen: "Разморозил привычку",
    checkin: "Отметил",
    uncheck: "Снял отметку",
    auto_checkin: "Отмечено автоматически",
    settings: "Изменил настройки",
    push_on: "Включил уведомления",
    push_off: "Отключил уведомления",
    push_gone: "Уведомления перестали доходить",
    linked: "Привязал Telegram",
    review: "Оставил отзыв",
    bot_blocked: "Заблокировал бота",
    bot_unblocked: "Разблокировал бота",
    reminder_sent: "Получил напоминание",
    reminder_failed: "Напоминание не дошло",
    broadcast_sent: "Получил рассылку",
    broadcast_failed: "Рассылка не дошла",
    install_offer_sent: "Получил предложение установить приложение",
  } as Record<string, string>,
  openFrom: {
    menu: "из меню бота",
    welcome: "из приветствия",
    reminder: "из напоминания",
    broadcast: "из рассылки",
    push: "из push-уведомления",
    install_offer: "из предложения установить",
    link: "по ссылке",
    icon: "с экрана «Домой»",
  } as Record<string, string>,
  settingsNames: {
    timezone: "пояс",
    timezone_city: "пояс",
    language: "язык",
    theme: "тема",
    mark_yesterday: "«отмечать за вчера»",
    checkin_reminder: "напоминание «пора отметить»",
  } as Record<string, string>,
  channel: { telegram: "Telegram", push: "push" } as Record<string, string>,

  // --- Настройки панели ---
  settingsHeading: "Аналитика",
  activationWindow: "Окно активации",
  activationMin: "Дней с отметками",
  daysValue: (days: number) => `${ru(days)} ${plural(days, "день", "дня", "дней")}`,
  activationFooter: (window: number, min: number) =>
    `Активирован — в первые ${window} ${plural(window, "день", "дня", "дней")} отметил привычку хотя бы в ${min} ${plural(min, "разный день", "разных дня", "разных дней")}.`,
  activationSaveFailed: "Не удалось сохранить. Попробуйте ещё раз.",
  linksRow: "Ссылки с меткой",
};

export type AnalyticsCopy = typeof ANALYTICS_RU;

export const ANALYTICS_EN: AnalyticsCopy = {
  title: "Analytics",
  loadFailed: "Couldn’t load analytics",
  periods: { today: "Today", "7": "7 days", "30": "30 days", "90": "90 days", all: "All time" },
  periodNote: {
    today: "today",
    "7": "in 7 days",
    "30": "in 30 days",
    "90": "in 90 days",
    all: "all time",
  },
  compareTo: {
    today: "vs yesterday",
    "7": "vs previous 7 days",
    "30": "vs previous 30 days",
    "90": "vs previous 90 days",
    all: "",
  },
  previousPeriod: {
    today: "than yesterday",
    "7": "than the previous 7 days",
    "30": "than the previous 30 days",
    "90": "than the previous 90 days",
    all: "",
  },
  periodLabel: "Period",
  platform: "Platform",
  platformAll: "All",
  platformNames: { telegram: "Telegram", web: "Web app" },
  source: "Source",
  sourceAll: "All",
  sourceName: sourceEn,
  sourceWithTag: (source: string, tag: string | null) =>
    tag ? `${sourceEn(source)} · ${tag}` : sourceEn(source),
  sections: {
    summary: "Summary",
    funnel: "Funnel",
    retention: "Retention",
    churn: "Churn",
    habits: "Habits",
    sources: "Sources",
    messaging: "Messages",
  },
  collectingSince: (date: string) => `Collected since ${date}`,
  noData: "No data",
  info: "What is this",
  showPeople: "Show people",
  noPrevious: "Nothing to compare with",
  copyTable: "Copy table",
  copied: "Copied",
  downloadCsv: "Download CSV",
  duration: (minutes: number) => {
    if (minutes < 60) {
      return `≈ ${Math.max(1, Math.round(minutes))} min`;
    }
    if (minutes < 48 * 60) {
      return `≈ ${Math.round(minutes / 60)} h`;
    }
    return `≈ ${Math.round(minutes / 1440)} d`;
  },
  points: (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value * 100))} pp`,
  people: peopleEn,

  liveTitle: "Live users",
  liveInfo:
    "People who checked off habits on at least 3 different days in the last 7 days. The main health metric of the app.",
  liveCompare: "vs a week ago",
  liveWeeks: "8 weeks",
  newTitle: "New users",
  newInfo:
    "Showed up for the first time: started the bot, opened the Mini App or the web app. Admins and test accounts aren’t counted.",
  activationTitle: "Activation",
  activationInfo: (window: number, min: number) =>
    `Share of new people who checked off a habit on at least ${min} different ${min === 1 ? "day" : "days"} in their first ${window} ${window === 1 ? "day" : "days"}. Counts people whose window is over.`,
  activationPending: (count: number) => `${en(count)} still in progress`,
  d7Title: "D7 retention",
  d7Info:
    "Share of people who checked off a habit exactly on day 7 after joining. Counts people whose day 7 fell into the period.",
  d7Cohort: (count: number) => `of ${peopleEn(count)}`,
  todayHeading: "Today",
  openedToday: "Opened the app",
  openedTodayInfo: "Different people who opened the app today (Almaty time).",
  checkedToday: "Checked off a habit",
  checkedTodayInfo: "Different people who checked off at least one habit today.",
  onlineNow: "In the app now",
  onlineInfo: "Opened the app in the last 5 minutes.",
  yesterday: (count: number) => `yesterday ${en(count)}`,
  leftHeading: "Left in the period",
  blockedBot: "Blocked the bot",
  blockedInfo: "Blocked the bot in Telegram during the period. They get no reminders or broadcasts.",
  becameInactive: "Became inactive",
  becameInactiveInfo:
    "Haven’t opened the app for 14 days and didn’t block the bot. Counts people whose 14 days ended in the period.",
  uninstalled: "Likely uninstalled the web app",
  uninstalledInfo:
    "Uninstalls can’t be seen directly. We count signs: a web-only account away for 14 days, or its notifications stopped reaching it.",
  changesHeading: "What changed",
  noChanges: "No sharp changes.",
  change: (kind: ChangeKind, current: number, previous: number, source: string | null, period: string) => {
    const from = source ? `, mostly from ${sourceEn(source)}` : "";
    switch (kind) {
      case "new_users": {
        const change = previous ? Math.round(((current - previous) / previous) * 100) : null;
        if (change === null) {
          return `${en(current)} new people, none in the previous period${from}`;
        }
        return current > previous
          ? `${change}% more new people ${period}${from}`
          : `${Math.abs(change)}% fewer new people ${period}${from}`;
      }
      case "activation":
        return `Activation ${current > previous ? "rose" : "dropped"} from ${percent(previous)} to ${percent(current)}`;
      case "live":
        return `${en(current)} live users, ${en(previous)} a week ago`;
      case "d7":
        return `D7 retention ${current > previous ? "rose" : "dropped"} from ${percent(previous)} to ${percent(current)}`;
      case "blocked":
        return `${peopleEn(current)} blocked the bot yesterday, usually ${en(previous)} a day`;
      case "inactive":
        return `${peopleEn(current)} became inactive, ${en(previous)} in the previous period`;
    }
  },

  funnelTelegram: "Telegram",
  funnelWeb: "Web app",
  steps: {
    started: "Started the bot",
    opened: "Opened the app",
    habit: "Added a habit",
    checkin: "First check-in",
    activated: "Activated",
    day7: "Came back after a week",
    landing: "Opened the page",
    install_screen: "Opened install steps",
    installed: "Installed",
  },
  stepInfo: {
    started: "Came via Telegram: pressed /start or opened the Mini App by a link.",
    day7: "Opened the app on day 7 after joining or later.",
    landing: "Different devices that opened the knot page in the period.",
    install_screen: "Different devices that reached the install instructions.",
    installed: "First launch from the home screen: a web app account appeared.",
  },
  fromPrevious: (value: string) => `${value} of previous step`,
  fromStart: (value: string) => `${value} of start`,
  usually: (time: string) => `usually ${time} to the next`,
  funnelFooter:
    "Tap a step to see who got stuck there: reached this step but not the next one. You can broadcast to them right away.",
  pageStepsFooter: "The first two steps count devices on the install page — there are no people yet.",
  stuckTitle: (step: string) => `Stuck: ${step.toLowerCase()}`,
  reachedTitle: (step: string) => `Reached: ${step.toLowerCase()}`,
  bySource: "By source",

  basisOpen: "By opens",
  basisCheckin: "By check-ins",
  basisInfo:
    "“By opens” — the person opened the app. “By check-ins” — checked off at least one habit: stricter and more honest.",
  weeksHeading: "By week of joining",
  weeksInfo:
    "A row is people who joined that week. A column is the share of them active that many weeks later. Tap a cell to see the people.",
  week: (date: string) => `Week of ${date}`,
  weekShort: (index: number) => `W${index}`,
  cohortColumn: "Week",
  sizeColumn: "People",
  curveHeading: "Retention curve",
  curveInfo:
    "Share of people who joined in the period and were active on day N after joining. Only counts people whose day N is over.",
  compareNone: "Everyone",
  comparePlatform: "Telegram vs web",
  compareSource: "By source",
  compareLabel: "Compare",
  curveGroup: (key: string) =>
    key === "all" ? "All" : key === "telegram" ? "Telegram" : key === "web" ? "Web" : sourceEn(key),
  dayN: (day: number) => `Day ${day}`,
  retentionDays: "D1 · D7 · D30",
  dInfo: (day: number) =>
    `Share of people active exactly on day ${day} after joining. Counts people whose day ${day} fell into the period.`,
  leaveHeading: "When people leave",
  leaveInfo:
    "People who joined in the period and are gone: how many days after joining they were last in the app.",
  leaveBuckets: {
    never: "Never opened the app",
    "0": "Same day",
    "1": "Next day",
    "2-3": "After 2–3 days",
    "4-7": "After 4–7 days",
    "8-14": "After 8–14 days",
    "15+": "After 15+ days",
  },
  stillActive: "Still with us",

  blockedHeading: "Blocked the bot",
  blockedHadHabit: (count: number) => `had a habit: ${en(count)}`,
  blockedActivated: (count: number) => `were activated: ${en(count)}`,
  blockedByDay: "Blocks by day",
  blockedDaysNote: "Blocks before data collection started are only known for people still blocking the bot.",
  inactiveHeading: "Inactive 14+ days",
  inactiveInfo: "Opened the app but haven’t been back for 14 days or more. Didn’t block the bot.",
  inactiveBuckets: {
    "14-30": "14–30 days",
    "31-60": "31–60 days",
    "61-90": "61–90 days",
    "91+": "Over 90 days",
  },
  inactiveNow: "Now",
  uninstalledHeading: "Likely uninstalled the web app",
  uninstalledNow: "Now",
  returnedHeading: "Came back",
  returnedInfo:
    "Were away for over 14 days and opened the app again. The reason is where they opened it from that day.",
  returnReasons: {
    reminder: "Reminder",
    broadcast: "Broadcast",
    push: "Push notification",
    self: "On their own",
    unknown: "Before data collection",
  },
  groupsHeading: "Ready-made broadcast groups",
  groups: {
    gone_active: "Left but were active",
    habit_abandoned: "Added a habit and dropped it",
    start_no_open: "Pressed /start but never opened the app",
  },
  groupsFooter:
    "Tap a group to see the list, then broadcast to exactly these people in one tap. Groups cover everyone, not just the period.",

  perUserHeading: "Habits per person",
  perUserInfo: "Among people who opened the app and didn’t block the bot.",
  average: "Average",
  withoutHabits: "No habits",
  perUserBucket: (key: string) => `${key} ${key === "1" ? "habit" : "habits"}`,
  topHeading: "Top habits",
  topFooter: "Similar names are merged: “Read”, “read 📚” and “Reading” are one row.",
  habitColumn: "Habit",
  peopleColumn: "People",
  habitsColumn: "Habits",
  frequencyHeading: "How often",
  frequency: {
    daily: "Every day",
    specific_days: "Specific days",
    every_other_day: "Every other day",
  },
  withReminder: (count: number, total: number) =>
    `${en(count)} of ${en(total)} habits have a reminder`,
  reminderHours: "Reminder times",
  deletedHeading: "Deleted habits",
  deletedCount: "Deleted",
  deletedMedian: "Usually live",
  deletedMedianValue: (days: number) =>
    days < 1 ? "under a day" : `${en(Math.round(days))} ${Math.round(days) === 1 ? "day" : "days"}`,
  deletedFirstWeek: "Deleted in the first week",
  deletedFirstWeekInfo: "Share of habits deleted within 7 days, among those created at least a week ago.",
  deletedTop: "Deleted most often",
  streaksHeading: "Streaks",
  streaksInfo: "A person’s longest streak among their habits — as they see it.",
  streaksCurrent: "Current",
  streaksBest: "Best",
  streakBucket: (key: string) => `${key} ${key === "1-2" ? "days" : "days"}`,
  contentHeading: "For content",
  contentLine: (count: number, days: number) => `${peopleEn(count)} keep a ${en(days)}+ day streak`,
  longestStreak: (days: number) => `The longest streak now — ${en(days)} ${days === 1 ? "day" : "days"}`,
  completionHeading: "Completion rate",
  completionInfo: "How many habits due that day were checked off. Deleted habits aren’t counted.",
  completionByDay: "By day",
  completionByWeekday: "By weekday",
  weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  worstWeekday: (day: string) => `Worst day for check-ins: ${day}`,
  hoursHeading: "When people check in",
  hoursInfo: "Check-ins in the period by hour — in the person’s time.",
  featuresHeading: "Features in use",
  features: {
    mark_yesterday: "Check off for yesterday",
    checkin_reminder: "“Time to check off” reminder",
    habit_reminder: "Habit reminders",
    push: "Push notifications",
    dark_theme: "Dark theme",
    english: "English",
  },
  featuresFooter: (count: number) =>
    `Share of ${peopleEn(count)} who opened the app and didn’t block the bot.`,

  sourcesHeading: "Sources",
  sourcesInfo:
    "New people in the period by source: how many opened the app, got activated, stayed to day 7 and are live now. Tap a column title to sort.",
  columnNew: "New",
  columnOpened: "Opened",
  columnActivated: "Activated",
  columnD7: "D7",
  columnLive: "Live",
  sourceColumn: "Source",
  makeLink: "Create a tagged link",
  platformsHeading: "Telegram or web",
  devicesHeading: "Phone",
  devices: { ios: "iPhone", android: "Android", desktop: "Computer", unknown: "Unknown" },
  languagesHeading: "Language",
  languages: { ru: "Russian", en: "English" },
  timezonesHeading: "Time zones",
  webGuestsHeading: "Web app guests",
  webUsers: "Came via the web",
  webLinked: "Linked Telegram",
  webGuests: "Still guests",
  webGoogleNote: "There’s no Google login in the app yet — only Telegram is counted.",
  cohortNote: (period: string) => `New ${period}`,

  remindersHeading: "Reminders",
  sentTelegram: "Sent to Telegram",
  sentPush: "Sent as push",
  notDelivered: "Not delivered",
  followed: "Checked off within 2 hours",
  followedInfo:
    "Share of reminders followed by a check-in of that habit within 2 hours (any habit for “Time to check off”).",
  openedFromReminder: "Opened the app from a reminder",
  openedFromPush: "Opened from a push notification",
  compareHeading: "With and without reminders",
  compareInfo: "Among people with habits: how much better those with reminders stay.",
  withReminders: "With reminders",
  withoutReminders: "Without reminders",
  liveShare: "Live",
  d7Share: "D7",
  broadcastsHeading: "Broadcasts",
  broadcastsEmpty: "No broadcasts in this period",
  broadcastUntracked: "Recipients of this broadcast weren’t recorded — it was sent before data collection started.",
  broadcastDelivered: (sent: number, total: number) => `Delivered: ${en(sent)} of ${en(total)}`,
  opened24: "Opened within 24 h",
  opened72: "Opened within 72 h",
  checked72: "Checked off a habit",
  blocked24: "Blocked within a day",
  buttonOpens: "Tapped the button",
  mediaBroadcast: { photo: "Photo", video: "Video" },
  offerHeading: "Offer to install the web app",
  offerInfo: "The bot offers to install the app after the first check-in.",
  offerShown: "Shown",
  offerClicked: "Tapped “Install”",
  offerInstalled: "Installed",
  promptHeading: "Android install button",
  promptShown: "Shown",
  promptAccepted: "Accepted",
  promptInstalled: "Installed",

  peopleTitle: "People",
  peopleCount: peopleEn,
  peopleBroadcast: "Broadcast to These People",
  peopleBroadcastFooter:
    "Only people with Telegram who haven’t blocked the bot get it. The list is fixed at the moment you tapped.",
  peopleEmpty: "No one here",
  peopleFailed: "Couldn’t build the list",
  segmentChip: (title: string) => `Group: ${title}`,
  segmentRow: "Group from analytics",
  segmentFallback: (id: string) => `#${id}`,
  removeSegment: "Remove group",

  linksTitle: "Tagged Links",
  linksSource: "Source",
  linksOther: "Other",
  linksCustom: "Source name",
  linksCustomPlaceholder: "e.g. tiktok",
  linksTag: "Label",
  linksTagPlaceholder: "e.g. post12",
  linksTagFooter: "Latin letters, digits, “-” and “_”. The label tells which post brought people.",
  linksBot: "Bot link",
  linksBotFooter: "Opens the bot in Telegram right away. The source is saved when the person taps Start.",
  linksWeb: "Web link",
  linksWebFooter:
    "Opens the knot page: the person picks Telegram or installing on the phone, the tag is kept either way. Best for Threads and Instagram.",
  linksCopy: "Copy",
  linksCopied: "Copied",
  linksBotMissing: "Couldn’t get the bot’s name — set TELEGRAM_BOT_USERNAME on the server.",
  linksTooLong: (max: number) => `Source and label together — up to ${max} characters.`,

  summaryHeading: "Summary",
  profileSource: "Came from",
  profilePlatform: "Platform",
  profileCame: "Joined",
  profileLastSeen: "Last seen",
  profileStatus: "Status",
  statuses: {
    active: "Active",
    not_opened: "Never opened the app",
    churned: "Left",
    bot_blocked: "Blocked the bot",
    uninstalled: "Likely uninstalled the web app",
  },
  activationLabel: "Activation",
  activation: (value: boolean | null): string =>
    value === null ? "In progress" : value ? "Activated" : "Not activated",
  liveLabel: "Live",
  yes: "Yes",
  no: "No",
  streakLabel: "Streak",
  streakValue: (current: number, best: number) => `${en(current)} · best ${en(best)}`,
  checkinDays: "Days with check-ins",
  completion30: "Completion, 30 days",
  lastCheckin: "Last check-in",
  testAccount: "Test Account",
  testFooter: "Test accounts and admins aren’t included in analytics.",
  timelineHeading: "Activity",
  timelineEmpty: "No activity yet",
  timelineMore: "Show More",
  timelineFailed: "Couldn’t load the activity",
  timeline: {
    joined: "Joined",
    first_open: "Opened the app for the first time",
    start: "Pressed /start",
    app_open: "Opened the app",
    habit_created: "Created a habit",
    habit_updated: "Edited a habit",
    habit_deleted: "Deleted a habit",
    habit_frozen: "Froze a habit",
    habit_unfrozen: "Unfroze a habit",
    checkin: "Checked off",
    uncheck: "Unchecked",
    auto_checkin: "Checked off automatically",
    settings: "Changed settings",
    push_on: "Turned on notifications",
    push_off: "Turned off notifications",
    push_gone: "Notifications stopped reaching them",
    linked: "Linked Telegram",
    review: "Left a review",
    bot_blocked: "Blocked the bot",
    bot_unblocked: "Unblocked the bot",
    reminder_sent: "Got a reminder",
    reminder_failed: "Reminder not delivered",
    broadcast_sent: "Got a broadcast",
    broadcast_failed: "Broadcast not delivered",
    install_offer_sent: "Got the offer to install the app",
  },
  openFrom: {
    menu: "from the bot menu",
    welcome: "from the welcome message",
    reminder: "from a reminder",
    broadcast: "from a broadcast",
    push: "from a push notification",
    install_offer: "from the install offer",
    link: "by a link",
    icon: "from the home screen",
  },
  settingsNames: {
    timezone: "time zone",
    timezone_city: "time zone",
    language: "language",
    theme: "theme",
    mark_yesterday: "“check off for yesterday”",
    checkin_reminder: "“time to check off” reminder",
  },
  channel: { telegram: "Telegram", push: "push" },

  settingsHeading: "Analytics",
  activationWindow: "Activation window",
  activationMin: "Days with check-ins",
  daysValue: (days: number) => `${en(days)} ${days === 1 ? "day" : "days"}`,
  activationFooter: (window: number, min: number) =>
    `Activated — checked off a habit on at least ${min} different ${min === 1 ? "day" : "days"} in the first ${window} ${window === 1 ? "day" : "days"}.`,
  activationSaveFailed: "Couldn’t save. Please try again.",
  linksRow: "Tagged Links",
};
