/**
 * Админ-панель — режим приложения, а не отдельное приложение: вход — рядом «Админ-панель»
 * в настройках (виден только администраторам), выход — «Вернуться в приложение» в её
 * настройках. На это время нижняя навигация приложения заменена своей, с четырьмя
 * вкладками: «Аналитика», «Люди», «Рассылка», «Настройки». Вся панель — на английском.
 *
 * Вложенные экраны «Людей» открываются стопкой поверх вкладки (нижняя навигация скрыта,
 * «Закрыть» Telegram заменена на «Назад», которая снимает верхний экран):
 *  - Пользователи → профиль пользователя → его отзыв → …;
 *  - Отзывы → отзыв → профиль автора → ….
 * При возврате экран открывается на той же позиции прокрутки.
 *
 * Состояние, которое должно пережить переходы, живёт здесь: аналитика выбранного
 * периода, списки пользователей (с запросом поиска) и отзывов, черновик и ход последней
 * рассылки. Действия в профиле и отзыве (блокировка, удаление, ответ) сразу видны в
 * списках — без повторной загрузки.
 */

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { fetchAnalytics, fetchReviews, fetchUsers } from "./api/admin";
import { ADMIN_STRINGS as S } from "./adminStrings";
import { TabBar, type TabItem } from "./components/TabBar";
import { AnalyticsIcon, BroadcastIcon, PeopleIcon, SettingsIcon } from "./components/TabIcons";
import { ADMIN_SEARCH_DELAY_MS, DEFAULT_ANALYTICS_PERIOD } from "./constants";
import { useBackButton } from "./hooks/useBackButton";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { usePagedList } from "./hooks/usePagedList";
import { useResource } from "./hooks/useResource";
import { AdminAnalyticsScreen } from "./screens/AdminAnalyticsScreen";
import { AdminBroadcastScreen, EMPTY_DRAFT, type BroadcastDraft } from "./screens/AdminBroadcastScreen";
import { AdminPeopleScreen, type PeoplePage } from "./screens/AdminPeopleScreen";
import { AdminReviewScreen } from "./screens/AdminReviewScreen";
import { AdminReviewsScreen } from "./screens/AdminReviewsScreen";
import { AdminSettingsScreen } from "./screens/AdminSettingsScreen";
import { AdminUserScreen } from "./screens/AdminUserScreen";
import { AdminUsersScreen } from "./screens/AdminUsersScreen";
import type { AdminReview, AdminUserRef, Broadcast } from "./types/admin";

type AdminTab = "analytics" | "people" | "broadcast" | "settings";

const TABS: readonly TabItem<AdminTab>[] = [
  { key: "analytics", label: S.tabAnalytics, icon: (active) => <AnalyticsIcon filled={active} /> },
  { key: "people", label: S.tabPeople, icon: (active) => <PeopleIcon filled={active} /> },
  { key: "broadcast", label: S.tabBroadcast, icon: (active) => <BroadcastIcon filled={active} /> },
  { key: "settings", label: S.tabSettings, icon: () => <SettingsIcon /> },
];

/** Вложенный экран вкладки «Люди»; `initial` — уже известное (строка списка). */
type AdminPage =
  | { kind: "users" }
  | { kind: "reviews" }
  | { kind: "user"; id: number; initial: AdminUserRef | null }
  | { kind: "review"; id: number; initial: AdminReview | null };

interface AdminAppProps {
  /** Выйти из админ-панели в приложение. */
  onExit: () => void;
}

export function AdminApp({ onExit }: AdminAppProps) {
  const [tab, setTab] = useState<AdminTab>("analytics");
  const [stack, setStack] = useState<AdminPage[]>([]);
  // Позиции прокрутки экранов под открытыми вложенными: при возврате — там же.
  const scrollStack = useRef<number[]>([]);
  const pendingScroll = useRef<number | null>(null);

  const [period, setPeriod] = useState(DEFAULT_ANALYTICS_PERIOD);
  const analytics = useResource(() => fetchAnalytics(period), String(period));

  // Списки загружаются при первом открытии, дальше — живут здесь.
  const [usersOpened, setUsersOpened] = useState(false);
  const [reviewsOpened, setReviewsOpened] = useState(false);
  const [query, setQuery] = useState("");
  const settledQuery = useDebouncedValue(query.trim(), ADMIN_SEARCH_DELAY_MS);
  const users = usePagedList(
    (cursor) => fetchUsers(settledQuery, cursor),
    (user) => user.telegram_id,
    settledQuery,
    usersOpened,
  );
  const reviews = usePagedList(fetchReviews, (review) => review.id, "reviews", reviewsOpened);

  const [draft, setDraft] = useState<BroadcastDraft>(EMPTY_DRAFT);
  const [lastBroadcast, setLastBroadcast] = useState<Broadcast | null>(null);

  const push = useCallback((page: AdminPage) => {
    scrollStack.current.push(window.scrollY);
    pendingScroll.current = 0;
    setStack((current) => [...current, page]);
  }, []);

  const pop = useCallback(() => {
    pendingScroll.current = scrollStack.current.pop() ?? 0;
    setStack((current) => current.slice(0, -1));
  }, []);

  useBackButton(stack.length > 0 ? pop : null);

  function selectTab(next: AdminTab): void {
    if (next === "analytics" && tab !== "analytics") {
      analytics.reload(); // свежие числа, прежние видны, пока загружаются новые
    }
    pendingScroll.current = 0;
    setTab(next);
  }

  function openPeoplePage(page: PeoplePage): void {
    if (page === "users") {
      if (usersOpened) {
        users.reload();
      }
      setUsersOpened(true);
    } else {
      if (reviewsOpened) {
        reviews.reload();
      }
      setReviewsOpened(true);
    }
    push({ kind: page });
  }

  // Удалённый пользователь пропадает из списков, а экран возвращается к списку, с
  // которого начали.
  function forgetUser(telegramId: number): void {
    users.update((items) => items.filter((user) => user.telegram_id !== telegramId));
    reviews.update((items) => items.filter((review) => review.user.telegram_id !== telegramId));
    pendingScroll.current = scrollStack.current[1] ?? 0;
    scrollStack.current = scrollStack.current.slice(0, 1);
    setStack((current) => current.slice(0, 1));
  }

  // Вложенный экран открывается с начала, экран под ним — на сохранённой позиции.
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  });

  function renderPage(page: AdminPage) {
    switch (page.kind) {
      case "users":
        return (
          <AdminUsersScreen
            query={query}
            onQueryChange={setQuery}
            users={users}
            onOpen={(telegramId) => {
              const initial = users.items.find((user) => user.telegram_id === telegramId) ?? null;
              push({ kind: "user", id: telegramId, initial });
            }}
          />
        );
      case "reviews":
        return (
          <AdminReviewsScreen
            reviews={reviews}
            onOpen={(reviewId) => {
              const initial = reviews.items.find((review) => review.id === reviewId) ?? null;
              push({ kind: "review", id: reviewId, initial });
            }}
          />
        );
      case "user":
        return (
          <AdminUserScreen
            key={`user-${page.id}-${stack.length}`}
            telegramId={page.id}
            initial={page.initial}
            onOpenReview={(review) => push({ kind: "review", id: review.id, initial: review })}
            onChanged={(profile) =>
              users.update((items) =>
                items.map((user) =>
                  user.telegram_id === profile.telegram_id
                    ? { ...user, blocked: profile.blocked_at !== null }
                    : user,
                ),
              )
            }
            onDeleted={forgetUser}
          />
        );
      case "review":
        return (
          <AdminReviewScreen
            key={`review-${page.id}-${stack.length}`}
            reviewId={page.id}
            initial={page.initial}
            onOpenUser={(user) => push({ kind: "user", id: user.telegram_id, initial: user })}
            onReplied={(updated) =>
              reviews.update((items) =>
                items.map((review) => (review.id === updated.id ? updated : review)),
              )
            }
          />
        );
    }
  }

  function renderTab() {
    switch (tab) {
      case "analytics":
        return (
          <AdminAnalyticsScreen analytics={analytics} period={period} onPeriodChange={setPeriod} />
        );
      case "people":
        return <AdminPeopleScreen onOpen={openPeoplePage} />;
      case "broadcast":
        return (
          <AdminBroadcastScreen
            draft={draft}
            onDraftChange={setDraft}
            lastBroadcast={lastBroadcast}
            onBroadcastChange={setLastBroadcast}
          />
        );
      case "settings":
        return <AdminSettingsScreen onExit={onExit} />;
    }
  }

  const page = stack[stack.length - 1];
  return (
    <>
      {page ? renderPage(page) : renderTab()}
      <TabBar tabs={TABS} active={tab} hidden={page !== undefined} onSelect={selectTab} />
    </>
  );
}
