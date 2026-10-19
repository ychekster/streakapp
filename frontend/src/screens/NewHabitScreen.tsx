/**
 * «Добавить привычку» — открывается кнопкой «+», как «Новое сообщение» в Telegram:
 * заголовок сразу маленький, по центру шапки (Screen `pinnedTitle`), под ним — поиск, ниже
 * карточка «Новая привычка» (пустая форма) и «Совместная привычка» (форма совместной: она
 * сразу зовёт друзей), а под ними — «Популярные»: шаблоны привычек (data/templates.ts),
 * как контакты в Telegram — кружок цвета шаблона с первой буквой, название и под ним
 * расписание. Нажатие на шаблон открывает форму, уже заполненную им.
 *
 * Поиск фильтрует шаблоны; пока в поле есть текст, вместо двух рядов — «Создать «…»»:
 * форма с этим названием. Шаблоны с названием, которое у пользователя уже есть, не
 * показываются. «Назад» возвращает к списку (App).
 */

import { useState } from "react";

import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { SearchField } from "../components/SearchField";
import { Card, Section } from "../components/Section";
import { WEEKDAYS } from "../constants";
import { findTemplates, templateInput } from "../data/templates";
import { useLanguage, useStrings } from "../preferences";
import type { Habit, HabitInput } from "../types/habit";
import { weekdayLabel } from "../weekdayLabel";
import styles from "./NewHabitScreen.module.css";

interface NewHabitScreenProps {
  habits: Habit[];
  /** Форма новой привычки: пустая, с названием из поиска или заполненная шаблоном. */
  onCreate: (initial: Partial<HabitInput> | null) => void;
  /** Форма совместной привычки. */
  onCreateShared: () => void;
}

export function NewHabitScreen({ habits, onCreate, onCreateShared }: NewHabitScreenProps) {
  const strings = useStrings();
  const language = useLanguage();
  const [query, setQuery] = useState("");
  const typed = query.trim();
  const templates = findTemplates(
    query,
    language,
    habits.map((habit) => habit.name),
  );

  return (
    <Screen title={strings.addHabit} withTabBar={false} enterAnimation pinnedTitle>
      <div className={styles.search}>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={strings.templatesSearch}
          clearLabel={strings.timezoneSearchClear}
        />
      </div>

      <div className={styles.list}>
        <Section variant="form">
          <Card>
            {typed ? (
              <ListItem
                accent
                onPress={() => onCreate({ name: typed })}
                label={
                  <span className={styles.action}>
                    <PlusIcon />
                    <span className={styles.ellipsis}>{strings.templateCreate(typed)}</span>
                  </span>
                }
              />
            ) : (
              <>
                <ListItem
                  accent
                  onPress={() => onCreate(null)}
                  label={
                    <span className={styles.action}>
                      <PlusIcon />
                      {strings.newHabitPlain}
                    </span>
                  }
                />
                <ListItem
                  accent
                  onPress={onCreateShared}
                  label={
                    <span className={styles.action}>
                      <PeopleIcon />
                      {strings.newHabitShared}
                    </span>
                  }
                />
              </>
            )}
          </Card>
        </Section>

        {templates.length > 0 ? (
          <Section variant="form" title={strings.templatesHeading}>
            <Card>
              {templates.map((template) => {
                const name = template.name[language];
                const schedule = weekdayLabel(
                  template.frequency_type === "daily" ? WEEKDAYS : (template.days ?? []),
                  strings,
                  strings.formDaily,
                );
                const times = template.times_per_day ?? 1;
                return (
                  <ListItem
                    key={template.key}
                    icon={<span className={styles.letter}>{Array.from(name)[0]}</span>}
                    iconColor={template.color}
                    roundIcon
                    onPress={() => onCreate(templateInput(template, language))}
                    label={
                      <span className={styles.template}>
                        <span className={styles.ellipsis}>{name}</span>
                        <span className={`${styles.schedule} ${styles.ellipsis}`}>
                          {times > 1 ? `${schedule} · ${strings.formTimesPerDay(times)}` : schedule}
                        </span>
                      </span>
                    }
                  />
                );
              })}
            </Card>
          </Section>
        ) : null}
      </div>
    </Screen>
  );
}

/** «+» перед «Новая привычка» — тонкий, цветом акцента (как «Добавить привычки» в папке). */
function PlusIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Двое — перед «Совместная привычка» (как «Новая группа» в Telegram). */
function PeopleIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 19c.8-3 3.1-4.6 6-4.6s5.2 1.6 6 4.6" />
        <path d="M15.5 4.9a3.2 3.2 0 0 1 0 6.2" />
        <path d="M17.6 14.6c1.6.6 2.8 2.1 3.4 4.4" />
      </g>
    </svg>
  );
}
