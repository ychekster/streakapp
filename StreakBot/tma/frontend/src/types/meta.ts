/** Справочные данные для форм (дни недели, диапазоны, часовые пояса). */

export interface Weekday {
  code: string;
  short: string;
  full: string;
}

export interface TimezoneOption {
  value: string;
  label: string;
}

export interface Meta {
  weekdays: Weekday[];
  /** Допустимый диапазон утреннего времени, часы [от, до]. */
  morning_range: [number, number];
  /** Допустимый диапазон вечернего времени, часы [от, до]. */
  evening_range: [number, number];
  name_max_length: number;
  timezone_offsets: TimezoneOption[];
}
