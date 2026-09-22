/**
 * Иконки вкладок нижней навигации (26×26, цветом текста навигации). Как у таб-бара iOS,
 * у иконки активной вкладки — залитый вариант (`filled`); шестерёнка «Настроек» одна.
 */

import styles from "./TabBar.module.css";

// id маски выреза галочки; навигация на экране одна, поэтому id уникален.
const CHECK_CUTOUT_ID = "tabbar-check-cutout";
const CHECK_PATH = "M8.8 13.6L12 16.9l5.4-7.3";

interface TabIconProps {
  filled: boolean;
}

/** «Привычки»: галочка в круге; на активной вкладке — залитый круг с прорезанной галочкой. */
export function HabitsIcon({ filled }: TabIconProps) {
  if (filled) {
    return (
      <svg className={styles.icon} viewBox="0 0 26 26" aria-hidden="true">
        <mask id={CHECK_CUTOUT_ID}>
          <rect width="26" height="26" fill="#fff" />
          <path
            d={CHECK_PATH}
            fill="none"
            stroke="#000"
            strokeWidth="2.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
        <circle cx="13" cy="13" r="11.65" fill="currentColor" mask={`url(#${CHECK_CUTOUT_ID})`} />
      </svg>
    );
  }
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="10.8" stroke="currentColor" strokeWidth="1.7" />
      <path
        d={CHECK_PATH}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Зуб шестерёнки (смотрит вверх): сужается к скруглённой вершине, у основания — плавный
// переход в кольцо. 24 копии через каждые 15°.
const GEAR_TOOTH =
  "M11.75 2.4V1.98Q12.24 1.98 12.26 1.5L12.45 0.6A0.55 0.55 0 0 1 13.55 0.6L13.74 1.5Q13.76 1.98 14.25 1.98V2.4Z";
const GEAR_TOOTH_ANGLES = Array.from({ length: 24 }, (_, i) => i * 15);

/** «Настройки»: шестерёнка как у «Настроек» iOS — зубчатое кольцо и три спицы к втулке. */
export function SettingsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" stroke="currentColor" aria-hidden="true">
      <g fill="currentColor" stroke="none">
        {GEAR_TOOTH_ANGLES.map((angle) => (
          <path key={angle} d={GEAR_TOOTH} transform={`rotate(${angle} 13 13)`} />
        ))}
      </g>
      <circle cx="13" cy="13" r="10.15" strokeWidth="1.9" />
      <path d="M14.05 13H22.6M12.48 13.91L8.2 21.31M12.48 12.09L8.2 4.69" strokeWidth="1.55" />
      <circle cx="13" cy="13" r="1.05" strokeWidth="0.9" />
    </svg>
  );
}

/** Кнопка «+» (новая привычка). */
export function PlusIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <path d="M13 6.5v13M6.5 13h13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// Столбики «Аналитики»: x, верх; низ у всех — на одной базовой линии.
const ANALYTICS_BARS = [
  { x: 4.2, top: 13.5 },
  { x: 10.9, top: 8.5 },
  { x: 17.6, top: 3.8 },
] as const;
const ANALYTICS_BAR_WIDTH = 4.2;
const ANALYTICS_BASELINE = 22.2;

/** «Аналитика»: три столбика по возрастанию. */
export function AnalyticsIcon({ filled }: TabIconProps) {
  return (
    <svg className={styles.icon} viewBox="0 0 26 26" aria-hidden="true">
      {ANALYTICS_BARS.map((bar) => (
        <rect
          key={bar.x}
          x={bar.x}
          y={bar.top}
          width={ANALYTICS_BAR_WIDTH}
          height={ANALYTICS_BASELINE - bar.top}
          rx="1.3"
          fill={filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** «Люди»: два силуэта — ближний слева, дальний справа за ним. */
export function PeopleIcon({ filled }: TabIconProps) {
  const fill = filled ? "currentColor" : "none";
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 26 26"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18.2" cy="8.3" r="3.1" fill={fill} />
      <path d="M16.9 14.2c.44-.07.87-.1 1.3-.1 3.1 0 5.4 2.1 5.4 5.3 0 .6-.4 1-1 1h-3.3" fill="none" />
      <circle cx="9.6" cy="9" r="3.9" fill={fill} />
      <path
        d="M2.6 20.4c0-3.8 3.1-6.4 7-6.4s7 2.6 7 6.4c0 .7-.5 1.1-1.2 1.1H3.8c-.7 0-1.2-.4-1.2-1.1z"
        fill={fill}
      />
    </svg>
  );
}

/** «Рассылка»: рупор со звуковой волной. */
export function BroadcastIcon({ filled }: TabIconProps) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M3.4 11.1v3.8c0 .9.7 1.6 1.6 1.6h2.8l9 4.6c.6.3 1.3-.1 1.3-.8V5.7c0-.7-.7-1.1-1.3-.8l-9 4.6H5c-.9 0-1.6.7-1.6 1.6z"
        fill={filled ? "currentColor" : "none"}
      />
      <path d="M7.9 16.6l1.4 4.6c.2.6.8 1 1.4.9l.6-.1c.7-.1 1.1-.8.9-1.5l-1-3.3" />
      <path d="M21.2 10.2a4 4 0 0 1 0 5.6" />
    </svg>
  );
}
