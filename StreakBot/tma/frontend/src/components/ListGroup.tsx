/** Группа списка в стиле iOS: приглушённый заголовок, белая карточка с рядами и подпись. */

import type { ReactNode } from "react";

import styles from "./ListGroup.module.css";

interface ListGroupProps {
  header?: string;
  footer?: string;
  children: ReactNode;
}

export function ListGroup({ header, footer, children }: ListGroupProps) {
  return (
    <section className={styles.group}>
      {header ? <h2 className={styles.header}>{header}</h2> : null}
      <div className={styles.card}>{children}</div>
      {footer ? <p className={styles.footer}>{footer}</p> : null}
    </section>
  );
}
