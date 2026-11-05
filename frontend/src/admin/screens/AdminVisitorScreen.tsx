/**
 * Путь посетителя: все шаги устройства с самого начала (открыл страницу, выбрал «Установить»,
 * экран установки…), с устройством, браузером и меткой ссылки. Если аккаунт уже есть —
 * «Открыть профиль» (там лента идёт дальше, по действиям в приложении).
 */

import { fetchVisitor } from "../../api/admin";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { useResource } from "../../hooks/useResource";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import { describeEvent } from "../components/UserTimeline";
import styles from "../components/UserTimeline.module.css";

interface AdminVisitorScreenProps {
  anonId: string;
  onOpenUser: (telegramId: number) => void;
}

export function AdminVisitorScreen({ anonId, onOpenUser }: AdminVisitorScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const visitor = useResource(() => fetchVisitor(anonId), anonId);
  const data = visitor.data;
  const userId = data?.user_id ?? null;

  return (
    <Screen title={data?.name ?? strings.visitorTitle} withTabBar={false} enterAnimation>
      {data ? (
        <Section footer={userId === null ? strings.visitorNoAccount : undefined}>
          {userId !== null ? (
            <Card>
              <ListItem label={strings.visitorOpenProfile} accent onPress={() => onOpenUser(userId)}>
                <Disclosure />
              </ListItem>
            </Card>
          ) : null}
        </Section>
      ) : null}
      <Section title={strings.an.timelineHeading}>
        <Card>
          {!data ? (
            <ListItem label={visitor.status === "error" ? strings.visitorLoadFailed : strings.loading} />
          ) : data.items.length === 0 ? (
            <ListItem label={strings.an.timelineEmpty} />
          ) : (
            data.items.map((item, index) => (
              <ListItem key={`${item.at}-${item.kind}-${index}`} alignTop>
                <span className={styles.item}>
                  <span className={styles.text}>{describeEvent(item, strings)}</span>
                  <span className={styles.time}>{format.dateTime(item.at)}</span>
                </span>
              </ListItem>
            ))
          )}
        </Card>
      </Section>
    </Screen>
  );
}
