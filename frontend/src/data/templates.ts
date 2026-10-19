/**
 * Habit templates on the «Добавить привычку» screen (NewHabitScreen): the habits people
 * add most often, in that order (picked from the production database, 2026-10-19). A tap
 * opens the habit form filled with the template — the user can still change everything.
 *
 * Templates live only here: the server knows nothing about them, a habit made from one is
 * an ordinary habit.
 */

import type { FrequencyType, HabitColor, HabitInput } from "../types/habit";
import type { Language } from "../types/settings";

export interface HabitTemplate {
  key: string;
  name: Record<Language, string>;
  color: HabitColor;
  frequency_type: Extract<FrequencyType, "daily" | "specific_days">;
  /** Weekday codes for `specific_days`, in week order. */
  days?: string[];
  times_per_day?: number;
}

export const HABIT_TEMPLATES: readonly HabitTemplate[] = [
  { key: "read", name: { ru: "Чтение", en: "Reading" }, color: "blue", frequency_type: "daily" },
  { key: "workout", name: { ru: "Тренировка", en: "Workout" }, color: "green", frequency_type: "specific_days", days: ["mon", "wed", "fri"] },
  { key: "stretch", name: { ru: "Зарядка", en: "Morning Exercise" }, color: "orange", frequency_type: "daily" },
  { key: "water", name: { ru: "Пить воду", en: "Drink Water" }, color: "lightblue", frequency_type: "daily", times_per_day: 8 },
  { key: "walk", name: { ru: "Прогулка", en: "Walk" }, color: "green", frequency_type: "daily" },
  { key: "english", name: { ru: "Английский", en: "English" }, color: "pink", frequency_type: "daily" },
  { key: "vitamins", name: { ru: "Витамины", en: "Vitamins" }, color: "yellow", frequency_type: "daily" },
  { key: "food", name: { ru: "Правильное питание", en: "Healthy Eating" }, color: "teal", frequency_type: "daily" },
  { key: "cleaning", name: { ru: "Уборка", en: "Tidy Up" }, color: "brown", frequency_type: "daily" },
  { key: "sleep", name: { ru: "Сон 8 часов", en: "Sleep 8 Hours" }, color: "indigo", frequency_type: "daily" },
  { key: "study", name: { ru: "Учёба", en: "Study" }, color: "teal", frequency_type: "specific_days", days: ["mon", "tue", "wed", "thu", "fri"] },
  { key: "sugar", name: { ru: "Без сладкого", en: "No Sweets" }, color: "pink", frequency_type: "daily" },
  { key: "teeth", name: { ru: "Чистить зубы", en: "Brush Teeth" }, color: "lightblue", frequency_type: "daily", times_per_day: 2 },
  { key: "journal", name: { ru: "Дневник", en: "Journal" }, color: "purple", frequency_type: "daily" },
  { key: "run", name: { ru: "Бег", en: "Running" }, color: "orange", frequency_type: "specific_days", days: ["tue", "thu", "sat"] },
  { key: "smoking", name: { ru: "Без курения", en: "No Smoking" }, color: "graphite", frequency_type: "daily" },
  { key: "skincare", name: { ru: "Уход за кожей", en: "Skincare" }, color: "pink", frequency_type: "daily", times_per_day: 2 },
  { key: "wake", name: { ru: "Ранний подъём", en: "Wake Up Early" }, color: "yellow", frequency_type: "daily" },
  { key: "alcohol", name: { ru: "Без алкоголя", en: "No Alcohol" }, color: "red", frequency_type: "daily" },
  { key: "meditation", name: { ru: "Медитация", en: "Meditation" }, color: "purple", frequency_type: "daily" },
  { key: "screen", name: { ru: "Утро без телефона", en: "Phone-Free Morning" }, color: "green", frequency_type: "daily" },
  { key: "shower", name: { ru: "Контрастный душ", en: "Cold Shower" }, color: "lightblue", frequency_type: "daily" },
  { key: "face_massage", name: { ru: "Массаж лица", en: "Face Massage" }, color: "pink", frequency_type: "daily" },
  { key: "draw", name: { ru: "Рисование", en: "Drawing" }, color: "orange", frequency_type: "daily" },
  { key: "money", name: { ru: "Учёт финансов", en: "Track Expenses" }, color: "green", frequency_type: "daily" },
  { key: "planning", name: { ru: "План на завтра", en: "Plan Tomorrow" }, color: "indigo", frequency_type: "daily" },
  { key: "swimming", name: { ru: "Бассейн", en: "Swimming" }, color: "blue", frequency_type: "specific_days", days: ["mon", "wed", "fri"] },
  { key: "posture", name: { ru: "Осанка", en: "Posture" }, color: "teal", frequency_type: "daily" },
  { key: "plants", name: { ru: "Полить цветы", en: "Water the Plants" }, color: "green", frequency_type: "specific_days", days: ["wed", "sun"] },
  { key: "writing", name: { ru: "Писательство", en: "Writing" }, color: "graphite", frequency_type: "daily" },
];

/** Lower case, «ё» as «е», no extra spaces — how names and the search are compared. */
function simplify(text: string): string {
  return text.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}

/**
 * Templates to show: those whose name (in either language) contains the search, minus
 * those the user already has a habit with that name (creating it would fail as a duplicate).
 */
export function findTemplates(
  query: string,
  language: Language,
  habitNames: readonly string[],
): HabitTemplate[] {
  const needle = simplify(query);
  const taken = new Set(habitNames.map(simplify));
  return HABIT_TEMPLATES.filter(
    (template) =>
      !taken.has(simplify(template.name[language])) &&
      (!needle ||
        Object.values(template.name).some((name) => simplify(name).includes(needle))),
  );
}

/** The habit form's starting values for a template. */
export function templateInput(template: HabitTemplate, language: Language): Partial<HabitInput> {
  return {
    name: template.name[language],
    color: template.color,
    frequency_type: template.frequency_type,
    days: template.days ?? [],
    times_per_day: template.times_per_day ?? 1,
  };
}
