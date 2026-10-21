/**
 * «Чёрный список» групповой привычки (только владелец) — как «Заблокированные» в
 * настройках Telegram: заголовок сразу по центру шапки (Screen `pinnedTitle`), под ним
 * карточка исключённых — фото из Telegram (или буква) и имя. Исключённый попадает сюда
 * сам (GroupMemberScreen → «Исключить участника») и, пока он здесь, не может вступить по
 * ссылке-приглашению. Нажатие на человека спрашивает системным диалогом, убрать ли его из
 * списка; после — по ссылке он снова может вступить (со своей прежней историей).
 *
 * Список приходит вместе с привычкой (`group.banned`, POST /sync), поэтому экран
 * открывается сразу целиком. «Назад» — к экрану привычки (App).
 */

import { useRef } from "react";

import { MemberAvatar, MemberRows } from "../components/GroupMembers";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { reportGroupError, unbanFromShared } from "../data/groups";
import { useStrings } from "../preferences";
import { confirmAction, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { BannedMember, Habit, HabitGroup } from "../types/habit";
import styles from "./GroupBlockedScreen.module.css";

interface GroupBlockedScreenProps {
  /** Групповая привычка (моя): её цвет — у букв вместо фото. */
  habit: Habit;
  group: HabitGroup;
  /** Войти через Telegram (веб-приложение): групповые привычки — только с ним. */
  onLinkTelegram: () => void;
}

export function GroupBlockedScreen({ habit, group, onLinkTelegram }: GroupBlockedScreenProps) {
  const strings = useStrings();
  const busy = useRef(false);
  const banned = group.banned ?? [];

  async function askToUnban(member: BannedMember): Promise<void> {
    const confirmed = await confirmAction({
      title: strings.unbanDialogTitle,
      message: strings.unbanDialogMessage(member.name),
      confirmLabel: strings.unbanDialogConfirm,
      cancelLabel: strings.groupDialogCancel,
    });
    if (!confirmed || busy.current) {
      return;
    }
    busy.current = true;
    try {
      await unbanFromShared(group.id, member.user_id);
      hapticNotification("success");
    } catch (error) {
      hapticNotification("error");
      await reportGroupError(error, strings, onLinkTelegram);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Screen title={strings.blockedTitle} withTabBar={false} enterAnimation pinnedTitle>
      <div className={styles.list} style={habitColorStyle(habit.color)}>
        {banned.length > 0 ? (
          <Section variant="form" footer={strings.blockedFooter}>
            <MemberRows>
              <Card>
                {banned.map((member) => (
                  <ListItem
                    key={member.user_id}
                    icon={<MemberAvatar groupId={group.id} member={member} />}
                    roundIcon
                    label={<span className={styles.name}>{member.name}</span>}
                    onPress={() => void askToUnban(member)}
                  />
                ))}
              </Card>
            </MemberRows>
          </Section>
        ) : (
          <p className={styles.empty}>{strings.blockedEmpty}</p>
        )}
      </div>
    </Screen>
  );
}
