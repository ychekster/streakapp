/**
 * Каркас экрана: сворачивающаяся шапка с заголовком + содержимое. Учитывает safe
 * area сверху и оставляет место снизу под нижнюю навигацию (таблетку), если она есть.
 */

import type { ReactNode, RefObject } from "react";

import { CollapsingHeader } from "./CollapsingHeader";
import styles from "./Screen.module.css";

interface ScreenProps {
  title: string;
  /** Элемент в потоке вместо крупного заголовка (см. CollapsingHeader). */
  titleAnchorRef?: RefObject<HTMLElement>;
  /** Видна ли нижняя навигация — под неё резервируется место снизу. */
  withTabBar?: boolean;
  children: ReactNode;
}

export function Screen({
  title,
  titleAnchorRef,
  withTabBar = true,
  children,
}: ScreenProps) {
  return (
    <main className={`${styles.screen} ${withTabBar ? styles.withTabBar : ""}`}>
      <CollapsingHeader title={title} anchorRef={titleAnchorRef} />
      {/* Контент в отдельной обёртке (заголовки — вне её): при прокрутке он уходит под
          подложку шапки. См. Screen.module.css. */}
      <div className={styles.content}>{children}</div>
    </main>
  );
}
