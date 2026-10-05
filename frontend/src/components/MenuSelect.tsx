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
        {/* iOS 26 ⌃⌄ (chevron.up.chevron.down), traced from the reference at 3×: the
            viewBox is in its pixels — 26×38, two 45° chevrons, a 1.5pt line. */}
        <svg className={styles.chevron} viewBox="0 0 26 38" fill="none" aria-hidden="true">
          <path
            d="M2.75 13 13 2.75 23.25 13M2.75 25 13 35.25 23.25 25"
            stroke="currentColor"
            strokeWidth="4.5"
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
