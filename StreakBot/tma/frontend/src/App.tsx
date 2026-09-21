/**
 * Корневой каркас приложения: разворачивает Mini App на весь экран, держит общее
 * состояние привычек и переключает экраны через нижнюю навигацию.
 *
 * Экраны рендерятся по одному (документ-скролл и сворачивающаяся шапка не должны
 * конфликтовать). Состояние привычек живёт здесь, поэтому переключение вкладок не
 * теряет данные, а создание привычки сразу обновляет список.
 */

import { useEffect, useState } from "react";

import { StatusMessage } from "./components/StatusMessage";
import { TabBar, type TabKey } from "./components/TabBar";
import { useHabits } from "./hooks/useHabits";
import { useToggle } from "./hooks/useToggle";
import { CreateHabitScreen } from "./screens/CreateHabitScreen";
import { HabitsScreen } from "./screens/HabitsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { STRINGS } from "./strings";
import { initTelegram, isTelegramAvailable } from "./telegram/webapp";
import styles from "./App.module.css";

// Цвет фона берём из дизайн-токена (CSS-переменной), а не хардкодим в коде.
function readBackgroundColor(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--color-background")
    .trim();
  return value || "#f2f2f7";
}

export function App() {
  const { habits, status, errorMessage, setHabits, reload } = useHabits();
  const toggle = useToggle(setHabits);
  const telegramAvailable = isTelegramAvailable();
  const [tab, setTab] = useState<TabKey>("habits");
  const [creating, setCreating] = useState(false);

  // Разворачиваем приложение и красим фон один раз при монтировании.
  useEffect(() => {
    initTelegram(readBackgroundColor());
  }, []);

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

  return (
    <>
      {tab === "habits" ? (
        <HabitsScreen
          habits={habits}
          status={status}
          errorMessage={errorMessage}
          onToggle={toggle}
          onReload={reload}
        />
      ) : (
        <SettingsScreen />
      )}

      <TabBar active={tab} onSelect={setTab} onAdd={() => setCreating(true)} />

      {creating ? (
        <CreateHabitScreen
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setTab("habits");
            reload();
          }}
        />
      ) : null}
    </>
  );
}
