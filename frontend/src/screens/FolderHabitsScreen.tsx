/**
 * Выбор привычек в папку — открывается из формы папки «Добавить привычки», как «Чаты в
 * папке» в Telegram: поиск по названию, блок «Типы привычек» (групповые, личные — в папку
 * попадают все привычки типа, и новые тоже; замороженные, не на сегодня) и блок «Привычки» — все привычки, у каждой —
 * кружок её цвета с первой буквой названия (размером фото участника групповой привычки) и
 * кружок выбора справа; нажатие на ряд отмечает его или снимает отметку. Пока что-то
 * ищут, типов не видно. Нижняя кнопка «Готово» возвращает выбор в форму, «Назад» —
 * закрывает без изменений.
 */

import { useState } from "react";

import { MemberRows } from "../components/GroupMembers";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card, Section } from "../components/Section";
import {
  CalendarOffIcon,
  PeopleIcon,
  PersonIcon,
  SnowflakeIcon,
} from "../components/SettingsIcons";
import { StatusMessage } from "../components/StatusMessage";
import { FOLDER_HABIT_TYPES } from "../constants";
import { useMainButton } from "../hooks/useMainButton";
import { useStrings } from "../preferences";
import { hapticSelection } from "../telegram/webapp";
import { MAIN_BUTTON_ACCENT } from "../theme";
import type { FolderHabitType } from "../types/folder";
import type { Habit, HabitColor } from "../types/habit";
import styles from "./FolderHabitsScreen.module.css";

interface FolderHabitsScreenProps {
  habits: Habit[];
  /** Выбранные сейчас (id на экране). */
  selected: number[];
  /** Выбранные сейчас типы привычек. */
  selectedTypes: FolderHabitType[];
  onDone: (selected: number[], types: FolderHabitType[]) => void;
}

export function FolderHabitsScreen({
  habits,
  selected,
  selectedTypes,
  onDone,
}: FolderHabitsScreenProps) {
  const strings = useStrings();
  const [chosen, setChosen] = useState(() => new Set(selected));
  const [chosenTypes, setChosenTypes] = useState(() => new Set(selectedTypes));
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? habits.filter((habit) => habit.name.toLowerCase().includes(needle))
    : habits;

  useMainButton(
    { text: strings.folderPickerDone, ...MAIN_BUTTON_ACCENT, active: true, progress: false },
    // В порядке списка привычек (и типов).
    () =>
      onDone(
        habits.filter((habit) => chosen.has(habit.id)).map((habit) => habit.id),
        FOLDER_HABIT_TYPES.filter((type) => chosenTypes.has(type)),
      ),
  );

  function toggle<T>(set: (update: (previous: Set<T>) => Set<T>) => void, item: T): void {
    hapticSelection();
    set((previous) => {
      const next = new Set(previous);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  }

  return (
    <Screen title={strings.folderPickerTitle} withTabBar={false} enterAnimation pinnedTitle>
      {habits.length === 0 ? (
        <StatusMessage icon="check" title={strings.folderPickerEmpty} />
      ) : (
        <div className={styles.pinned}>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={strings.folderPickerSearch}
            clearLabel={strings.timezoneSearchClear}
          />
          <div className={styles.list}>
            {needle ? null : (
              <Section variant="form" title={strings.folderPickerTypesHeading}>
                <MemberRows>
                  <Card>
                    {FOLDER_HABIT_TYPES.map((type) => (
                      <ListItem
                        key={type}
                        icon={<HabitTypeIcon type={type} />}
                        iconColor={HABIT_TYPE_COLORS[type]}
                        roundIcon
                        label={
                          <span className={styles.name}>{strings.folderHabitTypeNames[type]}</span>
                        }
                        onPress={() => toggle(setChosenTypes, type)}
                      >
                        <Check on={chosenTypes.has(type)} label={strings.folderHabitTypeNames[type]} />
                      </ListItem>
                    ))}
                  </Card>
                </MemberRows>
              </Section>
            )}
            <Section variant="form" title={strings.folderPickerHabitsHeading}>
              {shown.length === 0 ? (
                <p className={styles.empty}>{strings.timezoneNothingFound}</p>
              ) : (
                <MemberRows>
                  <Card>
                    {shown.map((habit) => (
                      <ListItem
                        key={habit.id}
                        icon={<HabitAvatar habit={habit} />}
                        iconColor={habit.color}
                        roundIcon
                        label={<span className={styles.name}>{habit.name}</span>}
                        onPress={() => toggle(setChosen, habit.id)}
                      >
                        <Check on={chosen.has(habit.id)} label={habit.name} />
                      </ListItem>
                    ))}
                  </Card>
                </MemberRows>
              )}
            </Section>
          </div>
        </div>
      )}
    </Screen>
  );
}

/** Цвет кружка типа привычек — как у цветных плашек типов чатов в Telegram. */
export const HABIT_TYPE_COLORS: Record<FolderHabitType, HabitColor> = {
  group: "green",
  personal: "blue",
  frozen: "lightblue",
  unscheduled: "orange",
};

/** Значок типа привычек в кружке: двое — групповые, один — личные, снежинка —
 *  замороженные, календарь с чертой — не на сегодня. */
export function HabitTypeIcon({ type }: { type: FolderHabitType }) {
  switch (type) {
    case "group":
      return <PeopleIcon />;
    case "personal":
      return <PersonIcon />;
    case "frozen":
      return <SnowflakeIcon />;
    case "unscheduled":
      return <CalendarOffIcon />;
  }
}

/** Кружок привычки в списках папки: первая буква названия на цвете привычки (сам цвет —
 *  у кружка ListItem, iconColor), как буква участника без фото. */
export function HabitAvatar({ habit }: { habit: Habit }) {
  const letter = Array.from(habit.name.trim())[0]?.toUpperCase() ?? "";
  return <span className={styles.letter}>{letter}</span>;
}

/** Кружок выбора справа: пустой с обводкой или залитый с галочкой. */
function Check({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`${styles.check} ${on ? styles.checked : ""}`}
      role="checkbox"
      aria-checked={on}
      aria-label={label}
    >
      {on ? <CheckIcon /> : null}
    </span>
  );
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
