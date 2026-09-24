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
 *    использования — из настроек.
 * При возврате экран открывается на той же позиции прокрутки, на которой его оставили.
 *
 * Пока часовой пояс не выбран (первый запуск), приложение ставит пояс устройства —
 * молча: его видно в настройках, и там же его можно поменять.
 *
 * Администратор может переключить приложение в режим админ-панели (ряд «Админ-панель» в
 * настройках): тогда вместо экранов и нижней навигации приложения — AdminApp, а
 * «Вернуться в приложение» в её настройках возвращает на экран настроек. Состояние
 * приложения (привычки, настройки) на это время сохраняется.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { AdminApp } from "./AdminApp";
import { ApiRequestError } from "./api/client";
import { deleteHabit } from "./api/habits";
import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabItem } from "./components/TabBar";
import { HabitsIcon, SettingsIcon } from "./components/TabIcons";
import { useBackButton } from "./hooks/useBackButton";
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
import { HabitFormScreen } from "./screens/HabitFormScreen";
import { HabitScreen } from "./screens/HabitScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { LegalScreen } from "./screens/LegalScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { SettingsScreen, type SettingsPage } from "./screens/SettingsScreen";
import { isCurrentTimezone, TimezoneScreen } from "./screens/TimezoneScreen";
import { STRINGS } from "./strings";
import {
  hapticNotification,
  initTelegram,
  isTelegramAvailable,
  setTelegramColors,
} from "./telegram/webapp";
import type { Habit } from "./types/habit";
import type { TimezoneEntry } from "./types/meta";
import type { Settings, SettingsUpdate } from "./types/settings";
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
  const [tab, setTab] = useState<TabKey>("habits");
  const [openHabitId, setOpenHabitId] = useState<number | null>(null);
  // Экран привычки въезжает при открытии из списка, но не при возврате из формы.
  const [habitEntering, setHabitEntering] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [adminMode, setAdminMode] = useState(false);
  // Позиции прокрутки экранов, поверх которых открыт вложенный: при возврате — там же.
  const scrollUnderHabit = useRef(0);
  const scrollUnderEditor = useRef(0);
  const scrollUnderSettingsPage = useRef(0);
  const scrollUnderAdmin = useRef(0);
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

  const tabs: TabItem<TabKey>[] = useMemo(
    () => [
      { key: "habits", label: strings.tabHabits, icon: (active) => <HabitsIcon filled={active} /> },
      { key: "settings", label: strings.tabSettings, icon: () => <SettingsIcon /> },
    ],
    [strings],
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
  useLayoutEffect(() => {
    if (pendingScroll.current !== null) {
      window.scrollTo(0, pendingScroll.current);
      pendingScroll.current = null;
    }
  });

  // Открыто вне Telegram — авторизоваться нечем, объясняем пользователю.
  if (!telegramAvailable) {
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
      return (
        <SettingsScreen
          state={settingsState}
          onSave={(patch) => void saveSettings(patch)}
          onOpen={showSettingsPage}
          onOpenAdmin={enterAdmin}
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
        <AdminApp
          settings={settingsState}
          onSaveSettings={(patch) => void saveSettings(patch)}
          onExit={exitAdmin}
        />
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
        onSelect={setTab}
        onAdd={() => showEditor(null)}
        addLabel={strings.addHabit}
      />
    </PreferencesContext.Provider>
  );
}
