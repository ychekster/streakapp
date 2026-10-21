/**
 * Участники групповой привычки (экран привычки) — как блок аккаунтов в настройках
 * Telegram: круглое фото из Telegram (нет — первая буква имени цветом привычки), @username
 * или имя («Вы» — я), «(владелец)». Справа — как идут дела в день отметки: галочка — свою
 * часть выполнил, у привычки «несколько раз в день» — сколько раз из скольких («3/10»),
 * снежинка — заморожен (тогда его не ждут).
 *
 * Последний ряд — «+ Добавить участника» (как «Add Account»): отправить ссылку-приглашение;
 * он есть у всех участников. Нажатие на участника (любого, себя тоже) открывает его
 * страницу (GroupMemberScreen).
 */

import { type ReactNode, type Ref, useEffect, useState } from "react";

import { memberPhotoUrl, readyMemberPhoto } from "../data/groups";
import { useStrings } from "../preferences";
import type { GroupMember, HabitGroup } from "../types/habit";
import { ListItem } from "./ListItem";
import { Card, Section } from "./Section";
import { SnowflakeIcon } from "./SettingsIcons";
import styles from "./GroupMembers.module.css";

interface GroupMembersProps {
  group: HabitGroup;
  /** Сколько раз в день нужно выполнить привычку. */
  total: number;
  /** Моя часть — моё состояние на устройстве свежее ответа сервера. */
  mineDone: boolean;
  mineCount: number;
  /** Нажатие на участника — открыть его страницу; нет — ряды не нажимаются. */
  onPressMember?: (member: GroupMember) => void;
  /** «Добавить участника»: отправить ссылку-приглашение. */
  onAddMember: () => void;
  /** Подзаголовок «Участники» — якорь заголовка в шапке (блок первый на экране). */
  headingRef?: Ref<HTMLHeadingElement>;
}

/** Первая буква имени (без «@»). */
function initial(name: string): string {
  return (Array.from(name.replace(/^@/, "").trim())[0] ?? "?").toUpperCase();
}

/** Фото участника из Telegram (обычно уже загружено заранее — data/groups.ts), пока не
 *  загрузилось или его нет — буква. Им же — исключённые в «Чёрном списке». */
export function MemberAvatar({
  groupId,
  member,
}: {
  groupId: number;
  member: Pick<GroupMember, "user_id" | "name" | "photo">;
}) {
  const [photo, setPhoto] = useState(() => readyMemberPhoto(member.user_id, member.photo));
  useEffect(() => {
    let current = true;
    void memberPhotoUrl(groupId, member.user_id, member.photo).then((url) => {
      if (current) {
        setPhoto(url);
      }
    });
    return () => {
      current = false;
    };
  }, [groupId, member.user_id, member.photo]);
  if (photo) {
    return <img className={styles.photo} src={photo} alt="" draggable={false} />;
  }
  return <span className={styles.monogram}>{initial(member.name)}</span>;
}

/** Ряды с фото участников — размерами блока «Участники» (и «Чёрного списка»). */
export function MemberRows({ children }: { children: ReactNode }) {
  return <div className={styles.members}>{children}</div>;
}

export function GroupMembers({
  group,
  total,
  mineDone,
  mineCount,
  onPressMember,
  onAddMember,
  headingRef,
}: GroupMembersProps) {
  const strings = useStrings();
  return (
    <Section title={strings.groupMembersHeading} headingRef={headingRef}>
      <div className={styles.members}>
        <Card>
          {group.members.map((member) => {
            const done = member.is_me ? mineDone : member.done;
            const count = Math.min(member.is_me ? mineCount : member.count, total);
            return (
              <ListItem
                key={member.user_id}
                icon={<MemberAvatar groupId={group.id} member={member} />}
                roundIcon
                label={
                  <span className={styles.name}>
                    {member.is_me ? strings.groupMe : member.name}
                    {member.is_owner ? (
                      <span className={styles.owner}> ({strings.groupOwner})</span>
                    ) : null}
                  </span>
                }
                onPress={onPressMember ? () => onPressMember(member) : undefined}
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
                ) : total > 1 ? (
                  <span className={styles.count} aria-label={strings.groupMemberCount(count, total)}>
                    {count}/{total}
                  </span>
                ) : null}
              </ListItem>
            );
          })}
          <ListItem
            icon={<PlusIcon />}
            plainIcon
            accent
            label={strings.groupAddMember}
            onPress={onAddMember}
          />
        </Card>
      </div>
    </Section>
  );
}

/** «+» без плашки (как у «Add Account» в Telegram) — тот же, что у «Новая привычка» на
 *  экране «Добавить привычку». */
function PlusIcon() {
  return (
    <svg className={styles.addIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
