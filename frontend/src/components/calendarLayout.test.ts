/** «Вид сетки» calendar: where every date stands in the month-by-weekday grid. */

import { describe, expect, it } from "vitest";

import { addMonths } from "./calendarDays";
import { CELL, PITCH, ROW_HEIGHT, ROW_WIDTH, calendarRows, monthWeeks } from "./calendarLayout";

describe("monthWeeks", () => {
  it("counts the Monday-first weeks a month spans", () => {
    expect(monthWeeks("2027-02")).toBe(4); // Feb 2027 starts on a Monday, 28 days
    expect(monthWeeks("2026-10")).toBe(5); // starts on a Thursday
    expect(monthWeeks("2026-08")).toBe(6); // starts on a Saturday, 31 days
  });
});

describe("calendarRows", () => {
  it("ends with the marking day's month, four months a row, older rows on top", () => {
    const rows = calendarRows("2026-10-27", 2);
    expect(rows.map((row) => row.months.map(({ month }) => month))).toEqual([
      ["2026-03", "2026-04", "2026-05", "2026-06"],
      ["2026-07", "2026-08", "2026-09", "2026-10"],
    ]);
  });

  it("puts every date of the months once, on its weekday row", () => {
    const [row] = calendarRows("2026-10-27", 1);
    expect(row!.cells).toHaveLength(31 + 31 + 30 + 31);
    const oct1 = row!.cells.find(({ date }) => date === "2026-10-01")!;
    expect(oct1.y).toBe(3 * PITCH); // Thursday
    const oct5 = row!.cells.find(({ date }) => date === "2026-10-05")!;
    expect(oct5).toMatchObject({ x: oct1.x + PITCH, y: 0 }); // the next week's Monday
  });

  it("keeps the row width: months spread to the full width, never past it", () => {
    let month = "2024-01";
    for (let at = 0; at < 48; at += 1) {
      const [row] = calendarRows(`${month}-15`, 1);
      const right = Math.max(...row!.cells.map(({ x }) => x)) + CELL;
      expect(right).toBeCloseTo(ROW_WIDTH);
      expect(Math.max(...row!.cells.map(({ y }) => y)) + CELL).toBe(ROW_HEIGHT);
      expect(row!.months[0]!.x).toBe(0);
      month = addMonths(month, 1);
    }
  });
});
