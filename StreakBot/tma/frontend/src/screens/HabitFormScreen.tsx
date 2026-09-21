/**
 * Экран создания и редактирования привычки — один и тот же, отличаются заголовок, кнопка
 * и начальные значения.
 *
 * Крупный заголовок «Новая привычка» («Редактирование») стоит так же, как «Привычки» и
 * «Настройки»; под ним — секции в стиле экрана привычки:
 *  - Информация — название;
 *  - Частота — каждый день или по дням; «по дням» добавляет выбор дней недели;
 *  - Напоминание — выключено или включено со временем: тогда в этот день и время бот
 *    пришлёт в чат «🔔 Пора выполнить «…»» (bot/reminders.py);
 *  - Тема — цвет привычки. Форма сразу окрашивается в выбранный цвет (дни недели, кнопка).
 *
 * Открывается кнопкой «+» (новая привычка) или рядом «Редактировать привычку» на экране
 * привычки. Пока экран открыт, «Закрыть» Telegram заменена на «Назад» — выйти без
 * сохранения (см. App), а сохраняет нижняя кнопка Telegram: «Создать привычку» или
 * «Сохранить». Она неактивна, пока нет названия (или не выбран ни один день).
 */

import { useMemo, useRef, useState } from "react";

import { ApiRequestError } from "../api/client";
import { createHabit, updateHabit } from "../api/habits";
import { ColorPicker } from "../components/ColorPicker";
import { DayPicker } from "../components/DayPicker";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { Switch } from "../components/Switch";
import { TimeField } from "../components/TimeField";
import {
  DEFAULT_HABIT_COLOR,
  DEFAULT_NAME_MAX_LENGTH,
  DEFAULT_REMINDER_TIME,
  FALLBACK_WEEKDAYS,
} from "../constants";
import { useMainButton } from "../hooks/useMainButton";
import { useMeta } from "../hooks/useMeta";
import { STRINGS } from "../strings";
import { hapticNotification } from "../telegram/webapp";
import { habitColorHex, habitColorStyle, readRootVariable } from "../theme";
import type { FrequencyType, Habit, HabitColor, HabitInput } from "../types/habit";
import styles from "./HabitFormScreen.module.css";

const FREQUENCY_OPTIONS = [
  { value: "daily", label: STRINGS.formDaily },
  { value: "specific_days", label: STRINGS.formSpecificDays },
] as const;

interface HabitFormScreenProps {
  /** Редактируемая привычка; null — создание новой. */
  habit: Habit | null;
  /** Привычка сохранена на сервере (создана или изменена). */
  onSaved: (habit: Habit) => void;
}

export function HabitFormScreen({ habit, onSaved }: HabitFormScreenProps) {
  const meta = useMeta();
  const [name, setName] = useState(habit?.name ?? "");
  const [frequency, setFrequency] = useState<FrequencyType>(
    habit?.frequency_type ?? "daily",
  );
  const [days, setDays] = useState<Set<string>>(() => new Set(habit?.days));
  const [reminderOn, setReminderOn] = useState(habit?.reminder_time != null);
  // Время помнится, даже если напоминание выключить и включить снова.
  const [reminderTime, setReminderTime] = useState(
    habit?.reminder_time ?? DEFAULT_REMINDER_TIME,
  );
  const [color, setColor] = useState<HabitColor>(habit?.color ?? DEFAULT_HABIT_COLOR);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const weekdays = meta?.weekdays ?? FALLBACK_WEEKDAYS;
  const nameMaxLength = meta?.name_max_length ?? DEFAULT_NAME_MAX_LENGTH;
  const valid = name.trim().length > 0 && (frequency === "daily" || days.size > 0);

  // Цвета нижней кнопки — из дизайн-токенов (Telegram понимает только «#RRGGBB»).
  const buttonColors = useMemo(
    () =>
      valid
        ? { color: habitColorHex(color), textColor: readRootVariable("--color-on-habit") }
        : {
            color: readRootVariable("--main-button-disabled-bg"),
            textColor: readRootVariable("--main-button-disabled-text"),
          },
    [valid, color],
  );

  useMainButton(
    {
      text: habit ? STRINGS.formEditSubmit : STRINGS.formCreateSubmit,
      ...buttonColors,
      active: valid,
      progress: submitting,
    },
    submit,
  );

  function toggleDay(code: string): void {
    setDays((previous) => {
      const next = new Set(previous);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }

  async function submit(): Promise<void> {
    if (!valid || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const input: HabitInput = {
      name: name.trim(),
      frequency_type: frequency,
      // Дни — в порядке недели, как их показывает выбор.
      days:
        frequency === "specific_days"
          ? weekdays.filter((day) => days.has(day.code)).map((day) => day.code)
          : [],
      reminder_time: reminderOn ? reminderTime : null,
      color,
    };
    try {
      onSaved(habit ? await updateHabit(habit.id, input) : await createHabit(input));
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError
          ? caught.message
          : habit
            ? STRINGS.formEditFailed
            : STRINGS.formCreateFailed,
      );
      setSubmitting(false);
      hapticNotification("error");
      // Ошибка — под формой: прокрутить к ней, если форма длиннее экрана.
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      );
    }
  }

  return (
    <Screen
      title={habit ? STRINGS.formEditTitle : STRINGS.formCreateTitle}
      withTabBar={false}
      enterAnimation
    >
      <div className={styles.form} style={habitColorStyle(color)}>
        <Section title={STRINGS.formInfoHeading}>
          <Card>
            <ListItem>
              <input
                className={styles.nameInput}
                type="text"
                placeholder={STRINGS.formNamePlaceholder}
                aria-label={STRINGS.formNamePlaceholder}
                maxLength={nameMaxLength}
                value={name}
                onChange={(event) => setName(event.target.value)}
                // «Готово» на клавиатуре просто её убирает.
                enterKeyHint="done"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.currentTarget.blur();
                  }
                }}
              />
            </ListItem>
          </Card>
        </Section>

        <Section title={STRINGS.formFrequencyHeading}>
          <Card>
            <ListItem label={STRINGS.formRepeat}>
              <MenuSelect<FrequencyType>
                options={FREQUENCY_OPTIONS}
                value={frequency}
                onChange={setFrequency}
                label={STRINGS.formRepeat}
              />
            </ListItem>
            {frequency === "specific_days" ? (
              <ListItem>
                <DayPicker weekdays={weekdays} selected={days} onToggle={toggleDay} />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section title={STRINGS.formReminderHeading}>
          <Card>
            <ListItem label={STRINGS.formReminderToggle}>
              <Switch
                checked={reminderOn}
                onChange={setReminderOn}
                label={STRINGS.formReminderToggle}
              />
            </ListItem>
            {reminderOn ? (
              <ListItem label={STRINGS.formReminderTime}>
                <TimeField
                  value={reminderTime}
                  onChange={setReminderTime}
                  label={STRINGS.formReminderTime}
                />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section title={STRINGS.formThemeHeading}>
          <Card>
            <ColorPicker value={color} onChange={setColor} label={STRINGS.formThemeHeading} />
          </Card>
        </Section>

        {error ? (
          <p ref={errorRef} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}
