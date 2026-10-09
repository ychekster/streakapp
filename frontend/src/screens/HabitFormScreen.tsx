/**
 * Экран создания и редактирования привычки — один и тот же, отличаются заголовок, кнопка
 * и начальные значения.
 *
 * Крупный заголовок «Новая привычка» («Редактирование») стоит так же, как «Привычки» и
 * «Настройки»; под ним — секции в стиле экрана привычки, но с заголовками как в эталоне:
 * с заглавной буквы (не капсом) и со сдвигом до конца скругления карточки:
 *  - Информация — название;
 *  - Частота — «Повтор»: по дням недели, через день или каждый месяц. По дням недели —
 *    под рядом выбор дней (как в «Будильнике» iOS), а в ряду — выбранные дни: все —
 *    «Каждый день», «Будние дни», «Выходные», иначе «Пн, Ср и Пт», ни одного — «Никогда»
 *    (сохранить нельзя). Все дни сохраняются как `daily`, остальные — `specific_days`.
 *    «Через день» и «каждый месяц» добавляют дату начала (системный календарь): с неё
 *    привычка идёт каждый второй день или то же число каждого месяца (в коротком месяце
 *    — его последний день);
 *  - Цель — сколько раз в день выполнить привычку («1 раз в день», степпер −/+). Больше
 *    одного раза — кружок отметки бледный с плюсом, каждое нажатие закрашивает его часть
 *    (CheckButton);
 *  - Напоминание — выключено или включено со временем: тогда в этот день и время бот
 *    пришлёт в чат «🔔 Пора выполнить «…»» (bot/reminders.py). «Добавить напоминание»
 *    добавляет ещё одну строку со временем (до MAX_REMINDERS_PER_HABIT; новое — на час
 *    позже последнего), у добавленных слева красный «−» — убрать. Первое время убирается
 *    только переключателем;
 *    В веб-приложении вместо бота — уведомление. Включённое напоминание (у новой
 *    привычки или впервые у старой) при «Создать привычку» / «Сохранить» включает
 *    уведомления: спрашивает разрешение, а если его уже не дали — окошко, как включить в
 *    настройках телефона; выключенные в настройках приложения — включает обратно
 *    (useReminderPush). Первая привычка и без напоминания спрашивает разрешение, если
 *    уведомления не выключены (никогда — при первом запуске). Если уведомления запрещены,
 *    под переключателем — как их включить (spec §9);
 *  - Тема — цвет привычки. Форма сразу окрашивается в выбранный цвет (дни недели, кнопка);
 *  - Автоотметка — переключатель «Отмечать автоматически» с пояснением под ним; та же,
 *    что на экране привычки. Только у привычек «раз в день»: с целью больше одного раза ряд пропадает.
 *
 * Открывается кнопкой «+» (новая привычка) или рядом «Редактировать привычку» на экране
 * привычки. Пока экран открыт, «Закрыть» Telegram заменена на «Назад» — выйти без
 * сохранения (см. App), а сохраняет нижняя кнопка Telegram: «Создать привычку» или
 * «Сохранить». Она неактивна, пока нет названия (или не выбран ни один день).
 */

import { useMemo, useRef, useState } from "react";

import { ColorPicker } from "../components/ColorPicker";
import { DateField, localDate } from "../components/DateField";
import { DayPicker } from "../components/DayPicker";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { Stepper } from "../components/Stepper";
import { Switch } from "../components/Switch";
import { TimeField } from "../components/TimeField";
import {
  DEFAULT_HABIT_COLOR,
  DEFAULT_NAME_MAX_LENGTH,
  DEFAULT_REMINDER_TIME,
  MAX_REMINDERS_PER_HABIT,
  MAX_TIMES_PER_DAY,
  START_DATE_MAX_AHEAD_DAYS,
  WEEKDAYS,
} from "../constants";
import { reminderTimesOf, usesStartDate } from "../data/derive";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useMainButton } from "../hooks/useMainButton";
import { useMeta } from "../hooks/useMeta";
import { useReminderPush } from "../hooks/useReminderPush";
import { usePlatform } from "../platform";
import { useResolvedTheme, useStrings } from "../preferences";
import { hapticNotification } from "../telegram/webapp";
import { habitColorHex, habitColorStyle, readRootVariable } from "../theme";
import type { FrequencyType, Habit, HabitColor, HabitInput } from "../types/habit";
import { askPermissionUnlessOff, pushPermission, subscribePush } from "../web/push";
import { weekdayLabel } from "../weekdayLabel";
import styles from "./HabitFormScreen.module.css";

interface HabitFormScreenProps {
  /** Редактируемая привычка; null — создание новой. */
  habit: Habit | null;
  /** Привычка сохранена (создана или изменена) — на устройстве, сервер узнает следом. */
  onSaved: (habit: Habit) => void;
}

export function HabitFormScreen({ habit, onSaved }: HabitFormScreenProps) {
  const meta = useMeta();
  const strings = useStrings();
  const theme = useResolvedTheme();
  const [name, setName] = useState(habit?.name ?? "");
  // По дням недели (daily и specific_days — одна строка меню) или с даты начала.
  const [repeat, setRepeat] = useState<RepeatMode>(() =>
    habit && usesStartDate(habit.frequency_type) ? (habit.frequency_type as RepeatMode) : "weekly",
  );
  // Дни недели; у «каждый день» и у новой привычки — все. Помнятся при смене частоты.
  const [days, setDays] = useState<Set<string>>(
    () => new Set(habit?.frequency_type === "specific_days" ? habit.days : WEEKDAYS),
  );
  // Первый день «через день» / «каждый месяц»: по умолчанию сегодня; помнится при смене
  // частоты.
  const [startDate, setStartDate] = useState(() => habit?.start_date ?? localDate());
  const [reminderOn, setReminderOn] = useState(habit?.reminder_time != null);
  // Времена помнятся, даже если напоминание выключить и включить снова. `key` — для
  // React: строки удаляются из середины.
  const nextReminderKey = useRef(0);
  const [reminders, setReminders] = useState<Reminder[]>(() => {
    const times = habit ? reminderTimesOf(habit) : [];
    return (times.length > 0 ? times : [DEFAULT_REMINDER_TIME]).map((time) => ({
      key: nextReminderKey.current++,
      time,
    }));
  });
  const [color, setColor] = useState<HabitColor>(habit?.color ?? DEFAULT_HABIT_COLOR);
  const [timesPerDay, setTimesPerDay] = useState(habit?.times_per_day ?? 1);
  // Помнится, пока цель больше одного раза (ряд скрыт), но сохраняется только при одном.
  const [autoMark, setAutoMark] = useState(habit?.auto_mark ?? false);
  const [submitting, setSubmitting] = useState(false);
  const web = usePlatform() === "web";
  const [permission, setPermission] = useState(pushPermission);
  const enableReminderPush = useReminderPush();
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  // Отправка уже идёт: состояние `submitting` обновится только со следующим рендером, а
  // второе быстрое нажатие нижней кнопки создало бы привычку дважды.
  const submittingRef = useRef(false);

  const nameMaxLength = meta?.name_max_length ?? DEFAULT_NAME_MAX_LENGTH;
  const valid = name.trim().length > 0 && (repeat !== "weekly" || days.size > 0);
  const frequency: FrequencyType =
    repeat !== "weekly" ? repeat : days.size === WEEKDAYS.length ? "daily" : "specific_days";
  const repeatOptions = [
    { value: "weekly", label: weekdayLabel(days, strings, strings.formDaily) },
    { value: "every_other_day", label: strings.formEveryOtherDay },
    { value: "monthly", label: strings.formMonthly },
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

  function setReminderTime(key: number, time: string): void {
    setReminders((previous) =>
      previous.map((reminder) => (reminder.key === key ? { ...reminder, time } : reminder)),
    );
  }

  function addReminder(): void {
    setReminders((previous) => [
      ...previous,
      { key: nextReminderKey.current++, time: nextReminderTime(previous.map((item) => item.time)) },
    ]);
  }

  function removeReminder(key: number): void {
    setReminders((previous) => previous.filter((reminder) => reminder.key !== key));
  }

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
    // Web app: right from this tap (Safari needs the gesture). A reminder just turned on
    // turns notifications on; a new habit without one only asks, unless turned off in
    // Settings.
    if (web && reminderOn && habit?.reminder_time == null) {
      void enableReminderPush().then(setPermission);
    } else if (web && (!habit || reminderOn)) {
      if (permission === "default") {
        void askPermissionUnlessOff().then(setPermission);
      } else if (permission === "granted") {
        void subscribePush();
      }
    }
    setError(null);
    const input: HabitInput = {
      name: name.trim(),
      frequency_type: frequency,
      // Дни — в порядке недели, как их показывает выбор.
      days: frequency === "specific_days" ? WEEKDAYS.filter((code) => days.has(code)) : [],
      start_date: usesStartDate(frequency) ? startDate : null,
      // Порядок и повторы приводит в вид сервер (и data/derive.ts на устройстве).
      reminder_time: reminderOn ? [...reminders.map((item) => item.time)].sort()[0] : null,
      reminder_times: reminderOn ? reminders.map((item) => item.time) : [],
      color,
      times_per_day: timesPerDay,
      // У «несколько раз в день» автоотметки нет (ряд скрыт).
      auto_mark: autoMark && timesPerDay === 1,
    };
    try {
      // Saved on the device at once (data/store.ts) — checked there as the server would:
      // a duplicate name or the habit limit is shown under the form right away.
      onSaved(habit ? dataStore.updateHabit(habit.id, input) : dataStore.createHabit(input));
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
              <MenuSelect<RepeatMode>
                options={repeatOptions}
                value={repeat}
                onChange={setRepeat}
                label={strings.formRepeat}
              />
            </ListItem>
            {repeat === "weekly" ? (
              <ListItem>
                <DayPicker selected={days} onToggle={toggleDay} />
              </ListItem>
            ) : null}
            {usesStartDate(frequency) ? (
              <ListItem label={strings.formStartDate}>
                <DateField
                  value={startDate}
                  onChange={setStartDate}
                  label={strings.formStartDate}
                  max={localDate(START_DATE_MAX_AHEAD_DAYS)}
                />
              </ListItem>
            ) : null}
          </Card>
        </Section>

        <Section variant="form" title={strings.formGoalHeading}>
          <Card>
            <ListItem label={strings.formTimesPerDay(timesPerDay)}>
              <Stepper
                value={timesPerDay}
                min={1}
                max={MAX_TIMES_PER_DAY}
                onChange={setTimesPerDay}
                decreaseLabel={strings.formTimesLess}
                increaseLabel={strings.formTimesMore}
              />
            </ListItem>
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
            {reminderOn
              ? reminders.map((reminder, index) => (
                  <ListItem
                    key={reminder.key}
                    label={
                      index === 0 ? (
                        strings.formReminderTime
                      ) : (
                        <span className={styles.reminderLabel}>
                          <button
                            type="button"
                            className={styles.removeReminder}
                            aria-label={strings.formReminderRemove(reminder.time)}
                            onClick={() => removeReminder(reminder.key)}
                          >
                            <span className={`${styles.reminderBadge} ${styles.minus}`} />
                          </button>
                          {strings.formReminderTime}
                        </span>
                      )
                    }
                  >
                    <TimeField
                      value={reminder.time}
                      onChange={(time) => setReminderTime(reminder.key, time)}
                      label={strings.formReminderTime}
                    />
                  </ListItem>
                ))
              : null}
            {reminderOn && reminders.length < MAX_REMINDERS_PER_HABIT ? (
              <ListItem
                accent
                // Нажатие сдвигает строку вниз — подсветка мигнула бы уже на новом месте.
                noPressHighlight
                onPress={addReminder}
                label={
                  <span className={styles.reminderLabel}>
                    <span className={`${styles.reminderBadge} ${styles.plus}`} aria-hidden="true" />
                    {strings.formReminderAdd}
                  </span>
                }
              />
            ) : null}
          </Card>
          {web && reminderOn && permission === "denied" ? (
            <p className={styles.note}>{strings.notificationsDenied}</p>
          ) : null}
        </Section>

        <Section variant="form" title={strings.formThemeHeading}>
          <Card>
            <ColorPicker value={color} onChange={setColor} label={strings.formThemeHeading} />
          </Card>
        </Section>

        {timesPerDay === 1 ? (
          <Section
            variant="form"
            title={strings.formAutoMarkHeading}
            footer={strings.formAutoMarkFooter}
          >
            <Card>
              <ListItem label={strings.formAutoMarkToggle}>
                <Switch
                  checked={autoMark}
                  onChange={setAutoMark}
                  label={strings.formAutoMarkToggle}
                />
              </ListItem>
            </Card>
          </Section>
        ) : null}

        {error ? (
          <p ref={errorRef} className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Screen>
  );
}

/** Строка меню «Повтор»: по дням недели (daily / specific_days) или с даты начала. */
type RepeatMode = "weekly" | "every_other_day" | "monthly";

interface Reminder {
  key: number;
  /** «ЧЧ:ММ». */
  time: string;
}

/** Время нового напоминания: на час позже последнего (через полночь — с начала суток), а
 *  если такое уже есть — ещё на час, и так далее. */
function nextReminderTime(times: string[]): string {
  const last = times[times.length - 1] ?? DEFAULT_REMINDER_TIME;
  let minutes = Number(last.slice(0, 2)) * 60 + Number(last.slice(3, 5));
  for (let step = 0; step < 24; step += 1) {
    minutes = (minutes + 60) % (24 * 60);
    const candidate = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    if (!times.includes(candidate)) {
      return candidate;
    }
  }
  return last;
}
