/** Кнопка привычки «Цель по времени» вместо кнопки отметки (CheckButton): тот же кружок
 *  30px с бледной обводкой и дугой прогресса, но посередине ▶ — запустить таймер, а пока
 *  он идёт — ❚❚ (остановить); обводка остаётся бледной, дуга растёт каждую секунду и
 *  плавно (как у «несколько раз в день», в том числе при правке в окне времени). Набрана
 *  цель — кружок залит, посередине галочка; с «Сверх плана» — ▶ на заливке (таймер идёт
 *  дальше цели, тогда ❚❚).
 *
 *  Время идущего таймера читается из стора раз в секунду (hooks/useTimer.ts): сама
 *  привычка в списке при этом не меняется — блок со всей сеткой не перерисовывается.
 */

import { useAppData } from "../hooks/useAppData";
import { useLongPress } from "../hooks/useLongPress";
import { useRunningTimer } from "../hooks/useTimer";
import { useStrings } from "../preferences";
import type { Habit } from "../types/habit";
import { useAnimatedFraction } from "./CheckButton";
import { duration } from "./timerFormat";
import checkStyles from "./CheckButton.module.css";
import styles from "./TimerButton.module.css";

/** Геометрия дуги — как у CheckButton (30×30, по середине обводки 2⅔px). */
const VIEW = 30;
const CENTER = VIEW / 2;
const RADIUS = (VIEW - 8 / 3) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface TimerButtonProps {
  habit: Habit;
  onToggle: () => void;
  disabled?: boolean;
  /** Не запланирована на день отметки: бледная, как у CheckButton. */
  bonus?: boolean;
  onLongPress?: () => void;
}

export function TimerButton({
  habit,
  onToggle,
  disabled = false,
  bonus = false,
  onLongPress,
}: TimerButtonProps) {
  const strings = useStrings();
  const running = useRunningTimer();
  const { today } = useAppData();
  // Таймер другого дня (идёт с прошлого дня отметки) — не сегодняшнее время.
  const mine =
    running !== null && running.timer.habitId === habit.id && running.timer.date === today;
  const seconds = mine ? running.seconds : habit.today_count;
  const goal = habit.times_per_day;
  const done = habit.done_today || seconds >= goal;
  const longPress = useLongPress();
  const holdHandlers = disabled || !onLongPress ? {} : longPress.handlers(onLongPress);
  const fraction = useAnimatedFraction(done ? 0 : Math.min(seconds / goal, 1));
  return (
    <button
      type="button"
      className={[
        checkStyles.button,
        checkStyles.multi,
        styles.timer,
        done ? `${checkStyles.done} ${styles.filled}` : "",
        disabled ? checkStyles.disabled : "",
        bonus && !disabled ? checkStyles.bonus : "",
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
      aria-pressed={mine}
      aria-label={
        mine
          ? strings.checkTimerStop(habit.name, duration(seconds, strings))
          : strings.checkTimerStart(habit.name, duration(seconds, strings), duration(goal, strings))
      }
    >
      <svg className={checkStyles.progress} viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden="true">
        {fraction > 0.001 ? (
          <circle
            className={checkStyles.arc}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            strokeDasharray={`${fraction * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          />
        ) : null}
      </svg>
      {mine ? (
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6.5" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" />
          <rect x="13.9" y="5.5" width="3.6" height="13" rx="1.2" fill="currentColor" />
        </svg>
      ) : done && !habit.overtime ? (
        <svg className={checkStyles.check} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.75l4.5 4.5L19 7.75"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Треугольник на волосок правее центра — так он выглядит посередине кружка.
        <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7.2 5.6v12.8a1 1 0 0 0 1.5.86l10.2-6.4a1 1 0 0 0 0-1.72L8.7 4.74a1 1 0 0 0-1.5.86z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
