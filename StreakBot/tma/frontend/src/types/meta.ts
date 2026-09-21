/** Справочные данные: лимит названия привычки и каталог часовых поясов. */

export interface Meta {
  name_max_length: number;
}

/** Часовой пояс в каталоге (GET /meta/timezones); названия — на языке интерфейса. */
export interface TimezoneEntry {
  /** Зона IANA, напр. «Europe/Moscow». */
  id: string;
  city: string;
  country: string;
  /** Текущее смещение, напр. «UTC+3». */
  offset: string;
}
