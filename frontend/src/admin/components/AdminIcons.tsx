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

/** Открыли приложение: телефон. */
export function AppIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STAT_STROKE} x="6.5" y="2.8" width="11" height="18.4" rx="2.6" />
      <path {...STAT_STROKE} d="M10.5 18h3" />
    </svg>
  );
}

/** Фильтры: три линии, каждая короче предыдущей (кнопка «Фильтры», 20×20). */
export function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...ROW_STROKE} d="M4 7h16M7 12h10M10 17h4" />
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
