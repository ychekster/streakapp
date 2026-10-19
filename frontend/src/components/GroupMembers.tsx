/**
 * Участники совместной привычки (экран привычки): кружок с первой буквой имени цветом
 * привычки, @username или имя («Вы» — я), «владелец»; справа — галочка, если человек уже
 * выполнил свою часть в день отметки, или снежинка, если он заморожен (тогда его не ждут).
 *
 * Владелец может нажать на участника — App спросит, исключить ли его.
 */

import { useStrings } from "../preferences";
import type { GroupMember, HabitGroup } from "../types/habit";
import { ListItem } from "./ListItem";
import { Card, Section } from "./Section";
import { SnowflakeIcon } from "./SettingsIcons";
import styles from "./GroupMembers.module.css";

interface GroupMembersProps {
  group: HabitGroup;
  /** Выполнил ли свою часть я — моё состояние на устройстве свежее ответа сервера. */
  mineDone: boolean;
  /** Нажатие на участника (только у владельца, не на себя). */
  onPressMember?: (member: GroupMember) => void;
}

/** Первая буква имени (без «@»). */
function initial(name: string): string {
  return (name.replace(/^@/, "").trim()[0] ?? "?").toUpperCase();
}

export function GroupMembers({ group, mineDone, onPressMember }: GroupMembersProps) {
  const strings = useStrings();
  return (
    <Section title={strings.groupMembersHeading}>
      <Card>
        {group.members.map((member) => {
          const done = member.is_me ? mineDone : member.done;
          const pressable = onPressMember && group.is_owner && !member.is_me;
          return (
            <ListItem
              key={member.user_id}
              icon={<span className={styles.monogram}>{initial(member.name)}</span>}
              roundIcon
              label={
                <span className={styles.name}>
                  {member.is_me ? strings.groupMe : member.name}
                  {member.is_owner ? (
                    <span className={styles.owner}> · {strings.groupOwner}</span>
                  ) : null}
                </span>
              }
              onPress={pressable ? () => onPressMember(member) : undefined}
            >
              {member.frozen ? (
                <span className={styles.frozen} aria-label={strings.groupMemberFrozen}>
                  <SnowflakeIcon />
                </span>
              ) : done ? (
                <svg
                  className={styles.check}
                  viewBox="0 0 24 24"
                  fill="none"
                  role="img"
                  aria-label={strings.groupMemberDone}
                >
                  <path
                    d="M5 12.75l4.5 4.5L19 7.75"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </ListItem>
          );
        })}
      </Card>
    </Section>
  );
}
