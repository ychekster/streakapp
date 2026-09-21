/**
 * Секция экрана привычки и формы привычки: заголовок капсом (приглушённый, вровень с
 * краем карточки) и содержимое под ним. Соседние секции разделены отступом.
 *
 * `Card` — белая карточка секции; `padded` добавляет горизонтальный отступ (карточка
 * привычки — вертикальный отступ задаёт сам блок привычки). Ряды списка (ListItem)
 * задают отступы сами, поэтому им `padded` не нужен.
 */

import type { ReactNode, Ref } from "react";

import styles from "./Section.module.css";

interface SectionProps {
  title: string;
  /** Ссылка на заголовок (якорь сворачивающейся шапки, см. CollapsingHeader). */
  headingRef?: Ref<HTMLHeadingElement>;
  children: ReactNode;
}

export function Section({ title, headingRef, children }: SectionProps) {
  return (
    <section className={styles.section}>
      <h2 ref={headingRef} className={styles.heading}>
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
