/**
 * Окно дня: нажатие на день в календаре привычки (HabitCalendar → openDaySheet) открывает
 * снизу окно (BottomSheet), где этот день можно исправить — любой день истории до дня
 * отметки, и пропущенный, и уже отмеченный.
 *
 * Шапка — день, название привычки и «×». Под ней — что было в этот день (dayInfo.ts),
 * плитками, как карточки «Основного» на экране привычки: статус, график и цель того дня,
 * счёт периода «Гибкого графика», день серии, у совместной — сколько сделала группа. Ниже
 * отметка по настройкам того дня (goalOn: цель и «Сверх плана», сменили — у прошлых дней
 * прежние): у «раз в день» — одна кнопка (отметить / снять), у «несколько раз в день» —
 * счёт за день (CountControls, до цели того дня; выше и быстрые прибавки — у «Сверх
 * плана»). В совместной —
 * моя часть. Не запланированный в тот день (или замороженный) — тоже можно: отметка
 * бонусная, в числах её нет (data/derive.ts, countedDays). Ниже — заметка к дню (пока
 * скрыта, SHOW_NOTE): сохраняется, когда поле теряет фокус, при смене дня и при закрытии.
 *
 * Свайп влево — следующий день, вправо — предыдущий: карточка дня целиком уезжает вбок, а
 * карточка нового дня одновременно въезжает с другой стороны (BottomSheet, `leaving`).
 * Отметки применяются сразу (dataStore.markDay / setDayCount / setNote).
 */

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type TouchEvent,
} from "react";

import { NOTE_MAX_LENGTH, OVERTIME_MAX_COUNT, WEEKDAYS } from "../constants";
import { addDays, markingDay, todayIn, weekdayIndex } from "../data/dates";
import { goalOn, myDay } from "../data/derive";
import { dataStore } from "../data/store";
import { useAppData } from "../hooks/useAppData";
import { useLanguage, useStrings } from "../preferences";
import type { Strings } from "../strings";
import { hapticImpact, hapticSelection } from "../telegram/webapp";
import { habitColorStyle } from "../theme";
import {
  BottomSheet,
  SheetHeader,
  useSheetContent,
  type LeavingCard,
  type SheetTurn,
} from "./BottomSheet";
import { CountControls } from "./CountControls";
import { dayInfo, type DayInfo, type DaySchedule, type DayStatus } from "./dayInfo";
import { ClockIcon, PeopleIcon, SnowflakeIcon } from "./SettingsIcons";
import {
  CompletedIcon,
  FlameIcon,
  MissedIcon,
  RestIcon,
  ScheduleIcon,
  TargetIcon,
} from "./StatIcons";
import { weekdayLabel } from "../weekdayLabel";
import styles from "./DaySheet.module.css";

/** Свайп короче — не смена дня. */
const SWIPE_MIN_PX = 40;

/** Заметка к дню в окне — пока скрыта (данные и сохранение остаются: вернёмся к ней). */
const SHOW_NOTE = false;

// --- Какой день открыт (одно окно на всё приложение) ---

interface OpenDay {
  habitId: number;
  date: string;
}

let opened: OpenDay | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function openDaySheet(habitId: number, date: string): void {
  opened = { habitId, date };
  hapticImpact("light");
  emit();
}

export function closeDaySheet(): void {
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

export function DaySheet() {
  const strings = useStrings();
  const language = useLanguage();
  const { habits, settings } = useAppData();
  // Показанный день: после закрытия окно ещё уезжает вниз (closing) с ним же.
  const { shown, closing, gone } = useSheetContent(useOpenDay());
  // День внутри окна: свайпы меняют его, не трогая открытый.
  const [date, setDate] = useState(shown?.date ?? "");
  // Откуда въехала карточка дня (null — окно только открыто) и та, что уезжает.
  const [turn, setTurn] = useState<SheetTurn | null>(null);
  const [leaving, setLeaving] = useState<LeavingCard | null>(null);
  // Вводимая заметка; null — поле показывает заметку из стора.
  const [note, setNote] = useState<string | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const habit = shown ? habits.find((item) => item.id === shown.habitId) : undefined;

  useEffect(() => {
    if (shown) {
      setDate(shown.date);
      setTurn(null);
      setLeaving(null);
      setNote(null);
    }
  }, [shown]);
  // Привычку удалили — окну нечего показывать.
  useEffect(() => {
    if (!closing && shown && !habit) {
      closeDaySheet();
    }
  }, [closing, shown, habit]);

  if (!shown || !habit || !settings || !date) {
    return null;
  }
  const id = habit.id;
  const day = markingDay(settings.timezone, settings.mark_yesterday);
  const today = todayIn(settings.timezone);

  /** Записать вводимую заметку (если её меняли). */
  function saveNote(): void {
    if (note !== null) {
      dataStore.setNote(id, date, note);
      setNote(null);
    }
  }

  function close(): void {
    saveNote();
    closeDaySheet();
  }

  /** Подпись дня в шапке: «Сегодня», «Вчера» или «Пн, 14 октября». */
  function labelOf(on: string): string {
    if (on === today) {
      return strings.countSheetToday;
    }
    if (addDays(on, 1) === today) {
      return strings.countSheetYesterday;
    }
    return strings.daySheetDate(
      strings.weekdays[WEEKDAYS[weekdayIndex(on)]].abbr,
      Number(on.slice(8, 10)),
      strings.monthNamesOf[Number(on.slice(5, 7)) - 1],
    );
  }

  /** Карточка дня `on`: шапка, отметка и заметка `noteText`. */
  function card(on: string, noteText: string) {
    const mine = myDay(habit!, on, day);
    // Всё — по настройкам того дня: цель «раз в день» и «Сверх плана» (сменили — у
    // прошлых дней прежние).
    const { goal, overtime } = goalOn(habit!, on);
    return (
      <>
        <SheetHeader day={labelOf(on)} name={habit!.name} onClose={close} />
        <DayTiles info={dayInfo(habit!, on, day)} strings={strings} language={language} />
        {goal > 1 ? (
          <div className={styles.count}>
            <CountControls
              count={mine.count}
              goal={goal}
              max={overtime ? OVERTIME_MAX_COUNT : goal}
              quick={overtime}
              current={() => {
                const now = dataStore.getState().habits.find((item) => item.id === id);
                return now ? myDay(now, on, day).count : 0;
              }}
              onSet={(value) => dataStore.setDayCount(id, on, value)}
            />
          </div>
        ) : (
          <button
            type="button"
            className={`${styles.mark} ${mine.done ? styles.markDone : ""}`}
            aria-pressed={mine.done}
            onClick={() => {
              hapticSelection();
              dataStore.markDay(id, on, !mine.done);
            }}
          >
            {mine.done ? strings.daySheetUnmark : strings.daySheetMark}
          </button>
        )}
        {SHOW_NOTE ? (
          <textarea
            className={styles.note}
            placeholder={strings.daySheetNote}
            aria-label={strings.daySheetNote}
            maxLength={NOTE_MAX_LENGTH}
            rows={1}
            value={noteText}
            ref={grow}
            onChange={(event) => {
              setNote(event.target.value);
              grow(event.target);
            }}
            onBlur={saveNote}
          />
        ) : null}
      </>
    );
  }

  const noteText = note ?? habit.notes?.[date] ?? "";

  function go(days: number): void {
    const next = addDays(date, days);
    if (!dataStore.editableDay(next)) {
      return;
    }
    saveNote();
    const direction: SheetTurn = days > 0 ? "next" : "previous";
    // Без анимации уезжать нечему — карточка просто сменяется.
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setLeaving({ key: date, turn: direction, content: card(date, noteText) });
    }
    setTurn(direction);
    setDate(next);
    hapticSelection();
  }

  function onTouchStart(event: TouchEvent): void {
    const point = event.touches[0];
    touch.current = point ? { x: point.clientX, y: point.clientY } : null;
  }

  function onTouchEnd(event: TouchEvent): void {
    const start = touch.current;
    const point = event.changedTouches[0];
    touch.current = null;
    if (!start || !point) {
      return;
    }
    const dx = point.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(point.clientY - start.y)) {
      go(dx < 0 ? 1 : -1);
    }
  }

  return (
    <BottomSheet
      closing={closing}
      onClose={close}
      onGone={gone}
      label={strings.daySheetLabel(habit.name, labelOf(date))}
      style={habitColorStyle(habit.color)}
      cardKey={date}
      turn={turn}
      leaving={leaving}
      onLeft={() => setLeaving(null)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {card(date, noteText)}
    </BottomSheet>
  );
}

/** Плитка «что было в этот день». */
interface Tile {
  key: string;
  icon: ReactNode;
  value: string;
  label: string;
}

/** Значок статуса дня. */
function statusIcon(status: DayStatus): ReactNode {
  switch (status) {
    case "done":
    case "bonus":
      return <CompletedIcon />;
    case "missed":
      return <MissedIcon />;
    case "frozen":
      return <SnowflakeIcon />;
    case "open":
      return <ClockIcon />;
    case "partial":
      return <TargetIcon />;
    default:
      return <RestIcon />;
  }
}

/** Что было в этот день — плитки в две колонки; при нечётном их числе статус — во всю
 *  ширину. Плитки без значения не показываются. */
function DayTiles({ info, strings, language }: { info: DayInfo; strings: Strings; language: string }) {
  const tiles: Tile[] = [
    {
      key: "status",
      icon: statusIcon(info.status),
      value: strings.dayInfoStatuses[info.status],
      label: info.status === "bonus" ? strings.dayInfoNotInStats : strings.dayInfoStatus,
    },
  ];
  if (info.streak) {
    tiles.push({
      key: "streak",
      icon: <FlameIcon />,
      value: String(info.streak),
      label: strings.dayInfoStreakDay,
    });
  }
  if (info.period) {
    tiles.push({
      key: "period",
      icon: <TargetIcon />,
      value: strings.dayInfoOf(info.period.done, info.period.quota),
      label: periodLabel(info.period, strings, language),
    });
  }
  tiles.push({
    key: "schedule",
    icon: <ScheduleIcon />,
    value: scheduleLabel(info.schedule, strings),
    label: strings.dayInfoSchedule,
  });
  if (info.goalThen > 1 || info.goalNow > 1) {
    tiles.push({
      key: "goal",
      icon: <TargetIcon />,
      value: String(info.goalThen),
      // Цель того дня — без нынешней: день живёт по своим настройкам.
      label: strings.dayInfoTimesADay,
    });
  }
  if (info.group) {
    const byPeople = info.goalNow === 1;
    tiles.push({
      key: "group",
      icon: <PeopleIcon />,
      value: byPeople
        ? strings.dayInfoOf(info.group.done, info.group.people)
        : `${Math.round(info.group.fill * 100)}%`,
      label: byPeople ? strings.dayInfoGroupDone : strings.dayInfoGroupFill,
    });
  }
  const wideFirst = tiles.length % 2 === 1;
  return (
    <div className={styles.tiles}>
      {tiles.map((tile, index) => (
        <div
          key={tile.key}
          className={`${styles.tile} ${wideFirst && index === 0 ? styles.tileWide : ""}`}
        >
          <span className={styles.tileIcon} aria-hidden="true">
            {tile.icon}
          </span>
          <p className={styles.tileValue}>{tile.value}</p>
          <p className={styles.tileLabel}>{tile.label}</p>
        </div>
      ))}
    </div>
  );
}

/** График того дня: «Каждый день», «Пн, Ср и Пт», «Через день», «3 дня в неделю». */
function scheduleLabel(schedule: DaySchedule, strings: Strings): string {
  switch (schedule.frequency_type) {
    case "daily":
      return strings.formDaily;
    case "every_other_day":
      return strings.formEveryOtherDay;
    case "monthly":
      return strings.formMonthly;
    case "flexible":
      return strings.formPeriodTimes(schedule.period_times ?? 1, schedule.period ?? "week");
    default:
      return weekdayLabel(schedule.days, strings, strings.formDaily);
  }
}

/** Период «Гибкого графика»: «Неделя 20 окт. – 26 окт.», «Октябрь», «2026». */
function periodLabel(period: NonNullable<DayInfo["period"]>, strings: Strings, language: string): string {
  if (period.kind === "year") {
    return period.start.slice(0, 4);
  }
  if (period.kind === "month") {
    return strings.monthNames[Number(period.start.slice(5, 7)) - 1];
  }
  const asDate = (day: string): Date => new Date(`${day}T00:00:00Z`);
  const format = new Intl.DateTimeFormat(language, { day: "numeric", month: "short", timeZone: "UTC" });
  const range = `${format.format(asDate(period.start))} – ${format.format(asDate(period.end))}`;
  return `${strings.periodNames.week} ${range}`;
}

/** Поле заметки — по высоте текста (окно растёт вверх), но не выше предела из стилей:
 *  дальше прокручивается. */
function grow(field: HTMLTextAreaElement | null): void {
  if (field) {
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }
}
