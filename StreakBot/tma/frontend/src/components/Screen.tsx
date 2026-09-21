/**
 * Каркас экрана: сворачивающаяся шапка с заголовком + содержимое. Учитывает safe
 * area сверху и оставляет место снизу под нижнюю навигацию (таблетку).
 */

import type { ReactNode } from "react";

import { CollapsingHeader } from "./CollapsingHeader";
import styles from "./Screen.module.css";

interface ScreenProps {
  title: string;
  children: ReactNode;
}

export function Screen({ title, children }: ScreenProps) {
  return (
    <main className={styles.screen}>
      <CollapsingHeader title={title} />
      {/* Контент в отдельной обёртке: на неё вешается маска затухания (заголовки — вне её,
          чтобы свёрнутый заголовок Б оставался чётким). См. Screen.module.css. */}
      <div className={styles.content}>{children}</div>
    </main>
  );
}
