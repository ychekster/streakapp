/**
 * Путь с сайта → шаг: кто дошёл до него и дальше не пошёл (на первом шаге — кто ушёл со
 * страницы, никуда не нажав), последние сначала. У человека — имя (или «Без аккаунта» и
 * устройство) и его последний шаг с датой. Нажатие — профиль, если аккаунт есть (его лента
 * идёт с первого клика), иначе путь устройства (AdminVisitorScreen).
 */

import { fetchJourneyStuck } from "../../api/admin";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { useResource } from "../../hooks/useResource";
import type { JourneyPerson } from "../../types/admin";
import { useAdminFormat } from "../adminFormat";
import { useAdminStrings } from "../adminStrings";
import type { JourneyQuery } from "../components/JourneySection";
import styles from "../components/UserTimeline.module.css";

interface AdminJourneyScreenProps {
  query: JourneyQuery;
  onOpenUser: (telegramId: number) => void;
  onOpenVisitor: (anonId: string) => void;
}

export function AdminJourneyScreen({ query, onOpenUser, onOpenVisitor }: AdminJourneyScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const people = useResource(
    () => fetchJourneyStuck(query.days, query.path, query.step),
    JSON.stringify(query),
  );

  const who = (person: JourneyPerson): string => {
    const device = person.platform ? (strings.an.devices[person.platform] ?? person.platform) : null;
    return person.name ?? [strings.journeyNoAccount, device].filter(Boolean).join(", ");
  };

  return (
    <Screen title={query.title} withTabBar={false} enterAnimation>
      <Section>
        <Card>
          {!people.data ? (
            <ListItem label={people.status === "error" ? strings.journeyLoadFailed : strings.loading} />
          ) : people.data.length === 0 ? (
            <ListItem label={strings.journeyNobody} />
          ) : (
            people.data.map((person, index) => {
              const open =
                person.user_id !== null
                  ? () => onOpenUser(person.user_id as number)
                  : person.anon_id !== null
                    ? () => onOpenVisitor(person.anon_id as string)
                    : undefined;
              return (
                <ListItem key={`${person.user_id ?? person.anon_id}-${index}`} alignTop onPress={open}>
                  <span className={styles.item}>
                    <span className={styles.text}>{who(person)}</span>
                    <span className={styles.time}>
                      {strings.journeyLast(
                        strings.webFunnelSteps[person.last_event] ?? person.last_event,
                        format.dateTime(person.last_at),
                      )}
                    </span>
                  </span>
                  {open ? <Disclosure /> : null}
                </ListItem>
              );
            })
          )}
        </Card>
      </Section>
    </Screen>
  );
}
