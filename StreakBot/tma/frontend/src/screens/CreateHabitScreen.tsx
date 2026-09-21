/**
 * Экран создания привычки в стиле iOS 26 — модальный лист, всплывающий снизу.
 * Те же параметры, что и при /add в боте: название, частота (каждый день / по дням
 * недели), и необязательное напоминание со временем. Отправляет POST /tasks.
 */

import { useState } from "react";

import { createHabit } from "../api/habits";
import { ApiRequestError } from "../api/client";
import { DayPicker } from "../components/DayPicker";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { SegmentedControl } from "../components/SegmentedControl";
import { Switch } from "../components/Switch";
import { TimeInput } from "../components/TimeInput";
import { DEFAULT_NAME_MAX_LENGTH, FALLBACK_WEEKDAYS } from "../constants";
import { useMeta } from "../hooks/useMeta";
import { STRINGS } from "../strings";
import type { FrequencyType, Habit } from "../types/habit";
import styles from "./CreateHabitScreen.module.css";

interface CreateHabitScreenProps {
  onClose: () => void;
  onCreated: (habit: Habit) => void;
}

export function CreateHabitScreen({ onClose, onCreated }: CreateHabitScreenProps) {
  const meta = useMeta();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<FrequencyType>("daily");
  const [days, setDays] = useState<Set<string>>(new Set());
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderTime, setReminderTime] = useState("09:00");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weekdays = meta?.weekdays ?? FALLBACK_WEEKDAYS.map((day) => ({ ...day }));
  const nameMaxLength = meta?.name_max_length ?? DEFAULT_NAME_MAX_LENGTH;

  const hasDays = frequency === "daily" || days.size > 0;
  const canSubmit = name.trim().length > 0 && hasDays && !submitting;

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
    if (!canSubmit) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const habit = await createHabit({
        name: name.trim(),
        frequency_type: frequency,
        days: frequency === "specific_days" ? [...days] : [],
        reminder_time: reminderOn ? reminderTime : null,
      });
      onCreated(habit);
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : "Не удалось создать привычку",
      );
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <header className={styles.navbar}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          {STRINGS.createCancel}
        </button>
        <h2 className={styles.title}>{STRINGS.createTitle}</h2>
        <button
          type="button"
          className={styles.done}
          disabled={!canSubmit}
          onClick={submit}
        >
          {STRINGS.createSubmit}
        </button>
      </header>

      <div className={styles.content}>
        <ListGroup>
          <ListItem>
            <input
              className={styles.nameInput}
              type="text"
              inputMode="text"
              placeholder={STRINGS.createNamePlaceholder}
              maxLength={nameMaxLength}
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
          </ListItem>
        </ListGroup>

        <ListGroup header={STRINGS.createFrequency}>
          <div className={styles.segmentWrap}>
            <SegmentedControl<FrequencyType>
              segments={[
                { value: "daily", label: STRINGS.createDaily },
                { value: "specific_days", label: STRINGS.createSpecificDays },
              ]}
              value={frequency}
              onChange={setFrequency}
            />
          </div>
        </ListGroup>

        {frequency === "specific_days" ? (
          <ListGroup header={STRINGS.createDays}>
            <DayPicker weekdays={weekdays} selected={days} onToggle={toggleDay} />
          </ListGroup>
        ) : null}

        <ListGroup header={STRINGS.createReminder} footer={STRINGS.createReminderFooter}>
          <ListItem label={STRINGS.createReminderRow}>
            <Switch
              checked={reminderOn}
              onChange={setReminderOn}
              label={STRINGS.createReminderRow}
            />
          </ListItem>
          {reminderOn ? (
            <ListItem label={STRINGS.createReminderTime}>
              <TimeInput
                ariaLabel={STRINGS.createReminderTime}
                value={reminderTime}
                onChange={setReminderTime}
              />
            </ListItem>
          ) : null}
        </ListGroup>

        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    </div>
  );
}
