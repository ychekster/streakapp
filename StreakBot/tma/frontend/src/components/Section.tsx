/**
 * Секция экрана привычки и формы привычки: приглушённый заголовок и содержимое под ним.
 * Соседние секции разделены отступом. Вид заголовка (`variant`):
 *  - `screen` — капсом, вровень с краем карточки (экран привычки);
 *  - `form` — как написан, с заглавной буквы, и сдвинут вправо до конца скругления
 *    карточки (форма привычки, как в эталоне). Шрифт у обоих одинаковый.
 *
 * `Card` — белая карточка секции; `padded` добавляет горизонтальный отступ (карточка
 * привычки — вертикальный отступ задаёт сам блок привычки). Ряды списка (ListItem)
 * задают отступы сами, поэтому им `padded` не нужен.
 */

import type { ReactNode, Ref } from "react";

import styles from "./Section.module.css";

interface SectionProps {
  title: string;
  variant?: "screen" | "form";
  /** Ссылка на заголовок (якорь сворачивающейся шапки, см. CollapsingHeader). */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

export function Section({ title, variant = "screen", headingRef, children }: SectionProps) {
  return (
    <section className={styles.section}>
      <h2 ref={headingRef} className={`${styles.heading} ${styles[variant]}`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

interface CardProps {
  padded?: boolean;
  children: ReactNode;
}

export function Card({ padded = false, children }: CardProps) {
  return <div className={`${styles.card} ${padded ? styles.padded : ""}`}>{children}</div>;
}
