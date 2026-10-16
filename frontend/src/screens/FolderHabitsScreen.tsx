/**
 * Выбор привычек в папку — открывается из формы папки «Добавить привычки», как «Чаты в
 * папке» в Telegram: поиск по названию и все привычки, у каждой — плашка её цвета с первой
 * буквой названия и кружок справа; нажатие на привычку отмечает её или снимает отметку.
 * Нижняя кнопка «Готово» возвращает выбор в форму, «Назад» — закрывает без изменений.
 */

import { useState } from "react";

import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card } from "../components/Section";
import { StatusMessage } from "../components/StatusMessage";
import { useMainButton } from "../hooks/useMainButton";
import { useStrings } from "../preferences";
import { hapticSelection } from "../telegram/webapp";
import { MAIN_BUTTON_ACCENT } from "../theme";
import type { Habit } from "../types/habit";
import styles from "./FolderHabitsScreen.module.css";

interface FolderHabitsScreenProps {
  habits: Habit[];
  /** Выбранные сейчас (id на экране). */
  selected: number[];
  onDone: (selected: number[]) => void;
}

export function FolderHabitsScreen({ habits, selected, onDone }: FolderHabitsScreenProps) {
  const strings = useStrings();
  const [chosen, setChosen] = useState(() => new Set(selected));
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? habits.filter((habit) => habit.name.toLowerCase().includes(needle))
    : habits;

  useMainButton(
    { text: strings.folderPickerDone, ...MAIN_BUTTON_ACCENT, active: true, progress: false },
    // В порядке списка привычек.
    () => onDone(habits.filter((habit) => chosen.has(habit.id)).map((habit) => habit.id)),
  );

  function toggle(id: number): void {
    hapticSelection();
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <Screen title={strings.folderPickerTitle} withTabBar={false} enterAnimation>
      {habits.length === 0 ? (
        <StatusMessage icon="check" title={strings.folderPickerEmpty} />
      ) : (
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={strings.folderPickerSearch}
            clearLabel={strings.timezoneSearchClear}
          />
          {shown.length === 0 ? (
            <p className={styles.empty}>{strings.timezoneNothingFound}</p>
          ) : (
            <div className={styles.list}>
              <Card>
                {shown.map((habit) => {
                  const on = chosen.has(habit.id);
                  return (
                    <ListItem
                      key={habit.id}
                      icon={<HabitAvatar habit={habit} />}
                      iconColor={habit.color}
                      label={<span className={styles.name}>{habit.name}</span>}
                      onPress={() => toggle(habit.id)}
                    >
                      <span
                        className={`${styles.check} ${on ? styles.checked : ""}`}
                        role="checkbox"
                        aria-checked={on}
                        aria-label={habit.name}
                      >
                        {on ? <CheckIcon /> : null}
                      </span>
                    </ListItem>
                  );
                })}
              </Card>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}

/** Плашка привычки в списках папки: первая буква названия на цвете привычки (сам цвет —
 *  у плашки ListItem, iconColor). */
export function HabitAvatar({ habit }: { habit: Habit }) {
  const letter = Array.from(habit.name.trim())[0]?.toUpperCase() ?? "";
  return <span className={styles.letter}>{letter}</span>;
}

/** Галочка в кружке выбранной привычки. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
