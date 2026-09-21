/** Иконки рядов настроек — привычки и приложения (24×24, контур цветом текста — белый в
 *  плашке ListItem). */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Редактировать привычку. */
export function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...STROKE}
        d="M16.9 3.6a2 2 0 0 1 2.8 0l.7.7a2 2 0 0 1 0 2.8L8.5 19 4 20l1-4.5L16.9 3.6z"
      />
      <path {...STROKE} d="M14.5 6l3.5 3.5" />
    </svg>
  );
}

/** Удалить привычку. */
export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M4 7h16" />
      <path {...STROKE} d="M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path {...STROKE} d="M6 7l1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8L18 7" />
      <path {...STROKE} d="M10 11v5.5M14 11v5.5" />
    </svg>
  );
}

/** Часовой пояс. */
export function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="M12 7.5V12l3 2" />
    </svg>
  );
}

/** Язык: глобус с меридианом и экватором. */
export function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <path {...STROKE} d="M12 3.5c2.3 2.3 3.5 5.1 3.5 8.5s-1.2 6.2-3.5 8.5c-2.3-2.3-3.5-5.1-3.5-8.5s1.2-6.2 3.5-8.5z" />
      <path {...STROKE} d="M3.5 12h17" />
    </svg>
  );
}

/** Тема оформления: палитра с красками. */
export function PaletteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...STROKE}
        d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.7-.7 1.7-1.6 0-.5-.2-.8-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7h2.1c2.2 0 4-1.8 4-4C20.5 6.9 16.7 3.5 12 3.5z"
      />
      <circle cx="7.6" cy="11.6" r="1.35" fill="currentColor" />
      <circle cx="9.8" cy="7.7" r="1.35" fill="currentColor" />
      <circle cx="14.3" cy="7.5" r="1.35" fill="currentColor" />
    </svg>
  );
}

/** «Отмечать за вчера»: календарь со стрелкой на день назад. */
export function CalendarBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STROKE} x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path {...STROKE} d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <path {...STROKE} d="M15 15H9.5M11.5 13l-2 2 2 2" />
    </svg>
  );
}

/** Политика конфиденциальности: щит. */
export function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M12 3.5l7 2.8v5.3c0 4.2-2.9 7.6-7 8.9-4.1-1.3-7-4.7-7-8.9V6.3l7-2.8z" />
      <path {...STROKE} d="M9 12l2 2 4-4" />
    </svg>
  );
}

/** Условия использования: документ. */
export function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M13.5 3.5H7.5a1.5 1.5 0 0 0-1.5 1.5v14a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5V8l-4.5-4.5z" />
      <path {...STROKE} d="M13.5 3.5V8H18M9.5 12.5h5M9.5 16h5" />
    </svg>
  );
}
