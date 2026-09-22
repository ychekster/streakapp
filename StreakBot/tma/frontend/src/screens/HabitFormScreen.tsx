/**
 * Экран создания и редактирования привычки — один и тот же, отличаются заголовок, кнопка
 * и начальные значения.
 *
 * Крупный заголовок «Новая привычка» («Редактирование») стоит так же, как «Привычки» и
 * «Настройки»; под ним — секции в стиле экрана привычки, но с заголовками как в эталоне:
 * с заглавной буквы (не капсом) и со сдвигом до конца скругления карточки:
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
  WEEKDAYS,
} from "../constants";
import { describeError } from "../errors";
import { useMainButton } from "../hooks/useMainButton";
import { useMeta } from "../hooks/useMeta";
import { useResolvedTheme, useStrings } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import { habitColorHex, habitColorStyle, readRootVariable } from "../theme";
import type { FrequencyType, Habit, HabitColor, HabitInput } from "../types/habit";
import styles from "./HabitFormScreen.module.css";

interface HabitFormScreenProps {
  /** Редактируемая привычка; null — создание новой. */
  habit: Habit | null;
  /** Привычка сохранена на сервере (создана или изменена). */
  onSaved: (habit: Habit) => void;
}

export function HabitFormScreen({ habit, onSaved }: HabitFormScreenProps) {
  const meta = useMeta();
  const strings = useStrings();
  const theme = useResolvedTheme();
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
  // Отправка уже идёт: состояние `submitting` обновится только со следующим рендером, а
  // второе быстрое нажатие нижней кнопки создало бы привычку дважды.
  const submittingRef = useRef(false);

  const nameMaxLength = meta?.name_max_length ?? DEFAULT_NAME_MAX_LENGTH;
  const valid = name.trim().length > 0 && (frequency === "daily" || days.size > 0);
  const frequencyOptions = [
    { value: "daily", label: strings.formDaily },
    { value: "specific_days", label: strings.formSpecificDays },
  ] as const;

  // Цвета нижней кнопки — из дизайн-токенов (Telegram понимает только «#RRGGBB»); у
  // тёмной темы они свои, поэтому при её смене перечитываются.
  const buttonColors = useMemo(
    () =>
      valid
        ? { color: habitColorHex(color), textColor: readRootVariable("--color-on-habit") }
        : {
            color: readRootVariable("--main-button-disabled-bg"),
            textColor: readRootVariable("--main-button-disabled-text"),
          },
    [valid, color, theme],
  );

  useMainButton(
    {
      text: habit ? strings.formEditSubmit : strings.formCreateSubmit,
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
    if (!valid || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    const input: HabitInput = {
      name: name.trim(),
      frequency_type: frequency,
      // Дни — в порядке недели, как их показывает выбор.
      days: frequency === "specific_days" ? WEEKDAYS.filter((code) => days.has(code)) : [],
      reminder_time: reminderOn ? reminderTime : null,
      color,
    };
    try {
      onSaved(habit ? await updateHabit(habit.id, input) : await createHabit(input));
    } catch (caught) {
      setError(
        describeError(
          strings,
          caught,
          habit ? strings.formEditFailed : strings.formCreateFailed,
        ),
      );
      submittingRef.current = false;
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
      title={habit ? strings.formEditTitle : strings.formCreateTitle}
      withTabBar={false}
      enterAnimation
    >
      <div className={styles.form} style={habitColorStyle(color)}>
        <Section variant="form" title={strings.formInfoHeading}>
          <Card>
            <ListItem>
              <input
                className={styles.nameInput}
                type="text"
                placeholder={strings.formNamePlaceholder}
                aria-label={strings.formNamePlaceholder}
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

        <Section variant="form" title={strings.formFrequencyHeading}>
          <Card>
            <ListItem label={strings.formRepeat}>
              <MenuSelect<FrequencyType>
                options={frequencyOptions}
                value={frequency}
                onChange={setFrequency}
                label={strings.formRepeat}
              />
            </ListItem>
            {frequency === "specific_days" ? (
              <ListItem>
                <DayPicker selected={days} onToggle={toggleDay} />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section variant="form" title={strings.formReminderHeading}>
          <Card>
            <ListItem label={strings.formReminderToggle}>
              <Switch
                checked={reminderOn}
                onChange={setReminderOn}
                label={strings.formReminderToggle}
              />
            </ListItem>
            {reminderOn ? (
              <ListItem label={strings.formReminderTime}>
                <TimeField
                  value={reminderTime}
                  onChange={setReminderTime}
                  label={strings.formReminderTime}
                />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section variant="form" title={strings.formThemeHeading}>
          <Card>
            <ColorPicker value={color} onChange={setColor} label={strings.formThemeHeading} />
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
