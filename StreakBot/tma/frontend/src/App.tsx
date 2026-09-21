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
 *  - выбор часового пояса, политика конфиденциальности и условия использования — из
 *    настроек.
 * При возврате экран открывается на той же позиции прокрутки, на которой его оставили.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ApiRequestError } from "./api/client";
import { deleteHabit } from "./api/habits";
import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabKey } from "./components/TabBar";
import { useBackButton } from "./hooks/useBackButton";
import { useHabits } from "./hooks/useHabits";
import { useSettings } from "./hooks/useSettings";
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
import { SettingsScreen, type SettingsPage } from "./screens/SettingsScreen";
import { TimezoneScreen } from "./screens/TimezoneScreen";
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

/** Открытая форма привычки: редактируемая привычка или null — новая. */
interface Editor {
  habit: Habit | null;
}

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
  // Позиции прокрутки экранов, поверх которых открыт вложенный: при возврате — там же.
  const scrollUnderHabit = useRef(0);
  const scrollUnderEditor = useRef(0);
  const scrollUnderSettingsPage = useRef(0);
  // Прокрутка, которую нужно поставить после ближайшего рендера (см. layout-эффект ниже).
  const pendingScroll = useRef<number | null>(null);

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

  // Сохранить настройку. Пояс и режим «Отмечать за вчера» меняют день отметки — сервер
  // пересчитывает привычки, и список обновляется.
  const saveSettings = useCallback(
    async (patch: SettingsUpdate, preview?: Partial<Settings>) => {
      const accepted = await save(patch, preview);
      if (accepted && (patch.timezone !== undefined || patch.mark_yesterday !== undefined)) {
        void refresh();
      }
    },
    [save, refresh],
  );

  // Выбранный пояс сразу виден в настройках (подпись — из каталога), сохраняется следом.
  const selectTimezone = useCallback(
    (timezone: TimezoneEntry) => {
      hideSettingsPage();
      if (timezone.id !== settings?.timezone) {
        void saveSettings(
          { timezone: timezone.id },
          { timezone_display: timezone.city, timezone_offset: timezone.offset },
        );
      }
    },
    [hideSettingsPage, saveSettings, settings?.timezone],
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

  useBackButton(
    editor ? hideEditor : openHabit ? hideHabit : settingsPage ? hideSettingsPage : null,
  );

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
          emoji={strings.outsideEmoji}
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
        return <TimezoneScreen current={settings?.timezone ?? null} onSelect={selectTimezone} />;
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

  return (
    <PreferencesContext.Provider value={preferences}>
      {renderScreen()}

      <TabBar
        active={tab}
        hidden={editor !== null || openHabit !== undefined || settingsPage !== null}
        onSelect={setTab}
        onAdd={() => showEditor(null)}
      />
    </PreferencesContext.Provider>
  );
}
