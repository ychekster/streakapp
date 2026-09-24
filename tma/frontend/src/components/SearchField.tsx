/**
 * Поле поиска в стиле iOS 26: серая капсула с лупой, а когда в поле есть текст —
 * с кнопкой-крестиком, которая его стирает. «Найти» на клавиатуре просто её убирает:
 * результаты фильтруются на ходу.
 */

import styles from "./SearchField.module.css";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Доступная подпись кнопки-крестика. */
  clearLabel: string;
}

export function SearchField({ value, onChange, placeholder, clearLabel }: SearchFieldProps) {
  return (
    <div className={styles.field}>
      <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2.2" />
        <path d="M15.5 15.5l5 5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <input
        className={styles.input}
        type="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className={styles.clear}
          aria-label={clearLabel}
          // Клавиатура не прячется: фокус остаётся в поле.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange("")}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="10" cy="10" r="10" fill="currentColor" />
            <path className={styles.cross} d="M6.8 6.8l6.4 6.4M13.2 6.8l-6.4 6.4" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
