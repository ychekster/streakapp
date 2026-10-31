/** Круглая кнопка отметки выполнения за день отметки (пустой кружок ↔ заполненный с
 *  галочкой).
 *
 *  Привычка «несколько раз в день» (`total` > 1): пока день не выполнен, обводка бледная,
 *  а посередине — сколько раз ещё осталось (обратный отсчёт: 5, 4, … 1) цветом привычки.
 *  Каждое нажатие уменьшает число и плавно закрашивает следующую долю обводки — дугой от
 *  12 часов по часовой стрелке. Последнее нажатие сразу ставит галочку, как у обычной
 *  привычки; следующее открывает окно счёта (HabitBlock → CountSheet), долгое нажатие —
 *  тоже, в любой момент (`onLongPress`).
 *
 *  «Сверх плана» (`countUp`): на цели кружок залит, а посередине вместо галочки — сколько
 *  сделано всего, а в окне счёта его можно увеличить дальше цели. С трёх цифр кнопка вытягивается
 *  влево в пилюлю (шире с каждой цифрой).
 *
 *  Не запланирована на день отметки (`bonus`): отмечать можно, но отметка бонусная — в
 *  сериях её нет (data/derive.ts, countedDays), поэтому кнопка бледная.
 */

import { useEffect, useRef, useState } from "react";

import { useLongPress } from "../hooks/useLongPress";
import { useStrings } from "../preferences";
import styles from "./CheckButton.module.css";

/** Длительность закрашивания доли обводки (мс). */
const FILL_MS = 340;

/** С этого числа кнопка «Сверх плана» — пилюля (три цифры в кружок не помещаются). */
const WIDE_FROM = 100;

/** Геометрия SVG поверх кнопки «несколько раз в день» (вся кнопка с обводкой, 30×30 —
 *  --check-size): дуга идёт по середине обводки толщиной 2⅔px (--check-stroke). */
const VIEW = 30;
const CENTER = VIEW / 2;
const RADIUS = (VIEW - 8 / 3) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Быстрый старт и плавное торможение к концу дуги (ease-out cubic). */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Доля, плавно догоняющая `target` за FILL_MS, когда растёт; уменьшается сразу (и
 *  всегда сразу при reduced motion). */
export function useAnimatedFraction(target: number): number {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) {
      return undefined;
    }
    if (target < from || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      current.current = target;
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / FILL_MS);
      current.current = from + (target - from) * easeOut(progress);
      setValue(current.current);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

interface CheckButtonProps {
  done: boolean;
  /** Доступная подпись (название привычки) — для скринридеров. */
  habitName: string;
  onToggle: () => void;
  /** Неактивная кнопка: показывает статус, но не реагирует на нажатие (только просмотр). */
  disabled?: boolean;
  /** Привычка заморожена (подпись неактивной кнопки). */
  frozen?: boolean;
  /** Не запланирована на день отметки: отметка бонусная — кнопка бледная. */
  bonus?: boolean;
  /** Сколько раз в день нужно выполнить привычку (больше 1 — кружок с числом). */
  total?: number;
  /** Сколько раз выполнена за день отметки. */
  count?: number;
  /** «Сверх плана»: счёт вверх и число вместо галочки. */
  countUp?: boolean;
  /** Долгое нажатие (только у активной кнопки «несколько раз в день»). */
  onLongPress?: () => void;
}

export function CheckButton({
  done,
  habitName,
  onToggle,
  disabled = false,
  frozen = false,
  bonus = false,
  total = 1,
  count = 0,
  countUp = false,
  onLongPress,
}: CheckButtonProps) {
  const strings = useStrings();
  const multi = total > 1;
  const up = multi && countUp;
  const made = Math.min(count, total);
  const longPress = useLongPress();
  const holdHandlers = disabled || !multi || !onLongPress ? {} : longPress.handlers(onLongPress);
  // Выполненный день — галочка без дуги: дуга обнуляется, а не докрашивается.
  const fraction = useAnimatedFraction(multi && !done ? made / total : 0);
  return (
    <button
      type="button"
      className={[
        styles.button,
        multi ? styles.multi : "",
        up ? styles.up : "",
        up && count >= WIDE_FROM ? styles.wide : "",
        done ? styles.done : "",
        disabled ? styles.disabled : "",
        bonus && !disabled ? styles.bonus : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={
        disabled
          ? undefined
          : () => {
              if (!longPress.consumeClick()) {
                onToggle();
              }
            }
      }
      {...holdHandlers}
      disabled={disabled}
      aria-pressed={done}
      aria-label={
        disabled
          ? done
            ? strings.checkDone(habitName)
            : frozen
              ? strings.checkFrozen(habitName)
              : strings.checkNotScheduled(habitName)
          : up
            ? strings.checkCountUp(habitName, count, total)
            : done
              ? strings.checkUnmark(habitName)
              : multi
                ? strings.checkCount(habitName, made, total)
                : strings.checkMark(habitName)
      }
    >
      {multi ? (
        <svg className={styles.progress} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
          {fraction > 0.001 ? (
            <circle
              className={styles.arc}
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              // От 12 часов по часовой стрелке.
              transform={`rotate(-90 ${CENTER} ${CENTER})`}
              strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
            />
          ) : null}
        </svg>
      ) : null}
      {/* Сколько раз осталось; у выполненного дня вместо числа — галочка, у «Сверх плана» —
          сколько сделано всего. */}
      {multi ? (
        <span className={styles.count} aria-hidden="true">
          {up && count >= total ? count : total - made}
        </span>
      ) : null}
      {/* Галочка появляется только в выполненном состоянии. */}
      <svg
        className={styles.check}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          // Чуть ниже центра viewBox (по вертикали 7.75–17.25) — так галочка выглядит
          // посередине кружка; линия жирнее прежних 3.
          d="M5 12.75l4.5 4.5L19 7.75"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
