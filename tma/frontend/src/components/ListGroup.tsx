/**
 * Группа списка в стиле iOS: белая карточка с рядами и необязательная приглушённая
 * подпись под ней — пояснение к рядам (как «Синхронизация iCloud» в «Настройках» iOS).
 * Соседние группы разделены отступом, заголовков над карточками нет.
 */

import type { ReactNode } from "react";

import styles from "./ListGroup.module.css";

interface ListGroupProps {
  footer?: string;
  children: ReactNode;
}

export function ListGroup({ footer, children }: ListGroupProps) {
  return (
    <section className={styles.group}>
      <div className={styles.card}>{children}</div>
      {footer ? <p className={styles.footer}>{footer}</p> : null}
    </section>
  );
}
