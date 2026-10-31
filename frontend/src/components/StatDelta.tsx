/**
 * Изменение показателя к тем же дням прошлого месяца (экран статистики привычки): рядом
 * со значением «↑ 18%» — зелёным, «↓ 8%» — красным, без изменений — «→ 0%» цветом текста.
 * `rate` — доля в процентах: разница в процентных пунктах. Нечего сравнивать (`previous`
 * null или у счётчика 0 в прошлом месяце) — ничего.
 */

import { useStrings } from "../preferences";
import styles from "./StatDelta.module.css";

interface StatDeltaProps {
  current: number;
  previous: number | null;
  kind: "count" | "rate";
}

export function StatDelta({ current, previous, kind }: StatDeltaProps) {
  const strings = useStrings();
  if (previous === null || (kind === "count" && previous === 0)) {
    return null;
  }
  const diff = current - previous;
  const amount =
    kind === "rate"
      ? strings.statsPoints(Math.abs(Math.round(diff)))
      : `${Math.abs(Math.round((diff / previous) * 100))}%`;
  const arrow = diff > 0 ? "↑" : diff < 0 ? "↓" : "→";
  const tone = diff > 0 ? styles.good : diff < 0 ? styles.bad : "";
  return (
    <span className={`${styles.delta} ${tone}`} aria-label={strings.statsDeltaLabel(arrow, amount)}>
      {arrow} {amount}
    </span>
  );
}
