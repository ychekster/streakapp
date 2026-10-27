/**
 * Экран создания и редактирования привычки — один и тот же, отличаются заголовок, кнопка
 * и начальные значения.
 *
 * Заголовок «Новая привычка» («Редактирование») — сразу маленький, по центру шапки, как в
 * «Папках» (Screen `pinnedTitle`); под ним
 * — секции в стиле экрана привычки, но с заголовками как в эталоне: с заглавной буквы (не
 * капсом) и со сдвигом до конца скругления карточки:
 *  - Информация — название и под ним описание (необязательно; в списке — серым под
 *    названием);
 *  - Частота — «Повтор»: по дням недели, через день или каждый месяц. По дням недели —
 *    под рядом выбор дней (как в «Будильнике» iOS), а в ряду — выбранные дни: все —
 *    «Каждый день», «Будние дни», «Выходные», иначе «Пн, Ср и Пт», ни одного — «Никогда»
 *    (сохранить нельзя). Все дни сохраняются как `daily`, остальные — `specific_days`.
 *    «Через день» и «каждый месяц» добавляют дату начала (системный календарь): с неё
 *    привычка идёт каждый второй день или то же число каждого месяца (в коротком месяце
 *    — его последний день). «Гибкий график» — вместо дней «Период» (неделя, месяц, год) и
 *    сколько раз за него («3 раза в неделю», степпер −/+; у года — число вводится с
 *    цифровой клавиатуры) в любые дни. Цель больше дней короткого месяца (года) в нём
 *    молча считается по числу дней;
 *  - Цель — сколько раз в день выполнить привычку («1 раз в день», степпер −/+). Больше
 *    одного раза — кружок отметки бледный, внутри — сколько раз осталось, каждое нажатие
 *    закрашивает его часть (CheckButton). Тогда в той же карточке — переключатель «Можно
 *    больше цели» («Сверх плана»: на цели нажатие открывает окно счёта, CountSheet). С
 *    «Целью по времени» вместо раз — время в день («45 мин в день», степпер по 5 минут) и
 *    тот же переключатель;
 *  - Напоминание — выключено или включено со временем: тогда в этот день и время бот
 *    пришлёт в чат «🔔 Пора выполнить «…»» (bot/reminders.py). «Добавить напоминание»
 *    добавляет ещё одну строку со временем (до MAX_REMINDERS_PER_HABIT; новое — на час
 *    позже последнего), у добавленных слева красный «−» — убрать. Первое время убирается
 *    только переключателем;
 *    В веб-приложении вместо бота — уведомление. Включённое напоминание (у новой
 *    привычки — при «Добавить привычку», у старой впервые — сразу переключателем) включает
 *    уведомления: спрашивает разрешение, а если его уже не дали — окошко, как включить в
 *    настройках телефона; выключенные в настройках приложения — включает обратно
 *    (useReminderPush). Первая привычка и без напоминания спрашивает разрешение, если
 *    уведомления не выключены (никогда — при первом запуске). Если уведомления запрещены,
 *    под переключателем — как их включить (spec §9);
 *  - Тема — цвет привычки. Форма сразу окрашивается в выбранный цвет (дни недели, кнопка);
 *  - «Дополнительно ›» — ряд, открывающий экран «Дополнительно» с двумя секциями ниже,
 *    нужными реже остальных. Переключатели там сразу меняют форму — нижней кнопки на
 *    экране нет, «Назад» (или свайп) возвращает в форму с ними. Привычку, как всегда,
 *    сохраняет сама форма. Экран рисует сама форма (её поля живут здесь), а открыт ли
 *    он, решает App (`advanced`) — так «Назад» Telegram ведёт с него в форму;
 *  - Автоотметка — переключатель «Отмечать автоматически» с пояснением под ним; та же,
 *    что на экране привычки. Только у привычек «раз в день»: с целью больше одного раза (и
 *    по времени) ряд пропадает; в групповой его нет;
 *  - Цель по времени — «Таймер вместо отметки»: вместо галочки кнопка ▶ (TimerButton),
 *    цель — время в день. Только у личных привычек: в групповой (и пока включён
 *    «Вести с друзьями») ряда нет, а с таймером нет «Групповой привычки»;
 *  - Групповая привычка — переключатель «Вести с друзьями» с пояснением, пока в привычке
 *    никого, кроме пользователя (новая, обычная или групповая без других): что это и как
 *    пригласить, сказано в подписи под ним. Гостю веб-приложения — предложение войти через
 *    Telegram.
 *    Когда в привычке есть другие, ряда нет: из неё можно только выйти (экран привычки).
 *
 * Групповая привычка — та же форма, только без автоотметки. Всё, кроме напоминаний
 * (название, описание, повтор, цель, тема), задаёт владелец — у остальных эти поля бледные
 * и не нажимаются; напоминания у каждого свои. Новая групповая открывает свой экран (App),
 * звать друзей — «Добавить участника» там.
 *
 * Открывается кнопкой «+» (пустая) или рядом «Редактировать привычку» на экране привычки.
 * Пока экран открыт, «Закрыть» Telegram заменена на «Назад» (см. App). Новую привычку
 * сохраняет нижняя кнопка «Добавить привычку» — неактивна, пока нет названия (или не выбран
 * ни один день); «Назад» — выйти без неё. У редактируемой кнопки нет: «Назад» (свайп)
 * сохраняет изменения, если их можно сохранить, иначе выходит без них (`leave`).
 */

import { useRef, useState, type KeyboardEvent, type MutableRefObject } from "react";

import { ColorPicker } from "../components/ColorPicker";
import { DateField, localDate } from "../components/DateField";
import { DayPicker } from "../components/DayPicker";
import { Disclosure } from "../components/Disclosure";
import { ListItem } from "../components/ListItem";
import { MenuSelect } from "../components/MenuSelect";
import { Screen } from "../components/Screen";
import { Card, Section } from "../components/Section";
import { Stepper } from "../components/Stepper";
import { Switch } from "../components/Switch";
import { TimeField } from "../components/TimeField";
import { duration } from "../components/timerFormat";
import {
  DEFAULT_GOAL_SECONDS,
  DEFAULT_HABIT_COLOR,
  DEFAULT_NAME_MAX_LENGTH,
  DEFAULT_REMINDER_TIME,
  HABIT_DESCRIPTION_MAX_LENGTH,
  GOAL_STEP_SECONDS,
  MAX_GOAL_SECONDS,
  MAX_REMINDERS_PER_HABIT,
  MAX_TIMES_PER_DAY,
  PERIOD_MAX_TIMES,
  START_DATE_MAX_AHEAD_DAYS,
  WEEKDAYS,
} from "../constants";
import { ApiRequestError } from "../api/client";
import { reminderTimesOf, usesStartDate } from "../data/derive";
import { reportGroupError } from "../data/groups";
import { dataStore } from "../data/store";
import { describeError } from "../errors";
import { useMainButton } from "../hooks/useMainButton";
import { useMeta } from "../hooks/useMeta";
import { useReminderPush } from "../hooks/useReminderPush";
import { usePlatform } from "../platform";
import { useStrings } from "../preferences";
import { hapticNotification, showAlert } from "../telegram/webapp";
import { habitColorStyle, MAIN_BUTTON_DISABLED, mainButtonHabitColors } from "../theme";
import type { FrequencyType, Habit, HabitColor, HabitInput, Period } from "../types/habit";
import { askPermissionUnlessOff, pushPermission, subscribePush } from "../web/push";
import { weekdayLabel } from "../weekdayLabel";
import styles from "./HabitFormScreen.module.css";

interface HabitFormScreenProps {
  /** Редактируемая привычка; null — создание новой. */
  habit: Habit | null;
  /** Групповую привычку не завести без входа через Telegram (гость веб-приложения). */
  sharedNeedsTelegram?: boolean;
  /** «Войти» в предложении войти через Telegram. */
  onLinkTelegram: () => void;
  /** Привычка сохранена (создана или изменена) — на устройстве, сервер узнает следом. */
  onSaved: (habit: Habit) => void;
  /** Открыт экран «Дополнительно» поверх формы. */
  advanced: boolean;
  onOpenAdvanced: () => void;
  /** Сюда форма кладёт свой выход («Назад» App при редактировании): см. `leave`. */
  leaveRef: MutableRefObject<(() => boolean) | null>;
}

export function HabitFormScreen({
  habit,
  sharedNeedsTelegram = false,
  onLinkTelegram,
  onSaved,
  advanced,
  onOpenAdvanced,
  leaveRef,
}: HabitFormScreenProps) {
  const meta = useMeta();
  const strings = useStrings();
  // «Групповая привычка»: переключатель — пока в привычке никого, кроме пользователя.
  const group = habit?.group ?? null;
  const wasShared = group !== null;
  const [shared, setShared] = useState(wasShared);
  const canSwitchShared = group === null || group.members.length <= 1;
  // Групповая привычка: всё, кроме напоминаний, — у владельца.
  const locked = group !== null && !group.is_owner;
  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  // По дням недели (daily и specific_days — одна строка меню) или с даты начала.
  const [repeat, setRepeat] = useState<RepeatMode>(() =>
    habit?.frequency_type &&
    (usesStartDate(habit.frequency_type) || habit.frequency_type === "flexible")
      ? (habit.frequency_type as RepeatMode)
      : "weekly",
  );
  // «Гибкий график»: период и сколько раз за него; помнятся при смене частоты.
  const [period, setPeriod] = useState<Period>(habit?.period ?? "week");
  const [periodTimes, setPeriodTimes] = useState(habit?.period_times ?? 3);
  // Поле «Раз в год», пока его редактируют: может быть пустым или вне 1–366 — тогда
  // цель прежняя, а при уходе из поля в нём снова она.
  const [yearDraft, setYearDraft] = useState<string | null>(null);
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
  // «Цель по времени»: цель — секунды (своя, помнится и при цели в разах, и наоборот).
  const [timed, setTimed] = useState(habit?.goal_unit === "seconds");
  const [goalSeconds, setGoalSeconds] = useState(
    habit?.goal_unit === "seconds" ? habit.times_per_day : DEFAULT_GOAL_SECONDS,
  );
  const [timesPerDay, setTimesPerDay] = useState(
    habit?.goal_unit === "seconds" ? 1 : (habit?.times_per_day ?? 1),
  );
  // Помнится, пока цель больше одного раза (ряд скрыт), но сохраняется только при одном.
  const [autoMark, setAutoMark] = useState(habit?.auto_mark ?? false);
  // «Сверх плана» — наоборот: помнится при одном разе, сохраняется только при нескольких.
  const [overtime, setOvertime] = useState(habit?.overtime ?? false);
  const [submitting, setSubmitting] = useState(false);
  const web = usePlatform() === "web";
  const [permission, setPermission] = useState(pushPermission);
  const enableReminderPush = useReminderPush();
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
    { value: "flexible", label: strings.formFlexible },
  ] as const;
  const periodOptions = (["week", "month", "year"] as const).map((value) => ({
    value,
    label: strings.periodNames[value],
  }));
  function changePeriod(next: Period): void {
    setPeriod(next);
    setPeriodTimes((times) => Math.min(times, PERIOD_MAX_TIMES[next]));
  }

  /** Ввод в поле «Раз в год»: только цифры; число 1–366 сразу становится целью, больше —
   *  становится 366 (дальше цифры ничего не меняют). */
  function typeYearTimes(text: string): void {
    let digits = text.replace(/\D/g, "");
    if (Number(digits) > PERIOD_MAX_TIMES.year) {
      digits = String(PERIOD_MAX_TIMES.year);
    }
    setYearDraft(digits);
    const times = Number(digits);
    if (times >= 1) {
      setPeriodTimes(times);
    }
  }

  // Нижняя кнопка — только у новой привычки: изменённая сохраняется при выходе (leave). На
  // «Дополнительно» её нет.
  useMainButton(
    advanced || habit
      ? null
      : {
          text: strings.formCreateSubmit,
          ...(valid ? mainButtonHabitColors(color) : MAIN_BUTTON_DISABLED),
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

  async function switchShared(on: boolean): Promise<void> {
    if (!on) {
      setShared(false);
      return;
    }
    if (sharedNeedsTelegram) {
      await reportGroupError(
        new ApiRequestError(0, "group_needs_telegram", ""),
        strings,
        onLinkTelegram,
      );
      return;
    }
    setShared(true);
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

  /** Web app: right from this tap (Safari needs the gesture). A reminder just turned on
   *  turns notifications on; a new habit without one only asks, unless turned off in
   *  Settings. */
  function enablePush(): void {
    if (web && reminderOn && habit?.reminder_time == null) {
      void enableReminderPush().then(setPermission);
    } else if (web && (!habit || reminderOn)) {
      if (permission === "default") {
        void askPermissionUnlessOff().then(setPermission);
      } else if (permission === "granted") {
        void subscribePush();
      }
    }
  }

  /** Переключатель напоминания. При редактировании кнопки сохранения нет — включённое
   *  впервые напоминание включает уведомления сразу, по этому нажатию. */
  function switchReminder(on: boolean): void {
    setReminderOn(on);
    if (habit && web && on && habit.reminder_time == null) {
      void enableReminderPush().then(setPermission);
    }
  }

  const input = habitInput();
  // Что было в форме при открытии: изменилось ли что-то, видно при выходе.
  const initialInput = useRef(JSON.stringify(input));

  /** Выход из формы редактирования («Назад», свайп): изменения сохраняются сами, если их
   *  можно сохранить; нельзя (нет названия, ни одного дня) — форма закрывается без них.
   *  true — привычка сохранена (onSaved уже вызван), иначе форму закрывает App. */
  function leave(): boolean {
    if (!habit || !valid || JSON.stringify(input) === initialInput.current) {
      return false;
    }
    if (web && reminderOn && permission === "granted") {
      void subscribePush();
    }
    try {
      onSaved(dataStore.updateHabit(habit.id, input));
      return true;
    } catch (caught) {
      // Сервер бы не принял (имя занято…): изменения не применяются — объясняем почему.
      hapticNotification("error");
      void showAlert({
        okLabel: strings.alertOk,
        title: strings.formEditFailed,
        message: describeError(strings, caught, strings.formEditFailed),
      });
      return false;
    }
  }
  leaveRef.current = leave;

  /** Привычка, как её сохранит форма. */
  function habitInput(): HabitInput {
    return {
      name: name.trim(),
      description: description.trim(),
      frequency_type: frequency,
      // Дни — в порядке недели, как их показывает выбор.
      days: frequency === "specific_days" ? WEEKDAYS.filter((code) => days.has(code)) : [],
      start_date: usesStartDate(frequency) ? startDate : null,
      period: frequency === "flexible" ? period : null,
      period_times: frequency === "flexible" ? periodTimes : null,
      // Порядок и повторы приводит в вид сервер (и data/derive.ts на устройстве).
      reminder_time: reminderOn ? [...reminders.map((item) => item.time)].sort()[0] : null,
      reminder_times: reminderOn ? reminders.map((item) => item.time) : [],
      color,
      times_per_day: timed ? goalSeconds : timesPerDay,
      goal_unit: timed ? "seconds" : "times",
      // У «несколько раз в день», по времени и в групповой автоотметки нет (ряд скрыт).
      auto_mark: autoMark && !timed && timesPerDay === 1 && !shared,
      overtime: overtime && (timed || timesPerDay > 1),
      // Только если переключатель изменили: иначе привычка такая, какая есть на сервере.
      ...(shared !== wasShared ? { shared } : {}),
    };
  }

  /** «Добавить привычку». */
  async function submit(): Promise<void> {
    if (habit || !valid || submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    enablePush();
    try {
      // Saved on the device at once (data/store.ts) — checked there as the server would:
      // the habit limit is shown in a system dialog right away.
      onSaved(dataStore.createHabit(input));
    } catch (caught) {
      const failed = strings.formCreateFailed;
      submittingRef.current = false;
      setSubmitting(false);
      hapticNotification("error");
      void showAlert({ okLabel: strings.alertOk, title: failed, message: describeError(strings, caught, failed) });
    }
  }

  const nameRow = (
    <ListItem>
      <input
        className={styles.textInput}
        type="text"
        placeholder={strings.formNamePlaceholder}
        aria-label={strings.formNamePlaceholder}
        maxLength={nameMaxLength}
        value={name}
        onChange={(event) => setName(event.target.value)}
        // «Готово» на клавиатуре просто её убирает.
        enterKeyHint="done"
        onKeyDown={blurOnEnter}
      />
    </ListItem>
  );

  const descriptionRow = (
    <ListItem>
      <input
        className={styles.textInput}
        type="text"
        placeholder={strings.formDescriptionPlaceholder}
        aria-label={strings.formDescriptionPlaceholder}
        maxLength={HABIT_DESCRIPTION_MAX_LENGTH}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        enterKeyHint="done"
        onKeyDown={blurOnEnter}
      />
    </ListItem>
  );

  const frequencyRows = (
    <>
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
      {frequency === "flexible" ? (
        <>
          <ListItem label={strings.formPeriod}>
            <MenuSelect<Period>
              options={periodOptions}
              value={period}
              onChange={changePeriod}
              label={strings.formPeriod}
            />
          </ListItem>
          {period === "year" ? (
            // Год — до 366 раз: степпером не набрать, число вводится с клавиатуры.
            <ListItem label={strings.formYearTimes}>
              <input
                className={styles.numberInput}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={strings.formYearTimes}
                value={yearDraft ?? String(periodTimes)}
                onChange={(event) => typeYearTimes(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={() => setYearDraft(null)}
                enterKeyHint="done"
                onKeyDown={blurOnEnter}
              />
            </ListItem>
          ) : (
            <ListItem label={strings.formPeriodTimes(periodTimes, period)}>
              <Stepper
                value={periodTimes}
                min={1}
                max={PERIOD_MAX_TIMES[period]}
                onChange={setPeriodTimes}
                decreaseLabel={strings.formPeriodLess}
                increaseLabel={strings.formPeriodMore}
              />
            </ListItem>
          )}
        </>
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
    </>
  );

  const goalRows = (
    <>
      {timed ? (
        <ListItem label={strings.formGoalTime(duration(goalSeconds, strings))}>
          {/* Шагами по 5 минут: от 5 минут до суток. */}
          <Stepper
            value={Math.max(1, Math.round(goalSeconds / GOAL_STEP_SECONDS))}
            min={1}
            max={MAX_GOAL_SECONDS / GOAL_STEP_SECONDS}
            onChange={(steps) => setGoalSeconds(steps * GOAL_STEP_SECONDS)}
            decreaseLabel={strings.formTimeLess}
            increaseLabel={strings.formTimeMore}
          />
        </ListItem>
      ) : (
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
      )}
      {timed || timesPerDay > 1 ? (
        <ListItem label={strings.formOvertimeToggle}>
          <span className={styles.overtimeSwitch}>
            <Switch checked={overtime} onChange={setOvertime} label={strings.formOvertimeToggle} />
          </span>
        </ListItem>
      ) : null}
    </>
  );

  const reminderRows = (
    <>
      <ListItem label={strings.formReminderToggle}>
        <Switch checked={reminderOn} onChange={switchReminder} label={strings.formReminderToggle} />
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
    </>
  );

  const deniedNote =
    web && reminderOn && permission === "denied" ? (
      <p className={styles.note}>{strings.notificationsDenied}</p>
    ) : null;

  if (advanced) {
    return (
      <Screen key="advanced" title={strings.formAdvanced} withTabBar={false} enterAnimation pinnedTitle>
        <div className={`${styles.form} ${styles.pinned}`} style={habitColorStyle(color)}>
          {!timed && timesPerDay === 1 && !shared ? (
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

          {!shared ? (
            <Section
              variant="form"
              title={strings.formTimerHeading}
              footer={strings.formTimerFooter}
            >
              <Card>
                <ListItem label={strings.formTimerToggle}>
                  <Switch checked={timed} onChange={setTimed} label={strings.formTimerToggle} />
                </ListItem>
              </Card>
            </Section>
          ) : null}

          {canSwitchShared && !timed ? (
            <Section
              variant="form"
              title={strings.formSharedHeading}
              footer={strings.formSharedFooter}
            >
              <Card>
                <ListItem label={strings.formSharedToggle}>
                  <Switch
                    checked={shared}
                    onChange={(on) => void switchShared(on)}
                    label={strings.formSharedToggle}
                  />
                </ListItem>
              </Card>
            </Section>
          ) : null}
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      key="form"
      title={habit ? strings.formEditTitle : strings.formCreateTitle}
      withTabBar={false}
      enterAnimation
      pinnedTitle
    >
      <div className={`${styles.form} ${styles.pinned}`} style={habitColorStyle(color)}>
        {/* Групповая привычка у участника: всё, кроме напоминаний, задаёт владелец. */}
        <Section variant="form" title={strings.formInfoHeading}>
          <fieldset className={styles.fieldset} disabled={locked}>
            <Card>
              {nameRow}
              {descriptionRow}
            </Card>
          </fieldset>
        </Section>

        <Section variant="form" title={strings.formFrequencyHeading}>
          <fieldset className={styles.fieldset} disabled={locked}>
            <Card>{frequencyRows}</Card>
          </fieldset>
        </Section>

        <Section variant="form" title={strings.formGoalHeading}>
          <fieldset className={styles.fieldset} disabled={locked}>
            <Card>{goalRows}</Card>
          </fieldset>
        </Section>

        <Section variant="form" title={strings.formReminderHeading}>
          <Card>{reminderRows}</Card>
          {deniedNote}
        </Section>

        <Section variant="form" title={strings.formThemeHeading}>
          <fieldset className={styles.fieldset} disabled={locked}>
            <Card>
              <ColorPicker value={color} onChange={setColor} label={strings.formThemeHeading} />
            </Card>
          </fieldset>
        </Section>

        {!shared || canSwitchShared ? (
          <Section variant="form">
            <Card>
              <ListItem label={strings.formAdvanced} onPress={onOpenAdvanced}>
                <Disclosure />
              </ListItem>
            </Card>
          </Section>
        ) : null}
      </div>
    </Screen>
  );
}

/** «Готово» (Enter) на клавиатуре поля просто её убирает. */
function blurOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter") {
    event.currentTarget.blur();
  }
}

/** Строка меню «Повтор»: по дням недели (daily / specific_days), с даты начала или
 *  «Гибкий график». */
type RepeatMode = "weekly" | "every_other_day" | "monthly" | "flexible";

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
