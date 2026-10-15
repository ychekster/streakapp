/**
 * Каркас экрана: сворачивающаяся шапка с заголовком + содержимое. Учитывает safe
 * area сверху и оставляет место снизу под нижнюю навигацию (таблетку), если она есть.
 */

import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  CollapsingHeader,
  SCROLL_RESTORED_EVENT,
  type ScrollRestoredDetail,
} from "./CollapsingHeader";
import styles from "./Screen.module.css";

interface ScreenProps {
  title: string;
  /** Элемент в потоке вместо крупного заголовка (см. CollapsingHeader). */
  titleAnchorRef?: RefObject<HTMLElement>;
  /** Заголовок сразу маленький, по центру шапки (см. CollapsingHeader, `pinned`). */
  pinnedTitle?: boolean;
  /** Видна ли нижняя навигация — под неё резервируется место снизу. */
  withTabBar?: boolean;
  /**
   * Экран «въезжает» при открытии (вложенный экран, открытый поверх вкладки). При
   * возврате на него «Назад» — нет: он сразу стоит на месте, с шапкой на своей позиции
   * прокрутки (иначе transform анимации на миг уводил бы фиксированную шапку).
   */
  enterAnimation?: boolean;
  children: ReactNode;
}

export function Screen({
  title,
  titleAnchorRef,
  pinnedTitle = false,
  withTabBar = true,
  enterAnimation = false,
  children,
}: ScreenProps) {
  const [entering, setEntering] = useState(enterAnimation);
  const stopListening = useRef<(() => void) | null>(null);

  // Возврат «Назад» App сообщает в том же коммите, что и монтирование экрана (событие
  // прокрутки, см. App, pendingScroll), — анимация снимается до первой отрисовки.
  // Слушаем только этот коммит: потом событие относится уже к другим переходам.
  useLayoutEffect(() => {
    if (!enterAnimation) {
      return undefined;
    }
    const onRestored = (event: Event): void => {
      if ((event as CustomEvent<ScrollRestoredDetail | null>).detail?.back) {
        setEntering(false);
      }
    };
    window.addEventListener(SCROLL_RESTORED_EVENT, onRestored);
    const unsubscribe = (): void =>
      window.removeEventListener(SCROLL_RESTORED_EVENT, onRestored);
    stopListening.current = unsubscribe;
    return unsubscribe;
    // Только при монтировании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    stopListening.current?.();
    stopListening.current = null;
  }, []);

  const className = [
    styles.screen,
    withTabBar ? styles.withTabBar : "",
    entering ? styles.enter : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <main className={className}>
      <CollapsingHeader title={title} anchorRef={titleAnchorRef} pinned={pinnedTitle} />
      {/* Контент в отдельной обёртке (заголовки — вне её): при прокрутке он уходит под
          подложку шапки. См. Screen.module.css. */}
      {/* Метка data-screen-content — контент под крупным заголовком (у экрана с якорем
          или с заголовком по центру его нет): по ней подзаголовок или поиск первым в
          контенте берут прежний отступ. */}
      <div
        className={styles.content}
        data-screen-content={titleAnchorRef || pinnedTitle ? undefined : ""}
      >
        {children}
      </div>
    </main>
  );
}
