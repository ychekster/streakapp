/**
 * Корневой каркас приложения: разворачивает Mini App на весь экран, держит общее
 * состояние привычек и переключает экраны через нижнюю навигацию.
 *
 * Экраны рендерятся по одному (документ-скролл и сворачивающаяся шапка не должны
 * конфликтовать). Состояние привычек живёт здесь, поэтому переключение вкладок не
 * теряет данные, а созданная или изменённая привычка сразу видна везде.
 *
 * Вложенные экраны открываются поверх вкладки; нижняя навигация на это время скрыта, а
 * «Закрыть» Telegram заменена на «Назад»:
 *  - экран привычки — нажатием на привычку в списке;
 *  - форма привычки — кнопкой «+» (новая привычка) или «Редактировать привычку» на
 *    экране привычки; «Назад» закрывает её без сохранения.
 * При возврате экран открывается на той же позиции прокрутки, на которой его оставили.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { ApiRequestError } from "./api/client";
import { deleteHabit } from "./api/habits";
import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabKey } from "./components/TabBar";
import { useBackButton } from "./hooks/useBackButton";
import { useHabits } from "./hooks/useHabits";
import { useToggle } from "./hooks/useToggle";
import { HabitFormScreen } from "./screens/HabitFormScreen";
import { HabitScreen } from "./screens/HabitScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { STRINGS } from "./strings";
import { hapticNotification, initTelegram, isTelegramAvailable } from "./telegram/webapp";
import type { Habit } from "./types/habit";
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
  const { habits, status, errorMessage, setHabits, reload } = useHabits();
  const toggle = useToggle(setHabits);
  const telegramAvailable = isTelegramAvailable();
  const [tab, setTab] = useState<TabKey>("habits");
  const [openHabitId, setOpenHabitId] = useState<number | null>(null);
  // Экран привычки въезжает при открытии из списка, но не при возврате из формы.
  const [habitEntering, setHabitEntering] = useState(true);
  const [editor, setEditor] = useState<Editor | null>(null);
  // Позиции прокрутки экранов, поверх которых открыт вложенный: при возврате — там же.
  const scrollUnderHabit = useRef(0);
  const scrollUnderEditor = useRef(0);
  // Прокрутка, которую нужно поставить после ближайшего рендера (см. layout-эффект ниже).
  const pendingScroll = useRef<number | null>(null);

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

  useBackButton(editor ? hideEditor : openHabit ? hideHabit : null);

  // Разворачиваем приложение и красим фон один раз при монтировании.
  useEffect(() => {
    initTelegram(readBackgroundColor());
  }, []);

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
          emoji={STRINGS.outsideEmoji}
          title={STRINGS.outsideTitle}
          description={STRINGS.outsideDescription}
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
      return <SettingsScreen />;
    }
    return (
      <HabitsScreen
        habits={habits}
        status={status}
        errorMessage={errorMessage}
        onToggle={toggle}
        onOpen={showHabit}
        onReload={reload}
      />
    );
  }

  return (
    <>
      {renderScreen()}

      <TabBar
        active={tab}
        hidden={editor !== null || openHabit !== undefined}
        onSelect={setTab}
        onAdd={() => showEditor(null)}
      />
    </>
  );
}
