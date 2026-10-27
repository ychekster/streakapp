/**
 * Настройки → «Вид сетки»: как сетка привычки раскладывает дни (components/gridLayout.ts).
 *
 * Каждый вид — своя карточка, оформленная как блок привычки: название вместо названия
 * привычки, кружок выбора вместо кнопки отметки, под ними — сетка, на которой проходят
 * одни и те же дни с редкими пропусками (анимация: день за днём). Под каждой карточкой — что
 * делает этот вид. «Со сдвигом» — сегодня всегда в правом нижнем кружке, «По порядку» —
 * дни с левого верхнего, «Календарь» — последние дни до сегодняшнего по своим датам в
 * календаре по месяцам (CalendarGrid). Выбор сохраняется сразу, как остальные настройки
 * (App → useSettings).
 */

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { CalendarGrid } from "../components/CalendarGrid";
import { localDate } from "../components/DateField";
import { Screen } from "../components/Screen";
import { GRID_COLUMNS, GRID_LAYOUTS } from "../constants";
import { addDays } from "../data/dates";
import { useStrings } from "../preferences";
import { habitColorStyle } from "../theme";
import type { GridLayout } from "../types/settings";
import checkStyles from "../components/CheckButton.module.css";
import habitStyles from "../components/HabitBlock.module.css";
import listStyles from "../components/ListGroup.module.css";
import styles from "./GridLayoutScreen.module.css";
import formStyles from "./HabitFormScreen.module.css";

/** Картинка: столько же кружков в ряду, сколько в сетке списка, четыре ряда. */
const COLUMNS = GRID_COLUMNS;
const CELLS = COLUMNS * 4;
/** Сколько дней проходит анимация, прежде чем начаться заново. */
const DAYS = 38;
const STEP_MS = 500;
/** Пауза на последнем дне перед новым кругом, в шагах. */
const HOLD_STEPS = 4;
/** Пропущенные дни картинки (0 — первый): по ним видно, как дни сдвигаются вместе с
 *  сеткой или стоят на месте. Вразнобой и без пар через ряд (разница COLUMNS ± 1) —
 *  иначе соседние ряды складываются в одинаковый узор. */
const MISSED = new Set([2, 7, 8, 14, 19, 28, 35]);

interface GridLayoutScreenProps {
  value: GridLayout;
  onChange: (layout: GridLayout) => void;
}

export function GridLayoutScreen({ value, onChange }: GridLayoutScreenProps) {
  const strings = useStrings();
  const day = usePreviewDay();

  return (
    <Screen title={strings.gridLayoutTitle} withTabBar={false} enterAnimation pinnedTitle>
      <div className={formStyles.pinned} role="radiogroup" aria-label={strings.gridLayoutTitle}>
        {GRID_LAYOUTS.map((layout) => {
          const selected = layout === value;
          return (
            <section key={layout} className={listStyles.group}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                className={`${listStyles.card} ${styles.option}`}
                style={habitColorStyle("green")}
                onClick={() => onChange(layout)}
              >
                <span className={habitStyles.header}>
                  <span className={habitStyles.name}>{strings.gridLayoutNames[layout]}</span>
                  <span className={`${checkStyles.button} ${selected ? checkStyles.done : ""}`}>
                    <CheckIcon />
                  </span>
                </span>
                <Preview layout={layout} day={day} />
              </button>
              <p className={listStyles.footer}>{strings.gridLayoutFooters[layout]}</p>
            </section>
          );
        })}
      </div>
    </Screen>
  );
}

/** Сколько дней прошло на картинках (1…DAYS): растёт по шагу и начинается заново. При
 *  «уменьшить движение» — стоит на последнем дне. */
function usePreviewDay(): number {
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const [step, setStep] = useState(reduced ? DAYS - 1 : 0);
  useEffect(() => {
    if (reduced) {
      return undefined;
    }
    const timer = window.setInterval(
      () => setStep((current) => (current + 1) % (DAYS + HOLD_STEPS)),
      STEP_MS,
    );
    return () => window.clearInterval(timer);
  }, [reduced]);
  return Math.min(step, DAYS - 1) + 1;
}

/** Сетка: прошедшие `day` дней в раскладке `layout`, выполнены все, кроме пропущенных
 *  (MISSED); в сегодняшнем — точка. */
function Preview({ layout, day }: { layout: GridLayout; day: number }) {
  if (layout === "calendar") {
    return <CalendarPreview day={day} />;
  }
  // День картинки в каждом кружке (0 — первый); null — кружок без дня.
  const dayAt = (cell: number): number | null => {
    const index = layout === "fixed" ? cell : day - CELLS + cell;
    return index >= 0 && index < day ? index : null;
  };
  return (
    <span
      className={styles.preview}
      style={{ "--preview-columns": COLUMNS } as CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: CELLS }, (_, cell) => {
        const index = dayAt(cell);
        return (
          <span
            key={cell}
            className={`${styles.dot} ${index !== null && !MISSED.has(index) ? styles.done : ""} ${
              index === day - 1 ? styles.today : ""
            }`}
          />
        );
      })}
    </span>
  );
}

/** Сколько дней истории у картинки «Календарь»: хватает на 4 месяца сетки. */
const CALENDAR_HISTORY = 130;

/** «Календарь»: последние DAYS дней по сегодня проходят по своим датам (до них — те же
 *  дни с пропусками по кругу); месяцы — по сегодняшний, они не сдвигаются. */
function CalendarPreview({ day }: { day: number }) {
  const today = useMemo(() => localDate(), []);
  const history = useMemo(
    () =>
      Array.from({ length: CALENDAR_HISTORY }, (_, at) => {
        // День картинки (0 — первый день анимации), от последнего дня истории — сегодня.
        const index = DAYS - CALENDAR_HISTORY + at;
        return !MISSED.has(((index % DAYS) + DAYS) % DAYS);
      }),
    [],
  );
  const shown = DAYS - day;
  return (
    <span className={styles.calendar} aria-hidden="true">
      <CalendarGrid
        history={history.slice(0, CALENDAR_HISTORY - shown)}
        day={addDays(today, -shown)}
        until={today}
      />
    </span>
  );
}

/** Галочка в кружке выбранного вида — как у кнопки отметки (CheckButton). */
function CheckIcon() {
  return (
    <svg className={checkStyles.check} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.75l4.5 4.5L19 7.75"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
