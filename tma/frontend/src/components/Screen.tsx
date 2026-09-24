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
  /** Экран «въезжает» при открытии (вложенный экран, открытый поверх вкладки). */
  enterAnimation?: boolean;
  children: ReactNode;
}

export function Screen({
  title,
  titleAnchorRef,
  withTabBar = true,
  enterAnimation = false,
  children,
}: ScreenProps) {
  const className = [
    styles.screen,
    withTabBar ? styles.withTabBar : "",
    enterAnimation ? styles.enter : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <main className={className}>
      <CollapsingHeader title={title} anchorRef={titleAnchorRef} />
      {/* Контент в отдельной обёртке (заголовки — вне её): при прокрутке он уходит под
          подложку шапки. См. Screen.module.css. */}
      <div className={styles.content}>{children}</div>
    </main>
  );
}
