/**
 * Ряд списка iOS. С `label` — ведущая подпись слева и ведомый контент справа
 * (значение или контрол). Без `label` — `children` занимают весь ряд (напр. поле
 * ввода). С `onPress` ряд становится нажимаемой кнопкой. Соседние ряды внутри одной
 * карточки разделяются тонкой линией со сдвигом слева.
 */

import type { ReactNode } from "react";

import styles from "./ListItem.module.css";

interface ListItemProps {
  label?: ReactNode;
  children?: ReactNode;
  onPress?: () => void;
  /** Выровнять содержимое по верху (для многострочных рядов). */
  alignTop?: boolean;
}

export function ListItem({ label, children, onPress, alignTop = false }: ListItemProps) {
  const className = [
    styles.row,
    alignTop ? styles.alignTop : "",
    onPress ? styles.pressable : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content =
    label != null ? (
      <>
        <span className={styles.label}>{label}</span>
        <span className={styles.trailing}>{children}</span>
      </>
    ) : (
      children
    );

  if (onPress) {
    return (
      <button type="button" className={className} onClick={onPress}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}
