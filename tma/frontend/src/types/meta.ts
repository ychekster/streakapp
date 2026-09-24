/** Справочные данные: лимит названия привычки и каталог часовых поясов. */

export interface Meta {
  name_max_length: number;
}

/** Часовой пояс для выбора — город и его зона (GET /meta/timezones: каталог или
 *  результаты поиска); названия — на языке интерфейса. */
export interface TimezoneEntry {
  /** Зона IANA, напр. «Europe/Moscow». */
  zone: string;
  /** Город в справочнике городов; null — у зон, для которых города в нём нет. */
  city_id: number | null;
  city: string;
  /** Регион — только если в стране есть другой город с тем же названием. */
  region: string | null;
  country: string;
  /** Текущее смещение, напр. «UTC+3». */
  offset: string;
}
