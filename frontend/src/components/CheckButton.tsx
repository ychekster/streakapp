/** Круглая кнопка отметки выполнения за день отметки (пустой кружок ↔ заполненный с
 *  галочкой).
 *
 *  Привычка «несколько раз в день» (`total` > 1): пока день не выполнен, обводка бледная,
 *  а посередине — плюс цветом привычки. Каждое нажатие плавно закрашивает следующую долю обводки
 *  — дугой от 12 часов по часовой стрелке. Последнее нажатие сразу ставит галочку, как у
 *  обычной привычки; следующее обнуляет день.
 */

import { useEffect, useRef, useState } from "react";

import { useStrings } from "../preferences";
import styles from "./CheckButton.module.css";

/** Длительность закрашивания доли обводки (мс). */
const FILL_MS = 340;

/** Геометрия SVG поверх кнопки «несколько раз в день» (вся кнопка с обводкой, 30×30 —
 *  --check-size): дуга идёт по середине обводки толщиной 2⅔px (--check-stroke). */
const VIEW = 30;
const CENTER = VIEW / 2;
const RADIUS = (VIEW - 8 / 3) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Половина длины луча плюса (без скругления концов, px): плюс ≈10.7px, обводки не
 *  касается. */
const PLUS_ARM = 4.37;
/** Толщина линий плюса (px). */
const PLUS_STROKE = 1.92;
const PLUS_PATH = `M${CENTER} ${CENTER - PLUS_ARM}V${CENTER + PLUS_ARM}M${CENTER - PLUS_ARM} ${CENTER}H${CENTER + PLUS_ARM}`;

/** Быстрый старт и плавное торможение к концу дуги (ease-out cubic). */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Доля, плавно догоняющая `target` за FILL_MS, когда растёт; уменьшается сразу (и
 *  всегда сразу при reduced motion). */
function useAnimatedFraction(target: number): number {
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
  /** Сколько раз в день нужно выполнить привычку (больше 1 — кружок с плюсом). */
  total?: number;
  /** Сколько раз выполнена за день отметки. */
  count?: number;
}

export function CheckButton({
  done,
  habitName,
  onToggle,
  disabled = false,
  frozen = false,
  total = 1,
  count = 0,
}: CheckButtonProps) {
  const strings = useStrings();
  const multi = total > 1;
  // Выполненный день — галочка без дуги: дуга обнуляется, а не докрашивается.
  const fraction = useAnimatedFraction(multi && !done ? Math.min(count, total) / total : 0);
  return (
    <button
      type="button"
      className={[
        styles.button,
        multi ? styles.multi : "",
        done ? styles.done : "",
        disabled ? styles.disabled : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      aria-pressed={done}
      aria-label={
        disabled
          ? done
            ? strings.checkDone(habitName)
            : frozen
              ? strings.checkFrozen(habitName)
              : strings.checkNotScheduled(habitName)
          : done
            ? strings.checkUnmark(habitName)
            : multi
              ? strings.checkCount(habitName, Math.min(count, total), total)
              : strings.checkMark(habitName)
      }
    >
      {multi ? (
        <svg className={styles.progress} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
          <path className={styles.plus} d={PLUS_PATH} strokeWidth={PLUS_STROKE} />
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
