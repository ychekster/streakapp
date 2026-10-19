/**
 * Кружки участников совместной привычки слева от кнопки отметки (как аватарки группы в
 * Telegram, внахлёст): буква имени; залитый цветом привычки — человек уже выполнил свою
 * часть в день отметки, бледный — ещё нет. Себя здесь нет — моя часть на кнопке. Больше
 * MAX_SHOWN — последним кружком «+N».
 */

import { useStrings } from "../preferences";
import type { GroupMember } from "../types/habit";
import styles from "./GroupFaces.module.css";

const MAX_SHOWN = 3;

/** Первая буква имени (без «@»). */
export function memberInitial(name: string): string {
  return (name.replace(/^@/, "").trim()[0] ?? "?").toUpperCase();
}

interface GroupFacesProps {
  members: readonly GroupMember[];
}

export function GroupFaces({ members }: GroupFacesProps) {
  const strings = useStrings();
  const others = members.filter((member) => !member.is_me);
  const shown = others.length > MAX_SHOWN ? others.slice(0, MAX_SHOWN - 1) : others;
  const rest = others.length - shown.length;
  const done = others.filter((member) => member.done).length;
  return (
    <span className={styles.faces} role="img" aria-label={strings.groupFacesLabel(done, others.length)}>
      {shown.map((member) => (
        <span
          key={member.user_id}
          className={`${styles.face} ${member.done ? styles.done : ""}`}
          aria-hidden="true"
        >
          {memberInitial(member.name)}
        </span>
      ))}
      {rest > 0 ? (
        <span className={`${styles.face} ${styles.more}`} aria-hidden="true">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}
