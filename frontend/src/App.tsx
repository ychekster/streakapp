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
 *  - экран привычки — нажатием на привычку в списке; поверх него у групповой — страница
 *    участника (GroupMemberScreen), нажатием на участника, и у владельца «Чёрный список»
 *    (GroupBlockedScreen);
 *  - форма привычки — кнопкой «+» (новая) или «Редактировать привычку» на экране
 *    привычки; «Назад» закрывает её без сохранения. Созданная групповая («Вести с
 *    друзьями» в форме) открывает свой экран — там «Добавить участника»;
 *  - выбор часового пояса, «Написать отзыв», «Папки», политика конфиденциальности и
 *    условия использования — из настроек. Поверх «Папок» — форма папки, поверх неё —
 *    выбор привычек в папку (черновик формы — здесь, folderDraft). «Написать отзыв» открывает и кнопка под рассылкой:
 *    приложение запускается сразу на нём (параметр адреса `open=review`). Так же кнопка
 *    «Добавить привычку» открывает сразу форму новой привычки (`open=new_habit`).
 * Когда есть папки, над списком привычек — их таблетка; выбранная папка помнится до
 * закрытия приложения (при запуске — первая вкладка). Новая привычка, созданная, пока
 * выбрана папка, попадает в эту папку.
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
 * is only in Telegram.
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

import { ApiRequestError, type ApiErrorCode } from "./api/client";
import { loadMeta, loadTimezones } from "./api/meta";
import { loadReviews } from "./api/reviews";
import { fetchAccount, type Account } from "./api/web";
import { SCROLL_RESTORED_EVENT, type ScrollRestoredDetail } from "./components/CollapsingHeader";
import { CountSheet } from "./components/CountSheet";
import { DaySheet } from "./components/DaySheet";
import { GridViewContext } from "./components/gridLayout";
import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabItem } from "./components/TabBar";
import { TimerBar } from "./components/TimerBar";
import { closeTimerScreen, TimerScreen, useTimerScreenHabit } from "./components/TimerScreen";
import { UndoToast } from "./components/UndoToast";
import { HabitsIcon, SettingsIcon } from "./components/TabIcons";
import { markingDay } from "./data/dates";
import { isShared } from "./data/derive";
import { preloadMemberHabits, preloadMemberPhotos } from "./data/groups";
import { dataStore } from "./data/store";
import { useAppData } from "./hooks/useAppData";
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
import { GroupBlockedScreen } from "./screens/GroupBlockedScreen";
import { GroupMemberScreen } from "./screens/GroupMemberScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { LegalScreen } from "./screens/LegalScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { CheckinReminderScreen } from "./screens/CheckinReminderScreen";
import { GridLayoutScreen } from "./screens/GridLayoutScreen";
import { FolderFormScreen, type FolderDraft } from "./screens/FolderFormScreen";
import { FolderHabitsScreen } from "./screens/FolderHabitsScreen";
import { FoldersScreen } from "./screens/FoldersScreen";
import type { FolderBarState } from "./screens/HabitsScreen";
import { SettingsScreen, type SettingsPage } from "./screens/SettingsScreen";
import { isCurrentTimezone, TimezoneScreen } from "./screens/TimezoneScreen";
import { currentSessionToken } from "./web/session";
import { PREFETCH_DELAY_MS } from "./constants";
import { describeError } from "./errors";
import { STRINGS } from "./strings";
import {
  getTelegramUserLabel,
  hapticNotification,
  hapticSelection,
  initTelegram,
  showAlert,
  setTelegramColors,
} from "./telegram/webapp";
import type { Folder, FolderKind } from "./types/folder";
import type { GroupMember, Habit } from "./types/habit";
import type { TimezoneEntry } from "./types/meta";
import type { Settings, SettingsUpdate } from "./types/settings";
import { keepAccount, keptAccount } from "./web/account";
import { trackAppOpen, trackPushOpen } from "./web/analytics";
import { authNotice, SESSION_CHANGED_EVENT } from "./web/bootstrap";
import { beginTelegramBotLogin } from "./web/login";
import { ScrollIndicator } from "./web/ScrollIndicator";
import { MainButtonBar, WebChrome } from "./web/WebChrome";
import styles from "./App.module.css";

// Цвет фона берём из дизайн-токена (CSS-переменной), а не хардкодим в коде.
function readBackgroundColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  return value || "#f2f2f6";
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
type StartScreen = "review" | "new_habit";

/**
 * Экран, на котором открыть приложение, — параметр `open` его адреса. Его ставят кнопки
 * под рассылкой из админ-панели (backend/messaging.py, app_url): «Написать отзыв» —
 * экран отзыва, «Добавить привычку» — форма новой привычки. Без параметра (обычный
 * запуск) или с незнакомым значением — null.
 */
function startScreen(): StartScreen | null {
  try {
    const screen = new URLSearchParams(window.location.search).get("open");
    return screen === "review" || screen === "new_habit" ? screen : null;
  } catch {
    return null;
  }
}

// Админ-панель — отдельным файлом: она нужна только администраторам, и остальные его не
// загружают (приложение открывается быстрее). Администратору файл подгружается заранее —
// как только из настроек известно, что он администратор (см. эффект в App), — поэтому
// при входе в панель ждать не приходится.
const loadAdminApp = () => import("./admin/AdminApp");
const AdminApp = lazy(() => loadAdminApp().then((module) => ({ default: module.AdminApp })));

/** Habit a push notification opens (`habit=<id>` in the address), or null. */
function startHabit(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get("habit"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

// A bot login that failed while the app was closed (bootstrap) has been shown — once per
// run (StrictMode runs effects twice).
let startLinkErrorShown = false;

/** Открытая форма привычки: редактируемая привычка или null — новая. */
interface Editor {
  habit: Habit | null;
}

type TabKey = "habits" | "settings";

/** The Mini App's share of WebChrome: the scroll indicator and the bottom button. */
function TelegramChrome() {
  return (
    <>
      <ScrollIndicator />
      <MainButtonBar />
    </>
  );
}

export function App() {
  const { habits, status, error, reload, refresh } = useHabits();
  const settingsState = useSettings();
  const { settings, save } = settingsState;
  const { rejected, folders, allHabitsPosition } = useAppData();
  const toggle = useToggle();
  const platform = usePlatform();
  const telegramAvailable = platform === "telegram";
  const web = platform === "web";
  // «Открыл приложение» и откуда — для аналитики админ-панели (на экране ничего не меняет).
  useEffect(trackAppOpen, []);
  // Фото участников совместных привычек — заранее, чтобы экран привычки открывался с ними.
  useEffect(() => preloadMemberPhotos(habits), [habits]);
  // И страницы участников — открываются сразу целиком.
  useEffect(() => preloadMemberHabits(habits), [habits]);
  // Открыто кнопкой под рассылкой: «Написать отзыв» — сразу экран отзыва (над
  // настройками, куда и вернёт «Назад»), «Добавить привычку» — форма новой привычки (над
  // списком привычек).
  const [start] = useState(startScreen);
  const [tab, setTab] = useState<TabKey>(start === "review" ? "settings" : "habits");
  const [openHabitId, setOpenHabitId] = useState<number | null>(null);
  // Страница участника групповой привычки поверх экрана привычки: его Telegram id.
  const [openMemberId, setOpenMemberId] = useState<number | null>(null);
  // «Чёрный список» групповой привычки поверх экрана привычки (владелец).
  const [blockedOpen, setBlockedOpen] = useState(false);
  // Экран привычки въезжает при открытии из списка, но не при возврате из формы.
  const [habitEntering, setHabitEntering] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(
    start === "new_habit" ? { habit: null } : null,
  );
  // «Дополнительно» поверх формы привычки (рисует её же экран, см. HabitFormScreen).
  const [editorAdvanced, setEditorAdvanced] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(
    start === "review" ? "review" : null,
  );
  // Форма папки (Настройки → «Папки») и выбор привычек в неё поверх формы.
  const [folderDraft, setFolderDraft] = useState<FolderDraft | null>(null);
  const [folderPicker, setFolderPicker] = useState(false);
  // Выбранная вкладка таблетки папок: "all" или id папки; null — первая.
  const [folderTab, setFolderTab] = useState<string | null>(null);
  // The account: in the web app — guest or not («!» on the Settings tab, Settings); in
  // both — what Settings → «Аккаунт» shows. Kept on the device in the web app only.
  const [account, setAccount] = useState<Account | null>(() => (web ? keptAccount() : null));
  // The account could not be loaded (no connection) and none is kept: the row says so.
  const [accountOffline, setAccountOffline] = useState(false);
  const pendingHabit = useRef(startHabit());
  // A notification tap with the app already open: the effect that opens the habit runs
  // again even when the habits did not change.
  const [habitTap, setHabitTap] = useState(0);
  const install = useHandoffLink("settings", telegramAvailable && tab === "settings");
  const [adminMode, setAdminMode] = useState(false);
  // Позиции прокрутки экранов, поверх которых открыт вложенный: при возврате — там же.
  const scrollUnderHabit = useRef(0);
  const scrollUnderMember = useRef(0);
  const scrollUnderBlocked = useRef(0);
  const scrollUnderEditor = useRef(0);
  const scrollUnderAdvanced = useRef(0);
  const scrollUnderSettingsPage = useRef(0);
  const scrollUnderFolderForm = useRef(0);
  const scrollUnderFolderPicker = useRef(0);
  const scrollUnderAdmin = useRef(0);
  // Позиция прокрутки каждой вкладки, пока открыта другая.
  const tabScroll = useRef<Record<TabKey, number>>({ habits: 0, settings: 0 });
  // Прокрутка, которую нужно поставить после ближайшего рендера (см. layout-эффект ниже).
  const pendingScroll = useRef<number | null>(null);
  // Эта прокрутка — возврат «Назад» на экран под закрытым (см. Screen, enterAnimation).
  const pendingBack = useRef(false);
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
  // «Вид сетки» и день отметки для сеток привычек (components/gridLayout.ts).
  // Новый день приходит с пересчётом привычек (data/store.ts) — и с ним новый рендер.
  const gridLayout = settings?.grid_layout ?? "rolling";
  const gridDay = settings ? markingDay(settings.timezone, settings.mark_yesterday) : null;
  const gridView = useMemo(
    () => ({ layout: gridLayout, day: gridDay }),
    [gridLayout, gridDay],
  );

  const openHabit = habits.find((habit) => habit.id === openHabitId);
  // Участника больше нет в привычке (вышел, исключён) — его страница закрывается.
  const openMember =
    openHabit?.group?.members.find((member) => member.user_id === openMemberId) ?? null;

  // Таблетка папок над списком: папки и «Все привычки» на своём месте. Выбранной папки
  // больше нет — первая вкладка.
  const folderTabs = useMemo(() => {
    const tabs = folders.map((folder) => ({ key: String(folder.id), label: folder.name }));
    tabs.splice(Math.min(allHabitsPosition, tabs.length), 0, {
      key: "all",
      label: strings.foldersAll,
    });
    return tabs;
  }, [folders, allHabitsPosition, strings]);
  const activeFolderTab =
    folderTabs.find((item) => item.key === folderTab)?.key ?? folderTabs[0].key;
  const activeFolder =
    activeFolderTab === "all"
      ? null
      : (folders.find((folder) => String(folder.id) === activeFolderTab) ?? null);
  // «Невыполненные»: отмеченная привычка не пропадает из открытой папки сразу — её можно
  // снять обратно (и открыть привычку или форму новой); уходит, когда сменили папку —
  // в том числе на «Все привычки» — или вкладку.
  const keptInFolder = useRef({ key: "", ids: new Set<number>() });
  const shownHabits = useMemo(() => {
    if (!activeFolder) {
      keptInFolder.current = { key: "", ids: new Set() };
      return habits;
    }
    const kept = keptInFolder.current;
    const key = `${tab}:${activeFolder.id}`;
    if (kept.key !== key || activeFolder.kind !== "unfinished") {
      keptInFolder.current = { key, ids: new Set() };
    }
    const ids = keptInFolder.current.ids;
    const shown = habits.filter(
      (habit) => activeFolder.habits.includes(habit.id) || ids.has(habit.id),
    );
    if (activeFolder.kind === "unfinished") {
      shown.forEach((habit) => ids.add(habit.id));
    }
    return shown;
  }, [habits, activeFolder, tab]);
  const folderBar: FolderBarState | null =
    folders.length > 0
      ? {
          tabs: folderTabs,
          active: activeFolderTab,
          onSelect: (key) => {
            if (key !== activeFolderTab) {
              hapticSelection();
              setFolderTab(key);
            }
          },
          inFolder: activeFolder !== null,
          kind: activeFolder?.kind ?? null,
          swipe: settings?.folder_swipe ?? false,
        }
      : null;
  // In the Mini App Telegram itself says who it is (also before the account loads).
  const telegramLabel =
    (web ? null : getTelegramUserLabel()) ??
    account?.logins.find((login) => login.provider === "telegram")?.label ??
    null;

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
    setOpenMemberId(null);
    setBlockedOpen(false);
    setOpenHabitId(taskId);
  }, []);

  const hideHabit = useCallback(() => {
    pendingScroll.current = scrollUnderHabit.current;
    pendingBack.current = true;
    setOpenMemberId(null);
    setBlockedOpen(false);
    setOpenHabitId(null);
  }, []);

  const showMember = useCallback((member: GroupMember) => {
    scrollUnderMember.current = window.scrollY;
    pendingScroll.current = 0;
    setOpenMemberId(member.user_id);
  }, []);

  const hideMember = useCallback(() => {
    pendingScroll.current = scrollUnderMember.current;
    pendingBack.current = true;
    setHabitEntering(false);
    setOpenMemberId(null);
  }, []);
  useEffect(() => {
    if (openMemberId !== null && openMember === null) {
      hideMember();
    }
  }, [openMemberId, openMember, hideMember]);

  const showBlocked = useCallback(() => {
    scrollUnderBlocked.current = window.scrollY;
    pendingScroll.current = 0;
    setBlockedOpen(true);
  }, []);

  const hideBlocked = useCallback(() => {
    pendingScroll.current = scrollUnderBlocked.current;
    pendingBack.current = true;
    setHabitEntering(false);
    setBlockedOpen(false);
  }, []);
  // Привычка перестала быть моей групповой (вышел, владельцем стал другой) — список
  // закрывается сам.
  const blockedGroup = openHabit?.group?.is_owner ? openHabit.group : null;
  useEffect(() => {
    if (blockedOpen && blockedGroup === null) {
      hideBlocked();
    }
  }, [blockedOpen, blockedGroup, hideBlocked]);

  const showEditor = useCallback((habit: Habit | null) => {
    scrollUnderEditor.current = window.scrollY;
    pendingScroll.current = 0;
    setEditorAdvanced(false);
    setEditor({ habit });
  }, []);

  const hideEditor = useCallback(() => {
    pendingScroll.current = scrollUnderEditor.current;
    pendingBack.current = true;
    setHabitEntering(false);
    setEditorAdvanced(false);
    setEditor(null);
  }, []);

  // «Назад» из формы: изменённую привычку форма сначала сохраняет (HabitFormScreen,
  // `leave`) — тогда она уже вернулась на экран привычки (saveHabit).
  const editorLeave = useRef<(() => boolean) | null>(null);
  const leaveEditor = useCallback(() => {
    if (!editorLeave.current?.()) {
      hideEditor();
    }
  }, [hideEditor]);

  const showEditorAdvanced = useCallback(() => {
    scrollUnderAdvanced.current = window.scrollY;
    pendingScroll.current = 0;
    setEditorAdvanced(true);
  }, []);

  const hideEditorAdvanced = useCallback(() => {
    pendingScroll.current = scrollUnderAdvanced.current;
    pendingBack.current = true;
    setEditorAdvanced(false);
  }, []);

  const showSettingsPage = useCallback((page: SettingsPage) => {
    scrollUnderSettingsPage.current = window.scrollY;
    pendingScroll.current = 0;
    setSettingsPage(page);
  }, []);

  const hideSettingsPage = useCallback(() => {
    pendingScroll.current = scrollUnderSettingsPage.current;
    pendingBack.current = true;
    setSettingsPage(null);
  }, []);

  const showFolderForm = useCallback((folder: Folder | null) => {
    scrollUnderFolderForm.current = window.scrollY;
    pendingScroll.current = 0;
    setFolderDraft({
      folder,
      name: folder?.name ?? "",
      habits: folder?.picked ?? folder?.habits ?? [],
      types: folder?.types ?? [],
    });
  }, []);

  const hideFolderForm = useCallback(() => {
    pendingScroll.current = scrollUnderFolderForm.current;
    pendingBack.current = true;
    setFolderDraft(null);
  }, []);

  const showFolderPicker = useCallback(() => {
    scrollUnderFolderPicker.current = window.scrollY;
    pendingScroll.current = 0;
    setFolderPicker(true);
  }, []);

  const hideFolderPicker = useCallback(() => {
    pendingScroll.current = scrollUnderFolderPicker.current;
    pendingBack.current = true;
    setFolderPicker(false);
  }, []);

  const enterAdmin = useCallback(() => {
    scrollUnderAdmin.current = window.scrollY;
    pendingScroll.current = 0;
    setAdminMode(true);
  }, []);

  // Выход из админ-панели — на экран настроек, откуда в неё вошли.
  const exitAdmin = useCallback(() => {
    pendingScroll.current = scrollUnderAdmin.current;
    pendingBack.current = true;
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

  // Сохранить настройку. Пояс и режим «Отмечать за вчера» меняют день отметки — список
  // привычек пересчитывается сразу (data/derive.ts).
  const saveSettings = useCallback(
    (patch: SettingsUpdate, preview?: Partial<Settings>, options?: SaveOptions) => {
      save(patch, preview, options);
    },
    [save],
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

  // Привычка уже сохранена (на устройстве, сервер — следом): изменённая — возвращаемся на
  // её экран, новая (она в конце списка) — открывается список привычек. Новая, пока
  // выбрана папка, попадает в неё — иначе её не было бы видно в открывшемся списке.
  // Новая групповая открывает свой экран: там «Добавить участника» и видно, кто
  // присоединился.
  function saveHabit(habit: Habit): void {
    hapticNotification("success");
    if (editor?.habit == null && activeFolder) {
      dataStore.addToFolder(activeFolder.id, habit.id);
    }
    if (editor?.habit == null) {
      // Форма открыта с другой вкладки: та запоминает свою позицию, а список привычек
      // открывается на своей.
      if (tab !== "habits") {
        tabScroll.current[tab] = scrollUnderEditor.current;
        scrollUnderEditor.current = tabScroll.current.habits;
      }
      setTab("habits");
    }
    if (editor?.habit == null && isShared(habit)) {
      scrollUnderHabit.current = scrollUnderEditor.current;
      pendingScroll.current = 0;
      setEditor(null);
      setHabitEntering(true);
      setOpenHabitId(habit.id);
      return;
    }
    hideEditor();
  }

  // Рекомендуемая папка (Настройки → «Папки») создаётся сразу, под своим названием.
  function addRecommendedFolder(kind: FolderKind): void {
    try {
      dataStore.createFolder(strings.folderKindNames[kind], [], kind);
      hapticNotification("success");
    } catch (error) {
      hapticNotification("error");
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.folderSaveFailed,
        message: describeError(strings, error, strings.folderSaveFailed),
      });
    }
  }

  // Заморозить привычку и вернуться к списку или разморозить её, оставшись на экране —
  // сразу, сервер узнает следом.
  const freezeHabit = useCallback(
    (taskId: number, frozen: boolean) => {
      hapticNotification("success");
      if (frozen) {
        hideHabit();
      }
      dataStore.setFrozen(taskId, frozen);
    },
    [hideHabit],
  );

  // Автоотметка — сразу, сервер узнает следом.
  const setAutoMark = useCallback((taskId: number, on: boolean) => {
    dataStore.setAutoMark(taskId, on);
  }, []);

  // Удалить привычку и вернуться к списку — сразу, сервер узнает следом.
  const deleteOpenHabit = useCallback(
    async (taskId: number) => {
      hapticNotification("success");
      hideHabit();
      dataStore.deleteHabit(taskId);
    },
    [hideHabit],
  );

  const tabBarHidden = editor !== null || openHabit !== undefined || settingsPage !== null;

  const timerScreenOpen = useTimerScreenHabit() !== null;

  // В админ-панели кнопкой «Назад» управляет она сама (AdminApp).
  useBackButton(
    adminMode
      ? null
      : timerScreenOpen
        ? closeTimerScreen
        : editor
        ? editorAdvanced
          ? hideEditorAdvanced
          : leaveEditor
        : blockedOpen
          ? hideBlocked
          : openMember
          ? hideMember
          : openHabit
          ? hideHabit
          : folderPicker
            ? hideFolderPicker
            : folderDraft
              ? hideFolderForm
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

  // The account. Web app: is it still a guest («!», Settings) — asked again when the first
  // habit appears and after a login switched accounts. Both: again when «Аккаунт» opens.
  const loadAccount = useCallback(() => {
    fetchAccount()
      .then((loaded) => {
        if (web) {
          keepAccount(loaded);
        }
        setAccount(loaded);
        setAccountOffline(false);
      })
      .catch(() => {
        if (web) {
          // After a login switch the kept one is another session's.
          setAccount(keptAccount());
          setAccountOffline(true);
        }
      });
  }, [web]);
  const hasHabits = habits.length > 0;
  useEffect(() => {
    if (web) {
      loadAccount();
    }
  }, [web, loadAccount, hasHabits]);
  useEffect(() => {
    if (settingsPage === "account") {
      loadAccount();
    }
  }, [settingsPage, loadAccount]);
  // Mini App: nothing is kept on the device — load it when Settings opens, so «Аккаунт»
  // opens with its devices already there instead of them appearing a moment later.
  const settingsOpen = tab === "settings";
  useEffect(() => {
    if (!web && settingsOpen) {
      loadAccount();
    }
  }, [web, settingsOpen, loadAccount]);

  // A login switched or merged accounts: everything on screen belongs to the new one.
  const reloadAccountData = useCallback(() => {
    dataStore.switchAccount();
    loadAccount();
  }, [loadAccount]);

  // The web session was replaced at start (web/bootstrap.ts): the data is another account's.
  useEffect(() => {
    if (!web) {
      return undefined;
    }
    window.addEventListener(SESSION_CHANGED_EVENT, reloadAccountData);
    return () => window.removeEventListener(SESSION_CHANGED_EVENT, reloadAccountData);
  }, [web, reloadAccountData]);

  // A bot login confirmed: switch to that account.
  const telegramLinked = useCallback(() => {
    hapticNotification("success");
    reloadAccountData();
  }, [reloadAccountData]);
  useTelegramLoginWatcher(web, telegramLinked);

  // Errors are shown in a dialog: linking Telegram (now, or a bot login that failed while
  // the app was closed) and saving a setting (the admin panel shows its own).
  const linkTelegram = useCallback(() => {
    beginTelegramBotLogin().catch((error: unknown) => {
      hapticNotification("error");
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.accountLinkFailed,
        message: describeError(strings, error, strings.accountActionFailed),
      });
    });
  }, [strings]);
  useEffect(() => {
    const notice = authNotice();
    if (notice?.kind === "error" && !startLinkErrorShown) {
      startLinkErrorShown = true;
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.accountLinkFailed,
        message: describeError(
          strings,
          new ApiRequestError(0, notice.code as ApiErrorCode, ""),
          strings.accountActionFailed,
        ),
      });
    }
    // Once, at start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A change made on the device that the server refused when it got it (another device
  // took the habit's name meanwhile…): the change is gone from the screen — say why.
  useEffect(() => {
    if (rejected) {
      hapticNotification("error");
      void showAlert({
        okLabel: strings.alertOk,
        title: rejected.kind === "create" ? strings.formCreateFailed : strings.formEditFailed,
        message: describeError(strings, rejected.error, strings.accountActionFailed),
      });
    }
    // Only a new refusal, not a change of language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejected]);
  const saveError = settingsState.saveError;
  useEffect(() => {
    if (saveError && !adminMode) {
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.settingsSaveFailed,
        message: describeError(strings, saveError, strings.accountActionFailed),
      });
    }
    // Only a new error, not a change of language or mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveError]);

  // A notification tap opens its habit: at launch (`habit=<id>` in the address) or, with
  // the app already open, by a message from the service worker (sw.ts).
  useEffect(() => {
    const id = pendingHabit.current === null ? null : dataStore.displayId(pendingHabit.current);
    if (id !== null && status === "ready" && !editor) {
      pendingHabit.current = null;
      if (habits.some((habit) => habit.id === id)) {
        const fromTab = tab !== "habits";
        if (fromTab) {
          tabScroll.current[tab] = settingsPage ? scrollUnderSettingsPage.current : window.scrollY;
        }
        setTab("habits");
        setSettingsPage(null);
        setFolderDraft(null);
        setFolderPicker(false);
        showHabit(id);
        if (fromTab) {
          // «Назад» с экрана привычки — на список, туда, где его оставили.
          scrollUnderHabit.current = tabScroll.current.habits;
        }
      }
    }
  }, [status, habits, editor, showHabit, tab, settingsPage, habitTap]);
  useEffect(() => {
    if (!web || !("serviceWorker" in navigator)) {
      return undefined;
    }
    const onMessage = (event: MessageEvent): void => {
      const url = typeof event.data?.url === "string" ? event.data.url : "";
      const id = Number(new URL(url, window.location.origin).searchParams.get("habit"));
      if (event.data?.type === "open-habit") {
        trackPushOpen();
      }
      if (event.data?.type === "open-habit" && Number.isInteger(id) && id > 0) {
        pendingHabit.current = id;
        setHabitTap((count) => count + 1);
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

  // Справочники форм (лимит названия, каталог поясов) и история отзывов — заранее, когда
  // приложение уже открылось: форма привычки, выбор пояса и экран отзыва потом
  // открываются без ожидания сети.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadMeta().catch(() => undefined);
      loadTimezones(language).catch(() => undefined);
      // История отзывов — экран «Написать отзыв» открывается сразу со списком.
      loadReviews().catch(() => undefined);
    }, PREFETCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [language]);

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
  // анимации, а экран, на который вернулись «Назад», не въезжает заново (Screen).
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
      const detail: ScrollRestoredDetail = { back: pendingBack.current };
      pendingBack.current = false;
      window.dispatchEvent(new CustomEvent(SCROLL_RESTORED_EVENT, { detail }));
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
          // Групповую гостю веб-приложения — после входа через Telegram.
          sharedNeedsTelegram={web && account?.is_guest === true}
          onLinkTelegram={linkTelegram}
          onSaved={saveHabit}
          advanced={editorAdvanced}
          onOpenAdvanced={showEditorAdvanced}
          leaveRef={editorLeave}
        />
      );
    }
    if (openHabit && blockedGroup && blockedOpen) {
      return (
        <GroupBlockedScreen habit={openHabit} group={blockedGroup} onLinkTelegram={linkTelegram} />
      );
    }
    if (openHabit?.group && openMember) {
      return (
        <GroupMemberScreen
          key={openMember.user_id}
          habit={openHabit}
          group={openHabit.group}
          member={openMember}
          onToggle={toggle}
          onRemoved={hideMember}
          onLinkTelegram={linkTelegram}
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
          onFreeze={freezeHabit}
          onAutoMark={setAutoMark}
          onDelete={deleteOpenHabit}
          onLinkTelegram={linkTelegram}
          onOpenMember={showMember}
          onOpenBlocked={showBlocked}
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
      if (settingsPage === "checkinReminder" && settings) {
        return (
          <CheckinReminderScreen
            settings={settings}
            onSave={(reminder) =>
              void saveSettings(
                { checkin_reminder: reminder },
                { checkin_reminder_time: reminder.time, checkin_reminder_days: reminder.days },
              )
            }
          />
        );
      }
      if (settingsPage === "gridLayout") {
        return (
          <GridLayoutScreen
            value={gridLayout}
            onChange={(layout) => void saveSettings({ grid_layout: layout })}
          />
        );
      }
      if (settingsPage === "folders" && folderDraft && folderPicker) {
        return (
          <FolderHabitsScreen
            habits={habits}
            selected={folderDraft.habits}
            selectedTypes={folderDraft.types}
            onDone={(selected, types) => {
              setFolderDraft({ ...folderDraft, habits: selected, types });
              hideFolderPicker();
            }}
          />
        );
      }
      if (settingsPage === "folders" && folderDraft) {
        return (
          <FolderFormScreen
            key={folderDraft.folder?.id ?? "new"}
            draft={folderDraft}
            habits={habits}
            onChangeName={(name) => setFolderDraft({ ...folderDraft, name })}
            onPickHabits={showFolderPicker}
            onDone={hideFolderForm}
          />
        );
      }
      if (settingsPage === "folders") {
        return (
          <FoldersScreen
            folders={folders}
            allHabitsPosition={allHabitsPosition}
            onCreate={() => showFolderForm(null)}
            onOpen={showFolderForm}
            onDelete={(folder) => dataStore.deleteFolder(folder.id)}
            onReorder={(order) => dataStore.orderFolders(order)}
            onAddRecommended={addRecommendedFolder}
            swipe={settings?.folder_swipe ?? false}
            onSwipeChange={(on) => saveSettings({ folder_swipe: on })}
          />
        );
      }
      if (settingsPage === "review") {
        return <ReviewScreen />;
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
            account={account}
            habits={habits}
            onLoggedOut={() => {
              hideSettingsPage();
              reloadAccountData();
            }}
            onLoggedOutEverywhere={loadAccount}
          />
        );
      }
      if (settingsPage === "install") {
        return <InstallFromTelegramScreen src="settings" />;
      }
      return (
        <SettingsScreen
          state={settingsState}
          onSave={(patch) => void saveSettings(patch)}
          onOpen={showSettingsPage}
          onOpenAdmin={enterAdmin}
          install={telegramAvailable ? install : null}
          account={
            !web
              ? { guest: false, label: telegramLabel, status: "known" }
              : account
                ? { guest: account.is_guest, label: telegramLabel, status: "known" }
                : { guest: false, label: null, status: accountOffline ? "offline" : "loading" }
          }
          folderCount={folders.length}
          onRetryAccount={loadAccount}
          onLinkTelegram={linkTelegram}
        />
      );
    }
    return (
      <HabitsScreen
        habits={shownHabits}
        folders={folderBar}
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
        {/* Telegram draws its own back button; the bottom button and scroll indicator are ours. */}
        {web ? <WebChrome /> : <TelegramChrome />}
      </PreferencesContext.Provider>
    );
  }

  return (
    <PreferencesContext.Provider value={preferences}>
      <GridViewContext.Provider value={gridView}>{renderScreen()}</GridViewContext.Provider>

      <TabBar
        tabs={tabs}
        active={tab}
        hidden={tabBarHidden}
        onSelect={selectTab}
        onAdd={() => showEditor(null)}
        addLabel={strings.addHabit}
      />
      {/* «Сверх плана»: плашка «Отменить» после серии нажатий и окно счёта (удержание). */}
      <UndoToast aboveTabBar={!tabBarHidden} />
      {/* «Цель по времени»: мини-плеер идущего таймера и таймер на весь экран. */}
      <TimerBar aboveTabBar={!tabBarHidden} />
      <TimerScreen />
      <CountSheet />
      {/* Окно дня: нажатие на день в календаре привычки. */}
      <DaySheet />
      {web ? <WebChrome /> : <TelegramChrome />}
    </PreferencesContext.Provider>
  );
}
