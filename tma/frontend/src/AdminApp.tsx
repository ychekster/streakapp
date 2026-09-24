/**
 * Админ-панель — режим приложения, а не отдельное приложение: вход — рядом «Админ-панель»
 * в настройках (виден только администраторам), выход — «Вернуться в приложение» в её
 * настройках. На это время нижняя навигация приложения заменена своей, с пятью
 * вкладками: «Аналитика», «Пользователи», «Отзывы», «Рассылка», «Настройки». Панель
 * говорит на языке интерфейса; язык и тему можно сменить и в её настройках.
 *
 * Профиль пользователя, отзыв и экраны написания открываются стопкой поверх вкладки
 * (нижняя навигация скрыта, «Закрыть» Telegram заменена на «Назад», которая снимает
 * верхний экран):
 *  - Пользователи → профиль → его привычки (тот же список, что он видит сам, только
 *    для просмотра) или его отзыв → …;
 *  - Отзывы → отзыв → профиль автора → …;
 *  - профиль → «Написать сообщение», отзыв → «Ответить», настройки → «Добавить
 *    администратора» (см. ComposeScreen).
 * При возврате экран открывается на той же позиции прокрутки.
 *
 * Состояние, которое должно пережить переходы, живёт здесь: аналитика выбранного
 * периода, списки пользователей (с запросом поиска) и отзывов, черновик и ход последней
 * рассылки. Списки загружаются при первом открытии вкладки и обновляются при повторном.
 * Действия в профиле и отзыве (блокировка, удаление, ответ) сразу видны в списках — без
 * повторной загрузки. Настройки (язык, тема) — общие с приложением: их хранит App.
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { fetchAnalytics, fetchReviews, fetchUsers } from "./api/admin";
import { useAdminStrings } from "./adminStrings";
import { TabBar, type TabItem } from "./components/TabBar";
import {
  AnalyticsIcon,
  BroadcastIcon,
  ReviewsIcon,
  SettingsIcon,
  UsersIcon,
} from "./components/TabIcons";
import { ADMIN_SEARCH_DELAY_MS, DEFAULT_ANALYTICS_PERIOD } from "./constants";
import { useBackButton } from "./hooks/useBackButton";
import { useDebouncedValue } from "./hooks/useDebouncedValue";
import { usePagedList } from "./hooks/usePagedList";
import { useResource } from "./hooks/useResource";
import type { UseSettingsResult } from "./hooks/useSettings";
import { AdminAddAdminScreen } from "./screens/AdminAddAdminScreen";
import { AdminAnalyticsScreen } from "./screens/AdminAnalyticsScreen";
import {
  AdminBroadcastScreen,
  EMPTY_DRAFT,
  type BroadcastDraft,
} from "./screens/AdminBroadcastScreen";
import { AdminMessageScreen } from "./screens/AdminMessageScreen";
import { AdminReplyScreen } from "./screens/AdminReplyScreen";
import { AdminReviewScreen } from "./screens/AdminReviewScreen";
import { AdminReviewsScreen } from "./screens/AdminReviewsScreen";
import { AdminSettingsScreen } from "./screens/AdminSettingsScreen";
import { AdminUserHabitsScreen } from "./screens/AdminUserHabitsScreen";
import { AdminUserScreen } from "./screens/AdminUserScreen";
import { AdminUsersScreen } from "./screens/AdminUsersScreen";
import type { AdminReview, AdminUserRef, Broadcast } from "./types/admin";
import type { SettingsUpdate } from "./types/settings";

type AdminTab = "analytics" | "users" | "reviews" | "broadcast" | "settings";

/** Экран поверх вкладки; `initial` — уже известное (строка списка). */
type AdminPage =
  | { kind: "user"; id: number; initial: AdminUserRef | null }
  | { kind: "habits"; id: number }
  | { kind: "review"; id: number; initial: AdminReview | null }
  | { kind: "message"; id: number; name: string }
  | { kind: "reply"; id: number }
  | { kind: "newAdmin" };

interface AdminAppProps {
  /** Настройки пользователя (язык, тема) — общие с приложением. */
  settings: UseSettingsResult;
  onSaveSettings: (patch: SettingsUpdate) => void;
  /** Выйти из админ-панели в приложение. */
  onExit: () => void;
}

export function AdminApp({ settings, onSaveSettings, onExit }: AdminAppProps) {
  const strings = useAdminStrings();
  const [tab, setTab] = useState<AdminTab>("analytics");
  const [stack, setStack] = useState<AdminPage[]>([]);
  // Позиции прокрутки экранов под открытыми: при возврате — там же.
  const scrollStack = useRef<number[]>([]);
  const pendingScroll = useRef<number | null>(null);

  const [period, setPeriod] = useState(DEFAULT_ANALYTICS_PERIOD);
  const analytics = useResource(() => fetchAnalytics(period), String(period));

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

  const tabs: TabItem<AdminTab>[] = useMemo(
    () => [
      {
        key: "analytics",
        label: strings.tabAnalytics,
        icon: (active) => <AnalyticsIcon filled={active} />,
      },
      { key: "users", label: strings.tabUsers, icon: (active) => <UsersIcon filled={active} /> },
      {
        key: "reviews",
        label: strings.tabReviews,
        icon: (active) => <ReviewsIcon filled={active} />,
      },
      {
        key: "broadcast",
        label: strings.tabBroadcast,
        icon: (active) => <BroadcastIcon filled={active} />,
      },
      { key: "settings", label: strings.tabSettings, icon: () => <SettingsIcon /> },
    ],
    [strings],
  );

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

  // Другая вкладка — с начала; её данные, если уже загружены, тихо обновляются (прежние
  // видны, пока загружаются новые).
  function selectTab(next: AdminTab): void {
    if (next !== tab) {
      if (next === "analytics") {
        analytics.reload();
      } else if (next === "users") {
        if (usersOpened) {
          users.reload();
        }
        setUsersOpened(true);
      } else if (next === "reviews") {
        if (reviewsOpened) {
          reviews.reload();
        }
        setReviewsOpened(true);
      }
    }
    pendingScroll.current = 0;
    setTab(next);
  }

  // Удалённый пользователь пропадает из списков, а экран возвращается на вкладку.
  function forgetUser(telegramId: number): void {
    users.update((items) => items.filter((user) => user.telegram_id !== telegramId));
    reviews.update((items) => items.filter((review) => review.user.telegram_id !== telegramId));
    pendingScroll.current = scrollStack.current[0] ?? 0;
    scrollStack.current = [];
    setStack([]);
  }

  // Открытый экран — с начала, экран под ним — на сохранённой позиции.
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  });

  function openUser(user: AdminUserRef): void {
    push({ kind: "user", id: user.telegram_id, initial: user });
  }

  function openReview(review: AdminReview): void {
    push({ kind: "review", id: review.id, initial: review });
  }

  // Отправленный ответ виден и в списке отзывов, и на экране отзыва под этим — туда он
  // попадает как «уже известный» отзыв (`initial`), пока экран перечитывает свежий.
  function applyReply(updated: AdminReview): void {
    reviews.update((items) =>
      items.map((review) => (review.id === updated.id ? updated : review)),
    );
    setStack((current) =>
      current.map((page) =>
        page.kind === "review" && page.id === updated.id ? { ...page, initial: updated } : page,
      ),
    );
  }

  function renderPage(page: AdminPage) {
    switch (page.kind) {
      case "user":
        return (
          <AdminUserScreen
            key={`user-${page.id}-${stack.length}`}
            telegramId={page.id}
            initial={page.initial}
            onOpenReview={openReview}
            onOpenHabits={() => push({ kind: "habits", id: page.id })}
            onWriteMessage={(name) => push({ kind: "message", id: page.id, name })}
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
      case "habits":
        return (
          <AdminUserHabitsScreen
            key={`habits-${page.id}-${stack.length}`}
            telegramId={page.id}
          />
        );
      case "review":
        return (
          <AdminReviewScreen
            key={`review-${page.id}-${stack.length}`}
            reviewId={page.id}
            initial={page.initial}
            onOpenUser={openUser}
            onReply={() => push({ kind: "reply", id: page.id })}
          />
        );
      case "message":
        return <AdminMessageScreen telegramId={page.id} name={page.name} onClose={pop} />;
      case "reply":
        return <AdminReplyScreen reviewId={page.id} onReplied={applyReply} onClose={pop} />;
      case "newAdmin":
        return <AdminAddAdminScreen onClose={pop} />;
    }
  }

  function renderTab() {
    switch (tab) {
      case "analytics":
        return (
          <AdminAnalyticsScreen analytics={analytics} period={period} onPeriodChange={setPeriod} />
        );
      case "users":
        return (
          <AdminUsersScreen
            query={query}
            onQueryChange={setQuery}
            users={users}
            onOpen={openUser}
          />
        );
      case "reviews":
        return <AdminReviewsScreen reviews={reviews} onOpen={openReview} />;
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
        return (
          <AdminSettingsScreen
            settings={settings}
            onSaveSettings={onSaveSettings}
            onAddAdmin={() => push({ kind: "newAdmin" })}
            onExit={onExit}
          />
        );
    }
  }

  const page = stack[stack.length - 1];
  return (
    <>
      {page ? renderPage(page) : renderTab()}
      <TabBar tabs={tabs} active={tab} hidden={page !== undefined} onSelect={selectTab} />
    </>
  );
}
