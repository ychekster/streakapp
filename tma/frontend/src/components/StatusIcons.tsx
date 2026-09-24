/**
 * Значки состояний экрана (пусто, ошибка, «отправлено», «ничего не найдено») — вместо
 * эмодзи, которые рисуются шрифтом системы и выглядят на каждом клиенте по-своему.
 *
 * Все значки устроены одинаково: сплошной круг цветом приглушённого текста, в котором
 * маской прорезан глиф. Сквозь прорезь виден фон экрана, поэтому значок одинаково
 * выглядит в светлой и тёмной теме и не требует второго цвета. Пропорции круга и
 * галочки — как у иконки вкладки «Привычки» (TabIcons), только крупнее.
 *
 * Значок загрузки — не круг, а вращающееся кольцо (как спиннер подгрузки списка):
 * состояние временное, и статичный круг читался бы как результат.
 */

import styles from "./StatusMessage.module.css";

export type StatusIconName = "check" | "alert" | "star" | "send" | "spinner";

/*
 * Глифы нарисованы в квадрате 40×40, круг — вписанная окружность (центр 20, радиус 20).
 * Линейные глифы задаются обводкой, сплошные — заливкой; поле `stroke` — её толщина.
 */
interface Glyph {
  d: string;
  stroke?: number;
  fill?: boolean;
}

const GLYPHS: Record<Exclude<StatusIconName, "spinner">, Glyph[]> = {
  // Галочка: пропорции галочки вкладки «Привычки», увеличенные с её круга (r 11.65) до
  // здешнего (r 20).
  check: [{ d: "M12.8 21L18.28 26.7L27.55 14.15", stroke: 3.95 }],
  // Восклицательный знак: штрих и точка под ним.
  alert: [
    { d: "M20 10.6V23", stroke: 4.2 },
    { d: "M20 27.1a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5", fill: true },
  ],
  // Пятиконечная звезда; лучи чуть скруглены обводкой по контуру.
  star: [
    {
      d: "M20 9.25L22.88 16.79L30.94 17.2L24.66 22.26L26.76 30.05L20 25.65L13.24 30.05L15.34 22.26L9.06 17.2L17.12 16.79Z",
      fill: true,
      stroke: 1.3,
    },
  ],
  // Бумажный самолётик: нос справа сверху, два хвоста слева и снизу.
  send: [
    {
      d: "M30.9 10.1L9.4 19c-.62.26-.6 1.15.03 1.38l8.17 1.52l1.52 8.17c.23.63 1.12.65 1.38.03Z",
      fill: true,
      stroke: 1.2,
    },
  ],
};

interface StatusIconProps {
  name: StatusIconName;
}

export function StatusIcon({ name }: StatusIconProps) {
  if (name === "spinner") {
    return <span className={styles.spinner} aria-hidden="true" />;
  }
  // На экране одновременно не больше одного состояния, а маски с одним именем совпадают,
  // поэтому id по имени значка уникален.
  const maskId = `status-icon-${name}`;
  return (
    <svg className={styles.icon} viewBox="0 0 40 40" aria-hidden="true">
      <mask id={maskId}>
        {/* Белое — остаётся, чёрное — вырезано: глиф прорезает круг насквозь. */}
        <rect width="40" height="40" fill="#fff" />
        {GLYPHS[name].map((glyph) => (
          <path
            key={glyph.d}
            d={glyph.d}
            fill={glyph.fill ? "#000" : "none"}
            stroke={glyph.stroke ? "#000" : "none"}
            strokeWidth={glyph.stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </mask>
      <circle cx="20" cy="20" r="20" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );
}
