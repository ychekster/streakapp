/**
 * Вся пользовательская копия интерфейса в одном месте.
 * Ни одной строки-сообщения прямо в компонентах.
 */
export const STRINGS = {
  screenTitle: "Привычки",
  // Приглушённый подзаголовок второй секции (привычки, не запланированные на сегодня).
  otherSubheading: "Не запланированы на сегодня",

  emptyEmoji: "🌱",
  emptyTitle: "Пока нет привычек",
  emptyDescription: "Добавь первую привычку кнопкой «+» внизу.",

  errorEmoji: "⚠️",
  errorTitle: "Что-то пошло не так",
  errorRetry: "Повторить",

  outsideEmoji: "📱",
  outsideTitle: "Откройте в Telegram",
  outsideDescription:
    "Это мини-приложение работает внутри Telegram — откройте его кнопкой в боте StreakBot.",

  // --- Нижняя навигация ---
  tabHabits: "Привычки",
  tabSettings: "Настройки",
  addHabit: "Новая привычка",

  // --- Настройки ---
  settingsTitle: "Настройки",
  settingsLoading: "Загрузка настроек…",
  settingsLoadingEmoji: "⏳",
  settingsTimezone: "Часовой пояс",
  settingsTimezoneRow: "Пояс",
  settingsTimezoneNone: "Не выбран",
  settingsTimezoneFooter:
    "От пояса зависит, какой день считается сегодняшним для отметок и стриков.",

  // --- Экран привычки ---
  openHabit: "Открыть привычку",
  // Число дней совпадает с HISTORY_DAYS (constants.ts).
  habitHistoryHeading: "Последние 364 дня",
  habitMainHeading: "Основное",
  statCurrentStreak: "Текущая серия",
  statBestStreak: "Лучшая серия",
  statTotalDone: "Всего выполнено",
  statStreakGoal: "Цель серии",
  goalDaily: "Ежедневно",
  goalWorkdays: "Будни",
  goalWeekends: "Выходные",

  // --- Создание привычки ---
  createTitle: "Новая привычка",
  createCancel: "Отмена",
  createSubmit: "Создать",
  createNamePlaceholder: "Название",
  createFrequency: "Частота",
  createDaily: "Каждый день",
  createSpecificDays: "По дням",
  createDays: "Дни недели",
} as const;
