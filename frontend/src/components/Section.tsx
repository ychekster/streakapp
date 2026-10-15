/**
 * Секция экрана привычки и формы привычки: приглушённый заголовок и содержимое под ним.
 * Соседние секции разделены отступом. Вид заголовка (`variant`):
 *  - `screen` — капсом, вровень с краем карточки (экран привычки);
 *  - `form` — как написан, с заглавной буквы, и сдвинут вправо до конца скругления
 *    карточки (форма привычки, как в эталоне). Шрифт у обоих одинаковый.
 *
 * Под содержимым может стоять приглушённое пояснение (`footer`), как под группой списка,
 * а справа от заголовка — действие (`action`, «Изменить» у списка папок).
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
  /** Пояснение под содержимым. */
  footer?: ReactNode;
  /** Кнопка справа от заголовка. */
  action?: ReactNode;
  children: ReactNode;
}

export function Section({
  title,
  variant = "screen",
  headingRef,
  footer,
  action,
  children,
}: SectionProps) {
  const heading = (
    <h2 ref={headingRef} className={`${styles.heading} ${styles[variant]}`}>
      {title}
    </h2>
  );
  return (
    <section className={styles.section}>
      {action ? (
        <div className={styles.headingRow}>
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
      {footer ? <p className={styles.footer}>{footer}</p> : null}
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
