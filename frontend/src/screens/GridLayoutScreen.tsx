/**
 * Настройки → «Вид сетки»: как сетка привычки раскладывает дни (components/gridLayout.ts).
 *
 * Как выбор оформления в «Настройках» iOS: в карточке две картинки рядом — маленькие
 * сетки, на которых проходят одни и те же дни (анимация: день за днём), под каждой —
 * название и кружок-галочка. «Со сдвигом» — сегодня всегда в правом нижнем кружке,
 * «По порядку» — дни с левого верхнего. Под карточкой — что делает выбранный вид.
 * Выбор сохраняется сразу, как остальные настройки (App → useSettings).
 */

import { useEffect, useState, type CSSProperties } from "react";

import { Screen } from "../components/Screen";
import { GRID_LAYOUTS } from "../constants";
import { useStrings } from "../preferences";
import { habitColorStyle } from "../theme";
import type { GridLayout } from "../types/settings";
import listStyles from "../components/ListGroup.module.css";
import styles from "./GridLayoutScreen.module.css";

/** Картинка: сетка 7 × 5. */
const COLUMNS = 7;
const CELLS = 35;
/** Сколько дней проходит анимация, прежде чем начаться заново. */
const DAYS = 26;
/** Выполнен ли день картинки (одинаково на обеих): серии с редкими пропусками. */
const DONE = Array.from({ length: DAYS }, (_, day) => day % 7 !== 4 && day % 11 !== 9);
const STEP_MS = 650;
/** Пауза на последнем дне перед новым кругом, в шагах. */
const HOLD_STEPS = 4;

interface GridLayoutScreenProps {
  value: GridLayout;
  onChange: (layout: GridLayout) => void;
}

export function GridLayoutScreen({ value, onChange }: GridLayoutScreenProps) {
  const strings = useStrings();
  const day = usePreviewDay();

  return (
    <Screen title={strings.gridLayoutTitle} withTabBar={false} enterAnimation>
      <section className={listStyles.group}>
        <div className={`${listStyles.card} ${styles.options}`} role="radiogroup">
          {GRID_LAYOUTS.map((layout) => {
            const selected = layout === value;
            return (
              <button
                key={layout}
                type="button"
                role="radio"
                aria-checked={selected}
                className={styles.option}
                onClick={() => onChange(layout)}
              >
                <Preview layout={layout} day={day} />
                <span className={styles.name}>{strings.gridLayoutNames[layout]}</span>
                <span className={`${styles.check} ${selected ? styles.checked : ""}`}>
                  {selected ? <CheckIcon /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className={listStyles.footer}>{strings.gridLayoutFooters[value]}</p>
      </section>
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

/** Маленькая сетка: прошедшие `day` дней в раскладке `layout`; сегодняшний — с ободком. */
function Preview({ layout, day }: { layout: GridLayout; day: number }) {
  // День картинки в каждом кружке (0 — первый); null — кружок без дня.
  const dayAt = (cell: number): number | null => {
    const index = layout === "fixed" ? cell : day - CELLS + cell;
    return index >= 0 && index < day ? index : null;
  };
  return (
    <span
      className={styles.preview}
      style={{ ...habitColorStyle("green"), "--preview-columns": COLUMNS } as CSSProperties}
      aria-hidden="true"
    >
      {Array.from({ length: CELLS }, (_, cell) => {
        const index = dayAt(cell);
        return (
          <span
            key={cell}
            className={`${styles.dot} ${index !== null && DONE[index] ? styles.done : ""} ${
              index === day - 1 ? styles.today : ""
            }`}
          />
        );
      })}
    </span>
  );
}

/** Галочка в кружке выбранного вида. */
function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
