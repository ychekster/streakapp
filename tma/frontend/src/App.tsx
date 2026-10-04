/**
 * Корневой каркас приложения: разворачивает Mini App на весь экран, держит общее
 * состояние привычек и настроек и переключает экраны через нижнюю навигацию.
 *
 * Экраны рендерятся по одному (документ-скролл и сворачивающаяся шапка не должны
 * конфликтовать). Состояние привычек живёт здесь, поэтому переключение вкладок не
 * теряет данные, а созданная или изменённая привычка сразу видна везде. Настройки
 * тоже здесь: от них зависят язык и тема всего приложения (раздаются через контекст,
 * см. preferences.ts), а от пояса и режима «Отмечать за вчера» — день отметки, поэтому
 * после их смены список привычек перезапрашивается.
 *
 * Вложенные экраны открываются поверх вкладки; нижняя навигация на это время скрыта, а
 * «Закрыть» Telegram заменена на «Назад»:
 *  - экран привычки — нажатием на привычку в списке;
 *  - форма привычки — кнопкой «+» (новая привычка) или «Редактировать привычку» на
 *    экране привычки; «Назад» закрывает её без сохранения;
 *  - выбор часового пояса, «Написать отзыв», политика конфиденциальности и условия
 *    использования — из настроек. «Написать отзыв» открывает и кнопка под рассылкой:
 *    приложение запускается сразу на нём (параметр адреса `open=review`). Так же кнопка
 *    «Добавить привычку» открывает сразу форму новой привычки (`open=new_habit`).
 * При возврате экран открывается на той же позиции прокрутки, на которой его оставили.
 * Так же и вкладки: у каждой своя позиция; ещё не прокрученная открывается с начала.
 *
 * Пока часовой пояс не выбран (первый запуск), приложение ставит пояс устройства —
 * молча: его видно в настройках, и там же его можно поменять.
 *
 * The same App runs as the installed web app (main.tsx decides; platform.ts). Then the
 * back and bottom buttons are the app's own (WebChrome), and a notification tap opens
 * its habit (`habit=<id>`). A guest (Telegram not linked yet) sees a red «!» on the
 * Settings tab; Settings → «Аккаунт» links Telegram through the bot, and the result is
 * picked up wherever the user is (useTelegramLoginWatcher). «Добавить на рабочий стол»
 * is only in Telegram, and the bot's «Установить» button opens the Mini App on it
 * (`open=install`).
 *
 * Администратор может переключить приложение в режим админ-панели (ряд «Админ-панель» в
 * настройках): тогда вместо экранов и нижней навигации приложения — AdminApp, а
 * «Вернуться в приложение» в её настройках возвращает на экран настроек. Состояние
 * приложения (привычки, настройки) на это время сохраняется.
 */

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiRequestError } from "./api/client";
import { deleteHabit } from "./api/habits";
import { fetchAccount, type Account } from "./api/web";
import { SCROLL_RESTORED_EVENT } from "./components/CollapsingHeader";
import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabItem } from "./components/TabBar";
import { HabitsIcon, SettingsIcon } from "./components/TabIcons";
import { useBackButton } from "./hooks/useBackButton";
import { useHandoffLink } from "./hooks/useHandoffLink";
import { useTelegramLoginWatcher } from "./hooks/useTelegramLoginWatcher";
import { useHabits } from "./hooks/useHabits";
import { useSettings, type SaveOptions } from "./hooks/useSettings";
import { useSystemDark } from "./hooks/useSystemDark";
import { useToggle } from "./hooks/useToggle";
import {
  PreferencesContext,
  readSavedPreferences,
  resolveTheme,
  savePreferences,
} from "./preferences";
import { usePlatform } from "./platform";
import { AccountScreen } from "./screens/AccountScreen";
import { HabitFormScreen } from "./screens/HabitFormScreen";
import { InstallFromTelegramScreen } from "./screens/InstallFromTelegramScreen";
import { HabitScreen } from "./screens/HabitScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { LegalScreen } from "./screens/LegalScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsScreen, type SettingsPage } from "./screens/SettingsScreen";
import { isCurrentTimezone, TimezoneScreen } from "./screens/TimezoneScreen";
import { currentSessionToken } from "./session";
import { STRINGS, type Strings } from "./strings";
import {
  hapticNotification,
  initTelegram,
  isTelegramAvailable,
  setTelegramColors,
} from "./telegram/webapp";
import type { Habit } from "./types/habit";
import type { TimezoneEntry } from "./types/meta";
import type { Settings, SettingsUpdate } from "./types/settings";
import { authNotice } from "./web/bootstrap";
import { beginTelegramBotLogin } from "./web/login";
import { WebChrome } from "./web/WebChrome";
import styles from "./App.module.css";

// Цвет фона берём из дизайн-токена (CSS-переменной), а не хардкодим в коде.
function readBackgroundColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  return value || "#f2f2f7";
}

/** Часовой пояс устройства (IANA) или null, если браузер его не сообщает. */
function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** Экран, на котором приложение открывается сразу (см. startScreen). */
type StartScreen = "review" | "new_habit" | "install";

/**
 * Экран, на котором открыть приложение, — параметр `open` его адреса. Его ставят кнопки
 * под рассылкой из админ-панели (tma/backend/messaging.py, app_url): «Написать отзыв» —
 * экран отзыва, «Добавить привычку» — форма новой привычки. Без параметра (обычный
 * запуск) или с незнакомым значением — null.
 */
function startScreen(): StartScreen | null {
  try {
    const screen = new URLSearchParams(window.location.search).get("open");
    return screen === "review" || screen === "new_habit" || screen === "install" ? screen : null;
  } catch {
    return null;
  }
}

// Админ-панель — отдельным файлом: она нужна только администраторам, и остальные его не
// загружают (приложение открывается быстрее). Администратору файл подгружается заранее —
// как только из настроек известно, что он администратор (см. эффект в App), — поэтому
// при входе в панель ждать не приходится.
const loadAdminApp = () => import("./AdminApp");
const AdminApp = lazy(() => loadAdminApp().then((module) => ({ default: module.AdminApp })));

/** Habit a push notification opens (`habit=<id>` in the address), or null. */
function startHabit(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get("habit"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

/** Why linking Telegram failed (an API error code), for Settings. */
function linkErrorText(code: string | null, strings: Strings): string | null {
  if (code === null) {
    return null;
  }
  return strings.apiErrors[code as keyof typeof strings.apiErrors] ?? strings.accountActionFailed;
}

/** A bot login that failed while the app was closed (bootstrap): its error code. */
function startLinkError(): string | null {
  const notice = authNotice();
  return notice?.kind === "error" ? notice.code : null;
}

/** Открытая форма привычки: редактируемая привычка или null — новая. */
interface Editor {
  habit: Habit | null;
}

type TabKey = "habits" | "settings";

export function App() {
  const { habits, status, error, setHabits, reload, refresh } = useHabits();
  const settingsState = useSettings();
  const { settings, save } = settingsState;
  const toggle = useToggle(setHabits);
  const telegramAvailable = isTelegramAvailable();
  const platform = usePlatform();
  const web = platform === "web";
  // Открыто кнопкой под рассылкой: «Написать отзыв» — сразу экран отзыва (над
  // настройками, куда и вернёт «Назад»), «Добавить привычку» — форма новой привычки (над
  // списком привычек).
  const [start] = useState(startScreen);
  // Linking Telegram failed (error code) — shown in Settings; a failure picked up at start
  // (bootstrap) opens Settings.
  const [linkError, setLinkError] = useState<string | null>(startLinkError);
  const startsInSettings = start === "review" || start === "install" || linkError !== null;
  const [tab, setTab] = useState<TabKey>(startsInSettings ? "settings" : "habits");
  const [openHabitId, setOpenHabitId] = useState<number | null>(null);
  // Экран привычки въезжает при открытии из списка, но не при возврате из формы.
  const [habitEntering, setHabitEntering] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(
    start === "new_habit" ? { habit: null } : null,
  );
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(
    start === "review" ? "review" : start === "install" ? "install" : null,
  );
  // Web app: the account (guest or not) — for the «!» on the Settings tab and Settings.
  const [account, setAccount] = useState<Account | null>(null);
  const pendingHabit = useRef(startHabit());
  const install = useHandoffLink("settings", telegramAvailable && tab === "settings");
  const [adminMode, setAdminMode] = useState(false);
  // Позиции прокрутки экранов, поверх которых открыт вложенный: при возврате — там же.
  const scrollUnderHabit = useRef(0);
  const scrollUnderEditor = useRef(0);
  const scrollUnderSettingsPage = useRef(0);
  const scrollUnderAdmin = useRef(0);
  // Позиция прокрутки каждой вкладки, пока открыта другая.
  const tabScroll = useRef<Record<TabKey, number>>({ habits: 0, settings: 0 });
  // Прокрутка, которую нужно поставить после ближайшего рендера (см. layout-эффект ниже).
  const pendingScroll = useRef<number | null>(null);
  // Пояс устройства уже предлагался серверу в этом запуске (см. эффект ниже).
  const deviceTimezoneSent = useRef(false);

  // Язык и тема: из настроек, а пока они не загружены — запомненные на устройстве.
  const [savedPreferences] = useState(readSavedPreferences);
  const language = settings?.language ?? savedPreferences.language;
  const markYesterday = settings?.mark_yesterday ?? savedPreferences.markYesterday;
  const systemDark = useSystemDark();
  const theme = resolveTheme(settings?.theme ?? savedPreferences.theme, systemDark);
  const strings = STRINGS[language];
  const preferences = useMemo(
    () => ({ language, strings, theme }),
    [language, strings, theme],
  );

  const openHabit = habits.find((habit) => habit.id === openHabitId);
  const telegramLabel =
    account?.logins.find((login) => login.provider === "telegram")?.label ?? null;

  const tabs: TabItem<TabKey>[] = useMemo(
    () => [
      { key: "habits", label: strings.tabHabits, icon: (active) => <HabitsIcon filled={active} /> },
      {
        key: "settings",
        label: strings.tabSettings,
        icon: () => <SettingsIcon />,
        badge: web && account?.is_guest === true,
      },
    ],
    [strings, web, account?.is_guest],
  );

  const showHabit = useCallback((taskId: number) => {
    scrollUnderHabit.current = window.scrollY;
    pendingScroll.current = 0;
    setHabitEntering(true);
    setOpenHabitId(taskId);
  }, []);

  const hideHabit = useCallback(() => {
    pendingScroll.current = scrollUnderHabit.current;
    setOpenHabitId(null);
  }, []);

  const showEditor = useCallback((habit: Habit | null) => {
    scrollUnderEditor.current = window.scrollY;
    pendingScroll.current = 0;
    setEditor({ habit });
  }, []);

  const hideEditor = useCallback(() => {
    pendingScroll.current = scrollUnderEditor.current;
    setHabitEntering(false);
    setEditor(null);
  }, []);

  const showSettingsPage = useCallback((page: SettingsPage) => {
    scrollUnderSettingsPage.current = window.scrollY;
    pendingScroll.current = 0;
    setSettingsPage(page);
  }, []);

  const hideSettingsPage = useCallback(() => {
    pendingScroll.current = scrollUnderSettingsPage.current;
    setSettingsPage(null);
  }, []);

  const enterAdmin = useCallback(() => {
    scrollUnderAdmin.current = window.scrollY;
    pendingScroll.current = 0;
    setAdminMode(true);
  }, []);

  // Выход из админ-панели — на экран настроек, откуда в неё вошли.
  const exitAdmin = useCallback(() => {
    pendingScroll.current = scrollUnderAdmin.current;
    setTab("settings");
    setAdminMode(false);
  }, []);

  // Переключение вкладки: запомнить, где оставили текущую, и открыть новую там, где её
  // оставили (или с начала).
  function selectTab(next: TabKey): void {
    if (next === tab) {
      return;
    }
    tabScroll.current[tab] = window.scrollY;
    pendingScroll.current = tabScroll.current[next];
    setTab(next);
  }

  // Сохранить настройку. Пояс и режим «Отмечать за вчера» меняют день отметки — сервер
  // пересчитывает привычки, и список обновляется.
  const saveSettings = useCallback(
    async (patch: SettingsUpdate, preview?: Partial<Settings>, options?: SaveOptions) => {
      const accepted = await save(patch, preview, options);
      const changesDay =
        patch.timezone !== undefined ||
        patch.timezone_city !== undefined ||
        patch.mark_yesterday !== undefined;
      if (accepted && changesDay) {
        void refresh();
      }
    },
    [save, refresh],
  );

  // Выбранный пояс сразу виден в настройках (подпись — из каталога), сохраняется следом.
  const selectTimezone = useCallback(
    (timezone: TimezoneEntry) => {
      hideSettingsPage();
      if (!isCurrentTimezone(timezone, settings?.timezone ?? null, settings?.timezone_city ?? null)) {
        void saveSettings(
          timezone.city_id !== null ? { timezone_city: timezone.city_id } : { timezone: timezone.zone },
          {
            timezone: timezone.zone,
            timezone_city: timezone.city_id,
            timezone_display: timezone.city,
            timezone_offset: timezone.offset,
          },
        );
      }
    },
    [hideSettingsPage, saveSettings, settings?.timezone, settings?.timezone_city],
  );

  // Изменённая привычка заменяет прежнюю — возвращаемся на её экран. Новая добавляется в
  // конец (список отсортирован по id), и открывается список привычек.
  function saveHabit(saved: Habit): void {
    hapticNotification("success");
    setHabits((current) =>
      current.some((habit) => habit.id === saved.id)
        ? current.map((habit) => (habit.id === saved.id ? saved : habit))
        : [...current, saved],
    );
    if (editor?.habit == null) {
      // Форма открыта с другой вкладки: та запоминает свою позицию, а список привычек
      // открывается на своей.
      if (tab !== "habits") {
        tabScroll.current[tab] = scrollUnderEditor.current;
        scrollUnderEditor.current = tabScroll.current.habits;
      }
      setTab("habits");
    }
    hideEditor();
  }

  // Удалить привычку, убрать её из списка и вернуться к нему. Если на сервере её уже
  // нет (удалена с другого устройства), цель достигнута — считаем это успехом.
  const deleteOpenHabit = useCallback(
    async (taskId: number) => {
      try {
        await deleteHabit(taskId);
      } catch (error) {
        if (!(error instanceof ApiRequestError && error.code === "task_not_found")) {
          throw error;
        }
      }
      hapticNotification("success");
      hideHabit();
      setHabits((current) => current.filter((habit) => habit.id !== taskId));
    },
    [hideHabit, setHabits],
  );

  // В админ-панели кнопкой «Назад» управляет она сама (AdminApp).
  useBackButton(
    adminMode
      ? null
      : editor
        ? hideEditor
        : openHabit
          ? hideHabit
          : settingsPage
            ? hideSettingsPage
            : null,
  );

  // Пояс не выбран (новый пользователь, до этого считалось по UTC) — ставим пояс
  // устройства, один раз за запуск. Сервер пояс не принял (браузер назвал неизвестную
  // ему зону) — остаётся UTC, ошибка не показывается: пользователь ничего не менял.
  useEffect(() => {
    if (settings && settings.timezone === null && !deviceTimezoneSent.current) {
      deviceTimezoneSent.current = true;
      const zone = deviceTimezone();
      if (zone) {
        void saveSettings({ timezone: zone }, undefined, { silent: true });
      }
    }
  }, [settings, saveSettings]);

  // Web app: is the account still a guest («!», Settings). Asked again when the first
  // habit appears and after a login switched accounts.
  const loadAccount = useCallback(() => {
    if (web) {
      fetchAccount()
        .then(setAccount)
        .catch(() => undefined);
    }
  }, [web]);
  const hasHabits = habits.length > 0;
  useEffect(() => {
    loadAccount();
  }, [loadAccount, hasHabits]);

  // A login switched or merged accounts: everything on screen belongs to the new one.
  // (useSettings returns a new `reload` every render: read the latest through a ref, so
  // this callback — and the watchers that use it — stay stable.)
  const reloadSettings = useRef(settingsState.reload);
  reloadSettings.current = settingsState.reload;
  const reloadAccountData = useCallback(() => {
    reload();
    reloadSettings.current();
    loadAccount();
  }, [reload, loadAccount]);

  // A bot login confirmed: switch to that account.
  const telegramLinked = useCallback(() => {
    hapticNotification("success");
    setLinkError(null);
    reloadAccountData();
  }, [reloadAccountData]);
  useTelegramLoginWatcher(web, telegramLinked);

  const linkTelegram = useCallback(() => {
    setLinkError(null);
    beginTelegramBotLogin().catch((error: unknown) => {
      hapticNotification("error");
      setLinkError(error instanceof ApiRequestError ? error.code : "network_error");
    });
  }, []);

  // A notification tap opens its habit: at launch (`habit=<id>` in the address) or, with
  // the app already open, by a message from the service worker (sw.ts).
  useEffect(() => {
    const id = pendingHabit.current;
    if (id !== null && status === "ready" && !editor) {
      pendingHabit.current = null;
      if (habits.some((habit) => habit.id === id)) {
        const fromTab = tab !== "habits";
        if (fromTab) {
          tabScroll.current[tab] = settingsPage ? scrollUnderSettingsPage.current : window.scrollY;
        }
        setTab("habits");
        setSettingsPage(null);
        showHabit(id);
        if (fromTab) {
          // «Назад» с экрана привычки — на список, туда, где его оставили.
          scrollUnderHabit.current = tabScroll.current.habits;
        }
      }
    }
  }, [status, habits, editor, showHabit, tab, settingsPage]);
  useEffect(() => {
    if (!web || !("serviceWorker" in navigator)) {
      return undefined;
    }
    const onMessage = (event: MessageEvent): void => {
      const url = typeof event.data?.url === "string" ? event.data.url : "";
      const id = Number(new URL(url, window.location.origin).searchParams.get("habit"));
      if (event.data?.type === "open-habit" && Number.isInteger(id) && id > 0) {
        pendingHabit.current = id;
        void refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [web, refresh]);

  // Администратору — заранее загрузить админ-панель (см. loadAdminApp). Не вышло (нет
  // сети) — не страшно: при входе в панель файл загрузится ещё раз.
  useEffect(() => {
    if (settings?.is_admin) {
      loadAdminApp().catch(() => undefined);
    }
  }, [settings?.is_admin]);

  // Разворачиваем приложение один раз при монтировании.
  useEffect(() => {
    initTelegram();
  }, []);

  // Тема применяется до отрисовки: токены тёмной темы — в styles/variables.css. Фон и
  // шапка Telegram перекрашиваются в цвет фона новой темы.
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    setTelegramColors(readBackgroundColor());
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = strings.screenTitle;
  }, [language, strings]);

  // Запомнить вид приложения, чтобы следующий запуск сразу открылся в нём.
  useEffect(() => {
    if (settings) {
      savePreferences({
        language: settings.language,
        theme: settings.theme,
        markYesterday: settings.mark_yesterday,
      });
    }
  }, [settings]);

  // Вложенный экран открывается с начала, экран под ним — на сохранённой позиции.
  // Layout-эффект: прокрутка ставится до отрисовки и до эффектов шапки, читающих scrollY.
  // Шапка экрана (CollapsingHeader) по событию сразу принимает вид для этой позиции, без
  // анимации.
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
      window.dispatchEvent(new Event(SCROLL_RESTORED_EVENT));
    }
  });

  // Открыто вне Telegram без сессии веб-приложения — авторизоваться нечем (main.tsx сюда
  // так не пускает; на всякий случай объясняем пользователю).
  if (!telegramAvailable && !currentSessionToken()) {
    return (
      <main className={styles.fallback}>
        <StatusMessage
          icon="send"
          title={strings.outsideTitle}
          description={strings.outsideDescription}
        />
      </main>
    );
  }

  function renderScreen() {
    if (editor) {
      return (
        <HabitFormScreen
          key={editor.habit?.id ?? "new"}
          habit={editor.habit}
          onSaved={saveHabit}
        />
      );
    }
    if (openHabit) {
      return (
        <HabitScreen
          habit={openHabit}
          onToggle={toggle}
          animateEnter={habitEntering}
          onEdit={showEditor}
          onDelete={deleteOpenHabit}
        />
      );
    }
    if (tab === "settings") {
      if (settingsPage === "timezone") {
        return (
          <TimezoneScreen
            currentZone={settings?.timezone ?? null}
            currentCity={settings?.timezone_city ?? null}
            onSelect={selectTimezone}
          />
        );
      }
      if (settingsPage === "review") {
        return <ReviewScreen onClose={hideSettingsPage} />;
      }
      if (settingsPage === "privacy") {
        return <LegalScreen key={settingsPage} doc={strings.privacyPolicy} />;
      }
      if (settingsPage === "terms") {
        return <LegalScreen key={settingsPage} doc={strings.termsOfUse} />;
      }
      if (settingsPage === "account") {
        return (
          <AccountScreen
            label={telegramLabel}
            onLoggedOut={() => {
              hideSettingsPage();
              reloadAccountData();
            }}
          />
        );
      }
      if (settingsPage === "install") {
        return <InstallFromTelegramScreen src={start === "install" ? "bot" : "settings"} />;
      }
      return (
        <SettingsScreen
          state={settingsState}
          onSave={(patch) => void saveSettings(patch)}
          onOpen={showSettingsPage}
          onOpenAdmin={enterAdmin}
          install={telegramAvailable ? install : null}
          account={web && account ? { guest: account.is_guest, label: telegramLabel } : null}
          onLinkTelegram={linkTelegram}
          linkError={linkErrorText(linkError, strings)}
        />
      );
    }
    return (
      <HabitsScreen
        habits={habits}
        status={status}
        error={error}
        markYesterday={markYesterday}
        onToggle={toggle}
        onOpen={showHabit}
        onReload={reload}
      />
    );
  }

  if (adminMode) {
    return (
      <PreferencesContext.Provider value={preferences}>
        <Suspense fallback={<StatusMessage icon="spinner" title={strings.adminLoading} />}>
          <AdminApp
            settings={settingsState}
            onSaveSettings={(patch) => void saveSettings(patch)}
            onExit={exitAdmin}
          />
        </Suspense>
        {web ? <WebChrome /> : null}
      </PreferencesContext.Provider>
    );
  }

  return (
    <PreferencesContext.Provider value={preferences}>
      {renderScreen()}

      <TabBar
        tabs={tabs}
        active={tab}
        hidden={editor !== null || openHabit !== undefined || settingsPage !== null}
        onSelect={selectTab}
        onAdd={() => showEditor(null)}
        addLabel={strings.addHabit}
      />
      {web ? <WebChrome /> : null}
    </PreferencesContext.Provider>
  );
}
