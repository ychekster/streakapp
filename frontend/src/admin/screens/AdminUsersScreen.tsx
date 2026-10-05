/**
 * Вкладка «Пользователи» админ-панели, устроенная как выбор часового пояса: под крупным
 * заголовком — поиск и одна карточка, в каждом ряду имя и id Telegram (заблокированные —
 * с пометкой). Новые сначала; следующая страница догружается, когда список прокручен к
 * концу. Поиск — по имени, @username и id, на сервере (запрос уходит, когда ввод
 * замер); пока ответа нет, остаются прежние результаты.
 *
 * Под поиском — кнопка «Фильтры» (открывает экран фильтров, AdminUserFiltersScreen) и
 * выбранные условия капсулами: нажатие на капсулу снимает условие. Над списком — сколько
 * пользователей под поиском и фильтром.
 *
 * Нажатие на пользователя открывает его профиль (AdminUserScreen). Список и запрос хранит
 * AdminApp — при возврате из профиля экран такой же, каким его оставили.
 */

import { useAdminFormat } from "../adminFormat";
import { describeAdminError, useAdminStrings } from "../adminStrings";
import { Disclosure } from "../../components/Disclosure";
import { FilterChips } from "../components/FilterChips";
import { ListItem } from "../../components/ListItem";
import { LoadMore } from "../components/LoadMore";
import { Screen } from "../../components/Screen";
import { SearchField } from "../../components/SearchField";
import { Card } from "../../components/Section";
import { StatusMessage } from "../../components/StatusMessage";
import { ADMIN_SEARCH_MAX_LENGTH } from "../../constants";
import type { PagedList } from "../../hooks/usePagedList";
import { withFilter } from "../audience";
import type { AdminUserSummary, Audience } from "../../types/admin";
import styles from "./AdminUsersScreen.module.css";

interface AdminUsersScreenProps {
  query: string;
  onQueryChange: (query: string) => void;
  audience: Audience;
  onAudienceChange: (audience: Audience) => void;
  onOpenFilters: () => void;
  users: PagedList<AdminUserSummary>;
  onOpen: (user: AdminUserSummary) => void;
}

export function AdminUsersScreen({
  query,
  onQueryChange,
  audience,
  onAudienceChange,
  onOpenFilters,
  users,
  onOpen,
}: AdminUsersScreenProps) {
  const strings = useAdminStrings();
  const format = useAdminFormat();

  return (
    <Screen title={strings.usersTitle}>
      <SearchField
        value={query}
        onChange={(value) => onQueryChange(value.slice(0, ADMIN_SEARCH_MAX_LENGTH))}
        placeholder={strings.usersSearch}
        clearLabel={strings.usersSearchClear}
      />
      <FilterChips
        audience={audience}
        onOpen={onOpenFilters}
        onRemove={(key) => onAudienceChange(withFilter(audience, key, ""))}
      />
      {renderList()}
    </Screen>
  );

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
    const filtered = Object.keys(audience).length > 0;
    if (users.items.length === 0) {
      return users.stale ? null : (
        <p className={styles.empty}>
          {query.trim() ? strings.nothingFound : filtered ? strings.usersNoMatches : strings.usersEmpty}
        </p>
      );
    }
    return (
      <div className={styles.list}>
        {users.total !== null && (filtered || query.trim()) ? (
          <p className={styles.total}>{strings.usersFound(users.total)}</p>
        ) : null}
        <Card>
          {users.items.map((user) => (
            <ListItem key={user.telegram_id} onPress={() => onOpen(user)}>
              <span className={styles.name}>{format.userName(user)}</span>
              <span className={styles.trailing}>
                {user.blocked ? <span className={styles.blocked}>{strings.blockedTag}</span> : null}
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
            loadingLabel={strings.loading}
            failedLabel={strings.loadMoreFailed}
            retryLabel={strings.retry}
          />
        )}
      </div>
    );
  }
}
