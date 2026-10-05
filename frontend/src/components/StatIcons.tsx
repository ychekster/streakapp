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
