/** Типы настроек пользователя — зеркалят схемы API (tma/backend/schemas.py). */

export interface Settings {
  /** Часовой пояс (IANA) или null. */
  timezone: string | null;
  /** Человекочитаемый пояс, напр. «Москва (UTC+3)». */
  timezone_display: string | null;
  /** Смещение пояса, напр. «UTC+3». */
  timezone_offset: string | null;
}

/** Частичное обновление настроек (передаются только меняемые поля). */
export interface SettingsUpdate {
  timezone?: string;
}
