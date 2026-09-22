/**
 * Иконки админ-панели (24×24, контур цветом текста): рядов списков — белые в цветной
 * плашке ListItem, как SettingsIcons, — и карточек показателей аналитики (как StatIcons,
 * тоньше), и переключателя «график / таблица».
 */

const ROW_STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const STAT_STROKE = { ...ROW_STROKE, strokeWidth: 1.8 } as const;

/* --- Ряды --- */

/** Пользователи: силуэт. */
export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...ROW_STROKE} cx="12" cy="8.3" r="3.8" />
      <path {...ROW_STROKE} d="M4.8 19.6c0-3.6 3.2-6 7.2-6s7.2 2.4 7.2 6" />
    </svg>
  );
}

/** Отправить сообщение: бумажный самолётик. */
export function PaperPlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M20.3 3.7L3.9 10.4c-.8.3-.8 1.4 0 1.7l6.2 2.1 2.1 6.2c.3.8 1.4.8 1.7 0l6.4-16.7z" />
      <path {...ROW_STROKE} d="M10.1 14.2l4.6-4.6" />
    </svg>
  );
}

/** Заблокировать: перечёркнутый круг. */
export function BlockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...ROW_STROKE} cx="12" cy="12" r="8.2" />
      <path {...ROW_STROKE} d="M6.3 17.7L17.7 6.3" />
    </svg>
  );
}

/** Разблокировать: открытый замок. */
export function UnlockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...ROW_STROKE} x="5" y="11" width="14" height="9.5" rx="2.2" />
      <path {...ROW_STROKE} d="M8.5 11V7.8a3.5 3.5 0 0 1 6.8-1.2" />
    </svg>
  );
}

/** Ответить: стрелка назад-вверх. */
export function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M9.5 6L4 11.5 9.5 17" />
      <path {...ROW_STROKE} d="M4.5 11.5h8.5c4 0 7 2.6 7 7v.5" />
    </svg>
  );
}

/** Добавить: плюс. */
export function PlusRowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M12 5.5v13M5.5 12h13" />
    </svg>
  );
}

/** Приложить фото или видео: фотография с горами. */
export function PhotoIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...ROW_STROKE} x="3.5" y="5" width="17" height="14" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" fill="currentColor" />
      <path {...ROW_STROKE} d="M4 17l4.8-4.3 3.4 3 3-2.6 4.8 4" />
    </svg>
  );
}

/** Вернуться в приложение: стрелка из рамки. */
export function ExitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M13.5 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6.5" />
      <path {...ROW_STROKE} d="M10.5 12H20M16.5 8.5L20 12l-3.5 3.5" />
    </svg>
  );
}

/** Администратор: ключ. */
export function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...ROW_STROKE} cx="8.5" cy="12" r="4" />
      <path {...ROW_STROKE} d="M12.5 12H20.5M17.5 12v3M20.5 12v2.5" />
    </svg>
  );
}

/* --- Карточки показателей --- */

/** Всего пользователей: два силуэта. */
export function UsersStatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STAT_STROKE} cx="9" cy="8.5" r="3.4" />
      <path {...STAT_STROKE} d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path {...STAT_STROKE} d="M15.5 5.3a3.4 3.4 0 0 1 0 6.4M17.5 13.9c2.1.6 3.5 2.4 3.5 5.1" />
    </svg>
  );
}

/** Новые пользователи: силуэт с плюсом. */
export function UserPlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STAT_STROKE} cx="9.5" cy="8.5" r="3.4" />
      <path {...STAT_STROKE} d="M3.5 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
      <path {...STAT_STROKE} d="M18.5 7v6M15.5 10h6" />
    </svg>
  );
}

/** Сейчас в приложении: точка с расходящимися кругами. */
export function OnlineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      <path {...STAT_STROKE} d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path {...STAT_STROKE} d="M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14" />
    </svg>
  );
}

/** Активные за день: солнце. */
export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STAT_STROKE} cx="12" cy="12" r="4" />
      <path
        {...STAT_STROKE}
        d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"
      />
    </svg>
  );
}

/** Активные за неделю: календарь с одной строкой. */
export function WeekIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STAT_STROKE} x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path {...STAT_STROKE} d="M3.5 9.5h17M8 3v4M16 3v4M7 14h10" />
    </svg>
  );
}

/** Активные за месяц: календарь с сеткой дней. */
export function MonthIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STAT_STROKE} x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path {...STAT_STROKE} d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path
        {...STAT_STROKE}
        strokeWidth="2.4"
        d="M8 13.2h.01M12 13.2h.01M16 13.2h.01M8 16.6h.01M12 16.6h.01M16 16.6h.01"
      />
    </svg>
  );
}

/** Возвращаемость (DAU/MAU): замкнутые стрелки. */
export function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STAT_STROKE} d="M4.5 11V9.5a3 3 0 0 1 3-3h11.5M16 3.5l3 3-3 3" />
      <path {...STAT_STROKE} d="M19.5 13v1.5a3 3 0 0 1-3 3H5M8 20.5l-3-3 3-3" />
    </svg>
  );
}

/** Привычек на пользователя: список с галочками. */
export function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STAT_STROKE} d="M4 6.5l1.5 1.5 2.8-3M4 12.5l1.5 1.5 2.8-3M4 18.5l1.5 1.5 2.8-3" />
      <path {...STAT_STROKE} d="M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5" />
    </svg>
  );
}

/** Всего привычек: стопка карточек. */
export function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STAT_STROKE} d="M12 3.8l8.2 4.3-8.2 4.3-8.2-4.3L12 3.8z" />
      <path {...STAT_STROKE} d="M3.8 12.1l8.2 4.3 8.2-4.3M3.8 16.1l8.2 4.3 8.2-4.3" />
    </svg>
  );
}

/* --- Переключатель вида графика --- */

/** Показать таблицей. */
export function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path {...ROW_STROKE} strokeWidth="2.6" d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </svg>
  );
}

/** Показать графиком. */
export function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M4 19.5h16" />
      <path {...ROW_STROKE} d="M5 15.5l4.5-5 3.5 3 6-6.5" />
    </svg>
  );
}
