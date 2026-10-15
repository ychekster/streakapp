/**
 * Папки над списком привычек — вкладки в одной плоской таблетке, как папки чатов в
 * Telegram на iOS 26. Цвет таблетки, подложка выбранной вкладки и её переезд — как у
 * нижней навигации (TabBar), а заметность — как у карточки привычек (её тень); вкладки —
 * по ширине своих названий, слева направо, а если не заполняют таблетку — свободное место
 * делится между ними поровну. Не помещаются — лента прокручивается вбок в
 * пределах подложки (уходящая вкладка обрезается её краем), а выбранная вкладка доезжает
 * до видимой части.
 *
 * Показывается, только когда у пользователя есть папки (Настройки → «Папки»); одна из
 * вкладок — «Все привычки».
 */

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";

import styles from "./FolderBar.module.css";

export interface FolderTab {
  key: string;
  label: string;
}

interface FolderBarProps {
  tabs: readonly FolderTab[];
  active: string;
  onSelect: (key: string) => void;
}

/** Положение подложки на ленте вкладок, px. */
interface Thumb {
  x: number;
  width: number;
}

export function FolderBar({ tabs, active, onSelect }: FolderBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);
  // Первое положение подложки ставится без анимации — иначе она въехала бы с края.
  const [animated, setAnimated] = useState(false);
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.key === active));

  // Подложка — под выбранной вкладкой: измеряется до отрисовки и заново при изменении
  // размеров (поворот экрана, другие названия).
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) {
      return;
    }
    const tabElements = [...track.querySelectorAll<HTMLElement>("[role=tab]")];
    const measure = (): void => {
      const tab = tabElements[activeIndex];
      if (tab) {
        setThumb({ x: tab.offsetLeft, width: tab.offsetWidth });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    tabElements.forEach((tab) => observer.observe(tab));
    return () => observer.disconnect();
  }, [activeIndex, tabs]);

  useLayoutEffect(() => {
    if (thumb && !animated) {
      const frame = requestAnimationFrame(() => setAnimated(true));
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [thumb, animated]);

  // Выбранная вкладка за краем ленты — лента доезжает до неё.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const tab = track?.querySelectorAll<HTMLElement>("[role=tab]")[activeIndex];
    if (!track || !tab) {
      return;
    }
    const left = tab.offsetLeft - track.scrollLeft;
    const right = left + tab.offsetWidth;
    if (left < 0 || right > track.clientWidth) {
      track.scrollTo({
        left: tab.offsetLeft - (track.clientWidth - tab.offsetWidth) / 2,
        behavior: animated ? "smooth" : "auto",
      });
    }
    // Только при смене вкладки.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const thumbStyle = thumb
    ? ({ width: `${thumb.width}px`, transform: `translateX(${thumb.x}px)` } as CSSProperties)
    : undefined;

  return (
    <div className={styles.bar}>
      <div ref={trackRef} className={styles.track} role="tablist">
        {thumb ? (
          <span
            className={`${styles.thumb} ${animated ? styles.animated : ""}`}
            style={thumbStyle}
            aria-hidden="true"
          />
        ) : null}
        {tabs.map((tab) => {
          const selected = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={styles.tab}
              onClick={() => onSelect(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
