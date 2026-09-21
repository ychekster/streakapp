/** Справочные данные для форм (дни недели, лимит названия, часовые пояса). */

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
  name_max_length: number;
  timezone_offsets: TimezoneOption[];
}
