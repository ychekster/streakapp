/** Значок › в правой части ряда ListItem, который открывает вложенный экран. */

import styles from "./Disclosure.module.css";

/* Размер (--disclosure-width/height) может менять пропорции значка: viewBox растягивается
   без сохранения пропорций, а толщина линии (--disclosure-stroke) от этого не зависит. При
   размере 8×14 значок совпадает с viewBox один к одному. */
export function Disclosure() {
  return (
    <svg
      className={styles.chevron}
      viewBox="0 0 8 14"
      preserveAspectRatio="none"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.5 1.5L6.5 7l-5 5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
