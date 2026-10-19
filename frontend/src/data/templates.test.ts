import { describe, expect, it } from "vitest";

import { DEFAULT_NAME_MAX_LENGTH, WEEKDAYS } from "../constants";
import { findTemplates, HABIT_TEMPLATES, templateInput } from "./templates";

describe("habit templates", () => {
  it("have unique keys and names that fit a habit name", () => {
    expect(new Set(HABIT_TEMPLATES.map((template) => template.key)).size).toBe(
      HABIT_TEMPLATES.length,
    );
    for (const language of ["ru", "en"] as const) {
      const names = HABIT_TEMPLATES.map((template) => template.name[language].toLowerCase());
      expect(new Set(names).size).toBe(names.length);
      for (const name of names) {
        expect(name.length).toBeLessThanOrEqual(DEFAULT_NAME_MAX_LENGTH);
      }
    }
    for (const template of HABIT_TEMPLATES) {
      if (template.frequency_type === "specific_days") {
        expect(template.days?.length).toBeGreaterThan(0);
        expect(template.days?.every((day) => (WEEKDAYS as readonly string[]).includes(day))).toBe(
          true,
        );
      }
    }
  });

  it("are found in either language, ignoring case and ё", () => {
    expect(findTemplates("ЧТЕН", "ru", []).map((t) => t.key)).toEqual(["read"]);
    expect(findTemplates("reading", "ru", []).map((t) => t.key)).toEqual(["read"]);
    expect(findTemplates("подъем", "ru", []).map((t) => t.key)).toEqual(["wake"]);
    expect(findTemplates("  ", "ru", [])).toHaveLength(HABIT_TEMPLATES.length);
  });

  it("hide those the user already has", () => {
    const keys = findTemplates("", "ru", ["  чтение ", "Workout"]).map((t) => t.key);
    expect(keys).not.toContain("read");
    // Another language's name is not a duplicate.
    expect(keys).toContain("workout");
  });

  it("fill the habit form", () => {
    const water = HABIT_TEMPLATES.find((template) => template.key === "water")!;
    expect(templateInput(water, "en")).toEqual({
      name: "Drink Water",
      color: "lightblue",
      frequency_type: "daily",
      days: [],
      times_per_day: 8,
    });
  });
});
