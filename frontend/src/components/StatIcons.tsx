/** Иконки показателей привычки (24×24, контур цветом текста — см. StatCard). */

const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/** Текущая серия. */
export function FlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        {...STROKE}
        d="M12 3C13 6.5 17.5 8.5 17.5 14.5A5.5 5.5 0 0 1 6.5 14.5C6.5 12 8 10.5 9 9.5C9 11.3 9.8 12.5 11 13C10.5 9.5 11 6 12 3Z"
      />
    </svg>
  );
}

/** Лучшая серия. */
export function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4z" />
      <path {...STROKE} d="M7.5 6H5v1a3 3 0 0 0 3 3M16.5 6H19v1a3 3 0 0 1-3 3" />
      <path {...STROKE} d="M12 13.5V17M9.5 17h5l.5 3.5H9z" />
    </svg>
  );
}

/** Всего выполнено. */
export function CompletedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Цель серии. */
export function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="12" r="8.5" />
      <circle {...STROKE} cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** Всего времени («Цель по времени»): секундомер. */
export function StopwatchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle {...STROKE} cx="12" cy="13.5" r="7" />
      <path {...STROKE} d="M12 13.5V10M10 3.5h4M12 3.5v3" />
    </svg>
  );
}

/** Всего повторений (несколько раз в день): стрелки по кругу. */
export function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M5 11a7 7 0 0 1 12.2-4.7L19 8M19 4v4h-4" />
      <path {...STROKE} d="M19 13a7 7 0 0 1-12.2 4.7L5 16M5 20v-4h4" />
    </svg>
  );
}

/** График: календарь. */
export function ScheduleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect {...STROKE} x="4" y="5.5" width="16" height="14.5" rx="2.5" />
      <path {...STROKE} d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

/** Пропущено: крестик. */
export function MissedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M7 7l10 10M17 7L7 17" />
    </svg>
  );
}

/** Не запланировано, не отмечено: черта. */
export function RestIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path {...STROKE} d="M7 12h10" />
    </svg>
  );
}
