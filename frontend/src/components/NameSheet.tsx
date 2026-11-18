/**
 * Окно параметров дня: долгое нажатие на день в календаре привычки (HabitCalendar
 * `onHoldDay` → openNameSheet) открывает снизу высокое окно (BottomSheet `tall`: во всю
 * ширину и до низа экрана, открыто не до конца). Внутри, как в настройках привычки, —
 * параметры этого дня: «Название», «Описание», «Частота», «Цель». Под каждым — сколько
 * дней к тому дню он так стоял (namesOn, scheduleSince по истории), а поправленный для
 * этого дня — «Изменено для этого дня. Было: …».
 *
 * Правка меняет только этот день (models.TaskDayOverride): частота и цель дня — его
 * оценку (запланирован ли, выполнен ли), как если бы в тот день так и стояло.
 * Сохраняется, когда окно закрывают («×», смахивание, затемнение) или уходят с экрана
 * привычки. «Сбросить к параметрам дня» убирает правки сразу: день снова свой.
 *
 * Сегодняшний день не правится (это обычные настройки), день совместной привычки тоже:
 * у неё всё только просмотром.
 */

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import { MAX_TIMES_PER_DAY, WEEKDAYS } from "../constants";
import { daysBetween, markingDay, todayIn } from "../data/dates";
import { isShared, isTimed, namesOn, scheduleSince } from "../data/derive";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useStrings } from "../preferences";
import type { Strings } from "../strings";
import { hapticImpact, hapticNotification } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import type { DayOverride, Habit } from "../types/habit";
import type { DayOverrideFields } from "../types/sync";
import { weekdayLabel } from "../weekdayLabel";
import { BottomSheet, SheetHeader, useSheetContent } from "./BottomSheet";
import { dayLabel } from "./DaySheet";
import { DayPicker } from "./DayPicker";
import { ListItem } from "./ListItem";
import { MenuSelect } from "./MenuSelect";
import { Card, Section } from "./Section";
import { Stepper } from "./Stepper";
import formStyles from "../screens/HabitFormScreen.module.css";
import styles from "./NameSheet.module.css";

interface OpenDay {
  habitId: number;
  date: string;
}

let opened: OpenDay | null = null;
const listeners = new Set<() => void>();
/** Сохранить правки открытого окна (оно закрывается или уходят с экрана привычки). */
let saveOpen: (() => void) | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openNameSheet(habitId: number, date: string): void {
  opened = { habitId, date };
  hapticImpact("medium");
  emit();
}

export function closeNameSheet(): void {
  saveOpen?.();
  if (opened !== null) {
    opened = null;
    emit();
  }
}

function useOpenDay(): OpenDay | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => opened,
  );
}

/** Повтор дня: по дням недели (все — каждый день), через день, каждый месяц; «Гибкий
 *  график» — только как настоящий (поправить на него день нельзя). */
type Repeat = "weekly" | "every_other_day" | "monthly" | "flexible";

/** Что в полях окна. */
interface Values {
  name: string;
  description: string;
  repeat: Repeat;
  days: Set<string>;
  goal: number;
}

function repeatOf(schedule: { frequency_type: string }): Repeat {
  const type = schedule.frequency_type;
  return type === "every_other_day" || type === "monthly" || type === "flexible" ? type : "weekly";
}

function daysOf(schedule: { frequency_type: string; days: readonly string[] }): Set<string> {
  return new Set(schedule.frequency_type === "specific_days" ? schedule.days : WEEKDAYS);
}

export function NameSheet() {
  const strings = useStrings();
  const { habits, settings } = useAppData();
  const { shown, closing, gone } = useSheetContent(useOpenDay());
  const habit = shown ? habits.find((item) => item.id === shown.habitId) : undefined;
  const scroller = useRef<HTMLDivElement>(null);

  // Привычку удалили — окну нечего показывать.
  useEffect(() => {
    if (!closing && shown && !habit) {
      closeNameSheet();
    }
  }, [closing, shown, habit]);

  if (!shown || !habit || !settings) {
    return null;
  }
  const date = shown.date;
  const today = todayIn(settings.timezone);
  const day = markingDay(settings.timezone, settings.mark_yesterday);
  const label = dayLabel(strings, date, today);
  const name = habit.day_overrides?.find((item) => item.date === date)?.name ?? namesOn(habit, date).name;

  return (
    <BottomSheet
      closing={closing}
      onClose={closeNameSheet}
      onGone={gone}
      label={strings.nameSheetLabel(name, label)}
      style={habitColorStyle(habit.color)}
      tall
      scrollRef={scroller}
    >
      <div ref={scroller} className={styles.scroller}>
        <div className={styles.header}>
          <SheetHeader day={label} name={name} onClose={closeNameSheet} />
        </div>
        {/* Свой ключ у дня: открыли другой — поля с его значениями. */}
        <DayParams
          key={`${habit.id}:${date}`}
          habit={habit}
          date={date}
          editable={date < day && !isShared(habit)}
          note={date < day ? strings.dayParamsShared : strings.dayParamsToday}
          strings={strings}
        />
      </div>
    </BottomSheet>
  );
}

function DayParams({
  habit,
  date,
  editable,
  note,
  strings,
}: {
  habit: Habit;
  date: string;
  editable: boolean;
  /** Почему не правится (сегодня, совместная). */
  note: string;
  strings: Strings;
}) {
  const override = habit.day_overrides?.find((item) => item.date === date) ?? null;
  const names = namesOn(habit, date);
  const real = scheduleSince(habit, date);
  const timed = isTimed(habit) || (real.schedule.goal_unit ?? "times") === "seconds";

  const realValues: Values = {
    name: names.name,
    description: names.description ?? "",
    repeat: repeatOf(real.schedule),
    days: daysOf(real.schedule),
    goal: real.schedule.times_per_day,
  };
  const [values, setValues] = useState<Values>(() => ({
    name: override?.name ?? realValues.name,
    description: override?.description_set ? (override.description ?? "") : realValues.description,
    repeat: override?.frequency_type ? repeatOf(override as { frequency_type: string }) : realValues.repeat,
    days: override?.frequency_type
      ? daysOf({ frequency_type: override.frequency_type, days: override.days ?? [] })
      : realValues.days,
    goal: override?.times_per_day ?? realValues.goal,
  }));

  // Что сохранить: отличие от настоящих параметров дня; null — правок нет.
  const fieldsOf = (current: Values): DayOverrideFields | null => {
    const fields: DayOverrideFields = { date };
    const nameNow = current.name.trim();
    if (nameNow !== "" && nameNow !== realValues.name) {
      fields.name = nameNow;
    }
    const descriptionNow = current.description.trim();
    if (descriptionNow !== realValues.description) {
      fields.description = descriptionNow === "" ? null : descriptionNow;
      fields.description_set = true;
    }
    const frequency = frequencyOf(current);
    if (frequency !== null && frequency !== frequencyOf(realValues)) {
      fields.frequency_type = frequency;
      fields.days = frequency === "specific_days" ? WEEKDAYS.filter((code) => current.days.has(code)) : [];
    }
    if (!timed && current.goal !== realValues.goal) {
      fields.times_per_day = current.goal;
    }
    return Object.keys(fields).length > 1 ? fields : null;
  };

  // Сохранить при закрытии: только если правки другие, чем уже есть.
  const latest = useRef(values);
  latest.current = values;
  useEffect(() => {
    if (!editable) {
      return undefined;
    }
    const save = (): void => {
      const next = fieldsOf(latest.current);
      if (sameOverride(next, override)) {
        return;
      }
      if (latest.current.repeat === "weekly" && latest.current.days.size === 0) {
        return;
      }
      dataStore.setDayOverride(habit.id, date, next);
      hapticNotification("success");
    };
    saveOpen = save;
    return () => {
      if (saveOpen === save) {
        saveOpen = null;
      }
    };
  });

  const changed = fieldsOf(values) !== null;
  const reset = (): void => {
    setValues({ ...realValues, days: new Set(realValues.days) });
    if (override) {
      dataStore.setDayOverride(habit.id, date, null);
    }
    hapticNotification("success");
  };

  const since = (from: string | null): string | null =>
    from === null || from > date ? null : strings.dayParamsSince(Math.max(1, daysBetween(from, date) + 1));
  /** Подпись поля: поправлено — каким было, иначе — сколько так стояло. */
  const caption = (isChanged: boolean, realLabel: string, from: string | null): string | null =>
    isChanged ? strings.dayParamsChanged(realLabel) : since(from);

  const repeatLabel = (repeat: Repeat, days: Set<string>): string =>
    repeat === "weekly"
      ? weekdayLabel(days, strings, strings.formDaily)
      : repeat === "every_other_day"
        ? strings.formEveryOtherDay
        : repeat === "monthly"
          ? strings.formMonthly
          : strings.dayParamsFrequencyFlexible;
  const options = [
    { value: "weekly" as const, label: weekdayLabel(values.days, strings, strings.formDaily) },
    { value: "every_other_day" as const, label: strings.formEveryOtherDay },
    { value: "monthly" as const, label: strings.formMonthly },
    ...(realValues.repeat === "flexible"
      ? [{ value: "flexible" as const, label: strings.dayParamsFrequencyFlexible }]
      : []),
  ];
  const frequencyChanged = frequencyOf(values) !== frequencyOf(realValues);
  const set = (patch: Partial<Values>): void => setValues((current) => ({ ...current, ...patch }));

  return (
    <div className={`${formStyles.form} ${styles.form}`}>
      <Section
        variant="form"
        title={strings.nameSheetName}
        footer={caption(values.name.trim() !== realValues.name, `«${realValues.name}»`, names.nameSince)}
      >
        <Card>
          <ListItem>
            <input
              className={formStyles.textInput}
              type="text"
              placeholder={strings.formNamePlaceholder}
              aria-label={strings.nameSheetName}
              value={values.name}
              disabled={!editable}
              onChange={(event) => set({ name: event.target.value })}
              enterKeyHint="done"
              onKeyDown={blurOnEnter}
            />
          </ListItem>
        </Card>
      </Section>

      <Section
        variant="form"
        title={strings.nameSheetDescription}
        footer={caption(
          values.description.trim() !== realValues.description,
          realValues.description ? `«${realValues.description}»` : strings.dayParamsNoDescription,
          names.descriptionSince,
        )}
      >
        <Card>
          <ListItem>
            <input
              className={formStyles.textInput}
              type="text"
              placeholder={strings.formDescriptionPlaceholder}
              aria-label={strings.nameSheetDescription}
              value={values.description}
              disabled={!editable}
              onChange={(event) => set({ description: event.target.value })}
              enterKeyHint="done"
              onKeyDown={blurOnEnter}
            />
          </ListItem>
        </Card>
      </Section>

      <Section
        variant="form"
        title={strings.formFrequencyHeading}
        footer={caption(frequencyChanged, repeatLabel(realValues.repeat, realValues.days), real.frequencySince)}
      >
        <Card>
          <ListItem label={strings.formRepeat}>
            {editable ? (
              <MenuSelect<Repeat>
                options={options}
                value={values.repeat}
                onChange={(repeat) =>
                  // Вернулись к гибкому — частота дня снова своя.
                  set(repeat === "flexible" ? { repeat, days: new Set(realValues.days) } : { repeat })
                }
                label={strings.formRepeat}
              />
            ) : (
              <span className={styles.value}>{repeatLabel(values.repeat, values.days)}</span>
            )}
          </ListItem>
          {values.repeat === "weekly" && editable ? (
            <ListItem>
              <DayPicker
                selected={values.days}
                onToggle={(code) => {
                  const days = new Set(values.days);
                  if (!days.delete(code)) {
                    days.add(code);
                  }
                  set({ days });
                }}
              />
            </ListItem>
          ) : null}
        </Card>
      </Section>

      {timed ? null : (
        <Section
          variant="form"
          title={strings.formGoalHeading}
          footer={caption(values.goal !== realValues.goal, strings.formTimesPerDay(realValues.goal), real.goalSince)}
        >
          <Card>
            <ListItem label={strings.formTimesPerDay(values.goal)}>
              {editable ? (
                <Stepper
                  value={values.goal}
                  min={1}
                  max={MAX_TIMES_PER_DAY}
                  onChange={(goal) => set({ goal })}
                  decreaseLabel={strings.formTimesLess}
                  increaseLabel={strings.formTimesMore}
                />
              ) : null}
            </ListItem>
          </Card>
        </Section>
      )}

      {editable ? (
        <Section variant="form" footer={strings.dayParamsFooter}>
          <Card>
            <ListItem
              destructive
              disabled={!changed && override === null}
              onPress={changed || override !== null ? reset : undefined}
              label={strings.dayParamsReset}
            />
          </Card>
        </Section>
      ) : (
        <p className={styles.note}>{note}</p>
      )}
    </div>
  );
}

/** Частота значений окна (как её шлёт правка); null — гибкий (своя) или без дней. */
function frequencyOf(values: Values): Exclude<DayOverride["frequency_type"], undefined> {
  if (values.repeat === "flexible") {
    return null;
  }
  if (values.repeat !== "weekly") {
    return values.repeat;
  }
  if (values.days.size === 0) {
    return null;
  }
  return values.days.size === WEEKDAYS.length ? "daily" : "specific_days";
}

/** Та же правка, что уже сохранена (ничего не слать). */
function sameOverride(next: DayOverrideFields | null, saved: DayOverride | null): boolean {
  if (next === null || saved === null) {
    return next === null && saved === null;
  }
  return (
    (next.name ?? null) === (saved.name ?? null) &&
    (next.description_set ?? false) === (saved.description_set ?? false) &&
    (next.description ?? null) === (saved.description ?? null) &&
    (next.frequency_type ?? null) === (saved.frequency_type ?? null) &&
    (next.days ?? []).join() === (saved.days ?? []).join() &&
    (next.times_per_day ?? null) === (saved.times_per_day ?? null)
  );
}

/** «Готово» (Enter) на клавиатуре поля просто её убирает. */
function blurOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}
