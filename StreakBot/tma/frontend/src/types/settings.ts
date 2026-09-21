/** Типы настроек пользователя — зеркалят схемы API (tma/backend/schemas.py). */

import type { LANGUAGES, THEMES } from "../constants";

/** Язык интерфейса. */
export type Language = (typeof LANGUAGES)[number];

/** Выбранная тема оформления; "system" — адаптивная, как в системе. */
export type ThemePreference = (typeof THEMES)[number];

/** Тема, которая сейчас на экране (адаптивная уже разрешена по системе). */
export type ResolvedTheme = "light" | "dark";

export interface Settings {
  /** Часовой пояс (IANA) или null. */
  timezone: string | null;
  /** Пояс на языке интерфейса: город («Москва») или смещение («UTC+3»). */
  timezone_display: string | null;
  /** Смещение пояса, напр. «UTC+3». */
  timezone_offset: string | null;
  language: Language;
  theme: ThemePreference;
  /** «Отмечать за вчера»: отметки ставятся за вчерашний день. */
  mark_yesterday: boolean;
}

/** Частичное обновление настроек (передаются только меняемые поля). */
export interface SettingsUpdate {
  timezone?: string;
  language?: Language;
  theme?: ThemePreference;
  mark_yesterday?: boolean;
}
