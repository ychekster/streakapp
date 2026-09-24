/**
 * Значение с выбором из меню — правая часть ряда ListItem, как «Ежедневно ⌃⌄» в iOS:
 * серый текст выбранного варианта и значок ⌃⌄.
 *
 * Сам выбор — нативный <select>, прозрачный и растянутый на весь ряд (ряд ListItem
 * позиционирован): нажатие в любом месте ряда открывает системное меню, а показываем мы
 * только подпись выбранного варианта.
 */

import styles from "./MenuSelect.module.css";

interface MenuOption<T extends string> {
  value: T;
  label: string;
}

interface MenuSelectProps<T extends string> {
  options: readonly MenuOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Доступная подпись (обычно — подпись ряда). */
  label: string;
}

export function MenuSelect<T extends string>({
  options,
  value,
  onChange,
  label,
}: MenuSelectProps<T>) {
  const selected = options.find((option) => option.value === value);
  return (
    <>
      <span className={styles.display}>
        <span className={styles.value}>{selected?.label}</span>
        <svg className={styles.chevron} viewBox="0 0 11 16" fill="none" aria-hidden="true">
          <path
            d="M1.5 5.5L5.5 1.5l4 4M1.5 10.5l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <select
        className={styles.native}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}
