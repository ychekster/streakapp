/**
 * Люди за цифрой аналитики — экран поверх вкладки. При открытии сервер собирает список
 * этих людей группой (POST /admin/segments, на момент нажатия) — дальше экран показывает
 * её как список пользователей (фильтр «segment:<id>»), а «Рассылка этим людям» открывает
 * вкладку «Рассылка» уже с этой группой получателей.
 *
 * Нажатие на человека — его профиль (сводка, лента действий, личное сообщение).
 */

import { createSegment, fetchUsers } from "../../api/admin";
import { rememberSegment } from "../audience";
import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { PaperPlaneIcon } from "../components/AdminIcons";
import { LoadMore } from "../components/LoadMore";
import { Disclosure } from "../../components/Disclosure";
import { ListItem } from "../../components/ListItem";
import { Screen } from "../../components/Screen";
import { Card, Section } from "../../components/Section";
import { StatusMessage } from "../../components/StatusMessage";
import { usePagedList } from "../../hooks/usePagedList";
import { useResource } from "../../hooks/useResource";
import type { AdminUserRef, AnalyticsFilter, PeopleQuery, Segment } from "../../types/admin";
import styles from "./AdminUsersScreen.module.css";

interface AdminPeopleScreenProps {
  query: PeopleQuery;
  filter: AnalyticsFilter;
  onOpenUser: (user: AdminUserRef) => void;
  onBroadcast: (segment: Segment) => void;
}

export function AdminPeopleScreen({ query, filter, onOpenUser, onBroadcast }: AdminPeopleScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();
  const an = strings.an;
  const key = JSON.stringify([query, filter]);
  const segment = useResource(
    () =>
      createSegment(filter, query).then((created) => {
        rememberSegment(created.id, created.title);
        return created;
      }),
    key,
  );
  const id = segment.data?.id ?? null;
  const users = usePagedList(
    (cursor) => fetchUsers("", { segment: String(id) }, cursor),
    (user) => user.telegram_id,
    `segment-${id}`,
    id !== null,
  );

  return (
    <Screen title={query.title} withTabBar={false} enterAnimation>
      {renderContent()}
    </Screen>
  );

  function renderContent() {
    if (!segment.data) {
      return segment.status === "error" ? (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, segment.error, an.peopleFailed)}
          actionLabel={strings.retry}
          onAction={segment.reload}
        />
      ) : (
        <StatusMessage icon="spinner" title={strings.loading} />
      );
    }
    const created = segment.data;
    return (
      <div className={styles.list}>
        <Section title={an.peopleCount(created.count)} footer={an.peopleBroadcastFooter}>
          <Card>
            <ListItem
              icon={<PaperPlaneIcon />}
              iconColor="blue"
              label={an.peopleBroadcast}
              accent
              disabled={created.count === 0}
              onPress={() => onBroadcast(created)}
            />
          </Card>
        </Section>
        <div style={{ marginTop: "var(--space-section-gap)" }}>{renderList()}</div>
      </div>
    );
  }

  function renderList() {
    if (users.status === "error") {
      return (
        <StatusMessage
          icon="alert"
          title={strings.errorTitle}
          description={describeAdminError(strings, users.error, strings.usersLoadFailed)}
          actionLabel={strings.retry}
          onAction={users.reload}
        />
      );
    }
    if (users.status === "loading") {
      return <StatusMessage icon="spinner" title={strings.loading} />;
    }
    if (users.items.length === 0) {
      return <p className={styles.empty}>{an.peopleEmpty}</p>;
    }
    return (
      <>
        <Card>
          {users.items.map((user) => (
            <ListItem key={user.telegram_id} onPress={() => onOpenUser(user)}>
              <span className={styles.name}>{format.userName(user)}</span>
              <span className={styles.trailing}>
                {user.last_seen_at ? <span>{format.relative(user.last_seen_at)}</span> : null}
                <Disclosure />
              </span>
            </ListItem>
          ))}
        </Card>
        <LoadMore
          hasMore={users.hasMore}
          loading={users.loadingMore}
          failed={users.moreError !== null}
          onLoad={users.loadMore}
          loadingLabel={strings.loading}
          failedLabel={strings.loadMoreFailed}
          retryLabel={strings.retry}
        />
      </>
    );
  }
}
