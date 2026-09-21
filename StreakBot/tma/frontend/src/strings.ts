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
  habitSettingsHeading: "Настройки",
  editHabit: "Редактировать привычку",
  deleteHabit: "Удалить привычку",
  deleteDialogTitle: "Удалить привычку",
  deleteDialogMessage: "Вы уверены, что хотите навсегда удалить эту привычку?",
  deleteDialogCancel: "Отменить",
  deleteDialogConfirm: "Удалить",
  deleteFailed: "Не удалось удалить привычку. Попробуйте ещё раз.",

  // --- Создание и редактирование привычки ---
  formCreateTitle: "Новая привычка",
  formEditTitle: "Редактирование",
  formCreateSubmit: "Создать привычку",
  formEditSubmit: "Сохранить",
  formCreateFailed: "Не удалось создать привычку",
  formEditFailed: "Не удалось сохранить привычку",
  formInfoHeading: "Информация",
  formNamePlaceholder: "Название",
  formFrequencyHeading: "Частота",
  formRepeat: "Повторять",
  formDaily: "Каждый день",
  formSpecificDays: "По дням",
  formDays: "Дни недели",
  formReminderHeading: "Напоминание",
  formReminderToggle: "Напоминать",
  formReminderTime: "Время",
  formThemeHeading: "Тема",
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
} as const;
