/**
 * Значок «i» в залитом кружке справа от заголовка секции (Section `hint`): нажатие
 * открывает пояснение во всплывающей карточке под заголовком, во всю ширину секции.
 * Закрывается повторным нажатием на значок, нажатием в любом другом месте и Escape.
 */

import { useEffect, useRef, useState } from "react";

import { hapticSelection } from "../telegram/webapp";
import styles from "./InfoTip.module.css";

interface InfoTipProps {
  /** Доступная подпись значка. */
  label: string;
  text: string;
}

export function InfoTip({ label, text }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function outside(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function escape(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={styles.tip}>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          hapticSelection();
          setOpen((shown) => !shown);
        }}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M10 1a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.1a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM8.9 9.3a1.1 1.1 0 0 1 2.2 0v4.8a1.1 1.1 0 0 1-2.2 0Z"
          />
        </svg>
      </button>
      {open ? (
        <span role="tooltip" className={styles.bubble}>
          {text}
        </span>
      ) : null}
    </span>
  );
}
