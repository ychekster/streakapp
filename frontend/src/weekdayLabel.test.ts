import { describe, expect, it } from "vitest";

import { STRINGS } from "./strings";
import { weekdayLabel } from "./weekdayLabel";

const ru = STRINGS.ru;
const en = STRINGS.en;

describe("weekdayLabel", () => {
  it("names day sets as the habit form and the habit screen show them", () => {
    const all = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    expect(weekdayLabel(all, ru, "Каждый день")).toBe("Каждый день");
    expect(weekdayLabel(["fri", "mon", "tue", "wed", "thu"], ru, "")).toBe("Будние дни");
    expect(weekdayLabel(["sun", "sat"], ru, "")).toBe("Выходные");
    expect(weekdayLabel(["fri", "wed", "mon"], ru, "")).toBe("Пн, Ср и Пт");
    expect(weekdayLabel(["sat", "mon"], ru, "")).toBe("Пн и Сб");
    expect(weekdayLabel(["thu"], ru, "")).toBe("Чт");
    expect(weekdayLabel([], ru, "")).toBe("Никогда");
    expect(weekdayLabel(["mon", "wed", "fri"], en, "")).toBe("Mon, Wed and Fri");
  });
});
