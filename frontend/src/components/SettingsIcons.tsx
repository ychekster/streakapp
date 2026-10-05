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

/** Написать отзыв: звезда. */
export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...STROKE}
        d="M12 3.8l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8L12 3.8z"
      />
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

/** Админ-панель: ползунки регулировки. */
export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle {...STROKE} cx="15" cy="7" r="2.2" />
      <circle {...STROKE} cx="9" cy="17" r="2.2" />
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

/** Аккаунт (web app). */
export function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="8.5" r="3.5" />
      <path {...STROKE} d="M5 19.5c1.2-3.4 3.8-5 7-5s5.8 1.6 7 5" />
    </svg>
  );
}

/** Установить на рабочий стол. */
export function InstallIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STROKE} x="6" y="3" width="12" height="18" rx="2.5" />
      <path {...STROKE} d="M12 8v6M9.5 11.5 12 14l2.5-2.5" />
    </svg>
  );
}

/** Уведомления: залитый колокольчик, как bell.fill в «Настройках» iOS. */
export function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.8a1.4 1.4 0 0 0-1.4 1.4v.35C7.95 5.2 6.2 7.6 6.2 10.5v3.7c0 .75-.3 1.47-.83 2l-.85.85c-.55.55-.16 1.5.62 1.5h13.72c.78 0 1.17-.95.62-1.5l-.85-.85a2.83 2.83 0 0 1-.83-2v-3.7c0-2.9-1.75-5.3-4.4-5.95V4.2A1.4 1.4 0 0 0 12 2.8z"
      />
      <path fill="currentColor" d="M9.55 19.55a2.5 2.5 0 0 0 4.9 0z" />
    </svg>
  );
}

/** Напоминание «Пора отметить привычки»: будильник. */
export function AlarmIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="13" r="7.5" />
      <path {...STROKE} d="M12 9v4l2.5 1.5" />
      <path {...STROKE} d="M4 5.5 6.5 3M20 5.5 17.5 3" />
    </svg>
  );
}
