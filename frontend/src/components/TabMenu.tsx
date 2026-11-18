/**
 * Меню вкладки таблетки папок (FolderBar): удержание вкладки открывает под ней меню, как
 * меню папки чатов в Telegram на iOS 26. Матовая карточка со скруглением, ряды «значок и
 * название», опасный ряд красный; черта отделяет «Изменить порядок» от остальных.
 *
 * Меню стоит под вкладкой, по её центру; у края экрана места не хватает — сдвигается к
 * середине экрана, оставляя поле EDGE_PX (внизу места мало — над вкладкой). Появляется
 * из точки под вкладкой. Нажатие мимо меню закрывает его
 * (это нажатие ничего больше не делает), нажатие ряда закрывает и выполняет действие.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { hapticSelection } from "../telegram/webapp";
import styles from "./TabMenu.module.css";

export interface TabMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** Красный (удаление). */
  destructive?: boolean;
  /** Черта над рядом. */
  separated?: boolean;
  onSelect: () => void;
}

interface TabMenuProps {
  /** Где вкладка на экране (getBoundingClientRect). */
  anchor: DOMRect;
  items: readonly TabMenuItem[];
  onClose: () => void;
}

/** Поля меню от края экрана и зазор до вкладки (px). */
const EDGE_PX = 12;
const GAP_PX = 8;

export function TabMenu({ anchor, items, onClose }: TabMenuProps) {
  const card = useRef<HTMLDivElement>(null);
  // До замера меню невидимо: сначала встаёт на место, потом появляется.
  const [place, setPlace] = useState<{ left: number; top: number; origin: string } | null>(null);

  // Меню измерено — встаёт в пределы экрана. Размер — offsetWidth / offsetHeight: в них
  // нет масштаба анимации появления (getBoundingClientRect дал бы уменьшенный).
  useLayoutEffect(() => {
    const element = card.current;
    if (!element) {
      return;
    }
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const screenWidth = document.documentElement.clientWidth;
    const screenHeight = window.visualViewport?.height ?? window.innerHeight;
    const center = anchor.left + anchor.width / 2;
    const left = Math.max(EDGE_PX, Math.min(center - width / 2, screenWidth - width - EDGE_PX));
    const below = anchor.bottom + GAP_PX;
    const above = below + height > screenHeight - EDGE_PX;
    // Появляется из точки под центром вкладки (в пределах меню).
    const originX = Math.max(0, Math.min(width, center - left));
    setPlace({
      left,
      top: above ? Math.max(EDGE_PX, anchor.top - GAP_PX - height) : below,
      origin: `${originX}px ${above ? "100%" : "0"}`,
    });
  }, [anchor]);

  return createPortal(
    <div
      className={styles.layer}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        ref={card}
        className={`${styles.menu} ${place ? styles.placed : ""}`}
        style={
          place
            ? { left: place.left, top: place.top, transformOrigin: place.origin }
            : { left: 0, top: 0 }
        }
        role="menu"
      >
        {items.map((item) => (
          <div key={item.key}>
            {item.separated ? <div className={styles.separator} aria-hidden="true" /> : null}
            <button
              type="button"
              role="menuitem"
              className={`${styles.item} ${item.destructive ? styles.destructive : ""}`}
              onClick={() => {
                hapticSelection();
                onClose();
                item.onSelect();
              }}
            >
              <span className={styles.icon} aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </button>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

// --- Значки рядов: линии, как у меню Telegram ---

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Квадрат с карандашом: «Изменить». */
export function EditMenuIcon() {
  return (
    <Icon>
      <path d="M11 4.5H7a2.5 2.5 0 0 0-2.5 2.5v10A2.5 2.5 0 0 0 7 19.5h10a2.5 2.5 0 0 0 2.5-2.5v-4" />
      <path d="M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7L12.5 14.4 9 15l.6-3.5z" />
    </Icon>
  );
}

/** Плюс: «Новая привычка». */
export function AddMenuIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Стрелка из коробки: «Экспортировать». */
export function ExportMenuIcon() {
  return (
    <Icon>
      <path d="M12 14.5V3.5M8 7.5l4-4 4 4" />
      <path d="M8.5 10.5H7A2.5 2.5 0 0 0 4.5 13v4.5A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5V13a2.5 2.5 0 0 0-2.5-2.5h-1.5" />
    </Icon>
  );
}

/** Стрелка в коробку: «Импортировать». */
export function ImportMenuIcon() {
  return (
    <Icon>
      <path d="M12 3.5v11M8 10.5l4 4 4-4" />
      <path d="M8.5 10.5H7A2.5 2.5 0 0 0 4.5 13v4.5A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5V13a2.5 2.5 0 0 0-2.5-2.5h-1.5" />
    </Icon>
  );
}

/** Корзина: «Удалить». */
export function DeleteMenuIcon() {
  return (
    <Icon>
      <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="M6.5 6.5l.8 11.6A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.9l.8-11.6M10 10.5v5.5M14 10.5v5.5" />
    </Icon>
  );
}

/** Вкладки со стрелкой: «Изменить порядок». */
export function ReorderMenuIcon() {
  return (
    <Icon>
      <rect x="3.5" y="14" width="4.5" height="5" rx="1.5" />
      <rect x="9.75" y="14" width="4.5" height="5" rx="1.5" />
      <rect x="16" y="14" width="4.5" height="5" rx="1.5" />
      <path d="M7 10.5V8a3 3 0 0 1 3-3h7.5M15 2.5 17.5 5 15 7.5" />
    </Icon>
  );
}
