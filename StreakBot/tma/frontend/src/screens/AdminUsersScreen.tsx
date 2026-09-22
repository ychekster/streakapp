/**
 * Пользователи — вложенный экран вкладки «Люди», устроенный как выбор часового пояса:
 * под крупным заголовком — поиск и одна карточка, в каждом ряду имя и id Telegram
 * (заблокированные — с пометкой). Новые сначала; следующая страница догружается, когда
 * список прокручен к концу. Поиск — по имени, @username и id, на сервере (запрос уходит,
 * когда ввод замер); пока ответа нет, остаются прежние результаты.
 *
 * Нажатие на пользователя открывает его профиль (AdminUserScreen). Список и запрос хранит
 * AdminApp — при возврате из профиля экран такой же, каким его оставили.
 */

import { userName } from "../adminFormat";
import { ADMIN_STRINGS as S, describeAdminError } from "../adminStrings";
import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { LoadMore } from "../components/LoadMore";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { ADMIN_SEARCH_MAX_LENGTH } from "../constants";
import type { PagedList } from "../hooks/usePagedList";
import type { AdminUserSummary } from "../types/admin";
import styles from "./AdminUsersScreen.module.css";

interface AdminUsersScreenProps {
  query: string;
  onQueryChange: (query: string) => void;
  users: PagedList<AdminUserSummary>;
  onOpen: (telegramId: number) => void;
}

export function AdminUsersScreen({ query, onQueryChange, users, onOpen }: AdminUsersScreenProps) {
  return (
    <Screen title={S.usersTitle} withTabBar={false} enterAnimation>
      <SearchField
        value={query}
        onChange={(value) => onQueryChange(value.slice(0, ADMIN_SEARCH_MAX_LENGTH))}
        placeholder={S.usersSearch}
        clearLabel={S.usersSearchClear}
      />
      {renderList()}
    </Screen>
  );

  function renderList() {
    if (users.status === "error") {
      return (
        <StatusMessage
          emoji={S.errorEmoji}
          title={S.errorTitle}
          description={describeAdminError(users.error, S.usersLoadFailed)}
          actionLabel={S.retry}
          onAction={users.reload}
        />
      );
    }
    if (users.status === "loading") {
      return <StatusMessage emoji={S.loadingEmoji} title={S.loading} />;
    }
    if (users.items.length === 0) {
      return users.stale ? null : (
        <p className={styles.empty}>{query.trim() ? S.nothingFound : S.usersEmpty}</p>
      );
    }
    return (
      <div className={styles.list}>
        <Card>
          {users.items.map((user) => (
            <ListItem key={user.telegram_id} onPress={() => onOpen(user.telegram_id)}>
              <span className={styles.name}>{userName(user)}</span>
              <span className={styles.trailing}>
                {user.blocked ? <span className={styles.blocked}>{S.blockedTag}</span> : null}
                <span className={styles.id}>{user.telegram_id}</span>
                <Disclosure />
              </span>
            </ListItem>
          ))}
        </Card>
        {users.stale ? null : (
          <LoadMore
            hasMore={users.hasMore}
            loading={users.loadingMore}
            failed={users.moreError !== null}
            onLoad={users.loadMore}
            loadingLabel={S.loading}
            failedLabel={S.loadMoreFailed}
            retryLabel={S.retry}
          />
        )}
      </div>
    );
  }
}
