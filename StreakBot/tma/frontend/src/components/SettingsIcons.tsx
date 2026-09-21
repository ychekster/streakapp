/** Иконки рядов настроек привычки (24×24, контур цветом текста — белый в плашке ListItem). */

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
