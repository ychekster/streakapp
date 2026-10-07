/**
 * Настройки → «Напоминание»: в выбранные дни и время приходит «Пора отметить
 * привычки» — в Telegram сообщением бота, в веб-приложении уведомлением (bot/reminders.py).
 * Приходит, только если в этот день есть что отмечать.
 *
 * Карточка в стиле экрана настроек: переключатель, а когда он включён — время и дни
 * недели. Каждое изменение сохраняется сразу, как остальные настройки (App → useSettings);
 * время и дни помнятся и при выключенном напоминании. Последний выбранный день не
 * снимается — без дней напоминанию незачем быть включённым.
 *
 * Веб-приложение: включение включает и уведомления (useReminderPush): спрашивает
 * разрешение, а если его уже не дали — окошко, как включить в настройках телефона;
 * выключенные в настройках приложения — включает обратно. Если уведомления запрещены,
 * под карточкой — как их включить.
 */

import { useState } from "react";

import { DayPicker } from "../components/DayPicker";
import { ListGroup } from "../components/ListGroup";
import { ListItem } from "../components/ListItem";
import { Screen } from "../components/Screen";
import { Switch } from "../components/Switch";
import { TimeField } from "../components/TimeField";
import { DEFAULT_CHECKIN_REMINDER_TIME, WEEKDAYS } from "../constants";
import { useReminderPush } from "../hooks/useReminderPush";
import { usePlatform } from "../platform";
import { useStrings } from "../preferences";
import type { CheckinReminder, Settings } from "../types/settings";
import { pushPermission } from "../web/push";
import formStyles from "./HabitFormScreen.module.css";
import styles from "./SettingsScreen.module.css";

interface CheckinReminderScreenProps {
  settings: Settings;
  onSave: (reminder: CheckinReminder) => void;
}

export function CheckinReminderScreen({ settings, onSave }: CheckinReminderScreenProps) {
  const strings = useStrings();
  const web = usePlatform() === "web";
  const [permission, setPermission] = useState(pushPermission);
  const enableReminderPush = useReminderPush();
  const on = settings.checkin_reminder_time !== null;
  // Время и дни, пока напоминание выключено, — сохранённые или по умолчанию.
  const [time, setTime] = useState(
    settings.checkin_reminder_time ?? DEFAULT_CHECKIN_REMINDER_TIME,
  );
  const days =
    settings.checkin_reminder_days.length > 0 ? settings.checkin_reminder_days : [...WEEKDAYS];

  function toggle(next: boolean): void {
    if (next && web) {
      void enableReminderPush().then(setPermission);
    }
    onSave({ time: next ? time : null, days });
  }

  function changeTime(next: string): void {
    setTime(next);
    onSave({ time: next, days });
  }

  function toggleDay(code: string): void {
    const selected = days.includes(code)
      ? days.filter((day) => day !== code)
      : WEEKDAYS.filter((day) => day === code || days.includes(day));
    if (selected.length > 0) {
      onSave({ time, days: selected });
    }
  }

  return (
    <Screen title={strings.checkinReminderTitle} withTabBar={false} enterAnimation>
      <div className={styles.settings}>
        <ListGroup>
          <ListItem label={strings.checkinReminderToggle}>
            <Switch checked={on} onChange={toggle} label={strings.checkinReminderToggle} />
          </ListItem>
          {on ? (
            <>
              <ListItem label={strings.checkinReminderTime}>
                <TimeField
                  value={time}
                  onChange={changeTime}
                  label={strings.checkinReminderTime}
                />
              </ListItem>
              <ListItem>
                <DayPicker selected={new Set(days)} onToggle={toggleDay} />
              </ListItem>
            </>
          ) : null}
        </ListGroup>
        {web && on && permission === "denied" ? (
          <p className={formStyles.note}>{strings.notificationsDenied}</p>
        ) : null}
      </div>
    </Screen>
  );
}
