/**
 * Ряд списка iOS. С `label` — ведущая подпись слева и ведомый контент справа
 * (значение или контрол). Без `label` — `children` занимают весь ряд (напр. поле
 * ввода). С `icon` слева стоит цветная плашка с иконкой (как в «Настройках» iOS).
 * С `onPress` ряд становится нажимаемой кнопкой. Соседние ряды внутри одной
 * карточки разделяются тонкой линией, которая начинается от текста.
 */

import type { ReactNode } from "react";

import styles from "./ListItem.module.css";

interface ListItemProps {
  label?: ReactNode;
  children?: ReactNode;
  /** Иконка в цветной плашке слева от подписи. */
  icon?: ReactNode;
  /** Деструктивное действие (удаление): подпись и плашка иконки — красные. */
  destructive?: boolean;
  onPress?: () => void;
  /** Выровнять содержимое по верху (для многострочных рядов). */
  alignTop?: boolean;
}

export function ListItem({
  label,
  children,
  icon,
  destructive = false,
  onPress,
  alignTop = false,
}: ListItemProps) {
  const className = [
    styles.row,
    alignTop ? styles.alignTop : "",
    icon ? styles.withIcon : "",
    destructive ? styles.destructive : "",
    onPress ? styles.pressable : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label != null ? (
        <>
          <span className={styles.label}>{label}</span>
          <span className={styles.trailing}>{children}</span>
        </>
      ) : (
        children
      )}
    </>
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
