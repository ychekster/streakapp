/** «Вид сетки»: how many dots of a fixed grid are taken by days. */

import { describe, expect, it } from "vitest";

import { fixedGridFill, type GridView } from "./gridLayout";

const fixed = (calendarDay: string): GridView => ({ layout: "fixed", calendarDay });

describe("fixedGridFill", () => {
  it("is null for the rolling grid and before the day is known", () => {
    expect(fixedGridFill({ layout: "rolling", calendarDay: "2026-10-05" }, "2026-10-01", 184)).toBeNull();
    expect(fixedGridFill({ layout: "fixed", calendarDay: null }, "2026-10-01", 184)).toBeNull();
    expect(fixedGridFill(fixed("2026-10-05"), undefined, 184)).toBeNull();
  });

  it("fills from the creation day and starts over once full", () => {
    expect(fixedGridFill(fixed("2026-10-01"), "2026-10-01", 184)).toBe(1);
    expect(fixedGridFill(fixed("2026-10-03"), "2026-10-01", 184)).toBe(3);
    // Day 184 fills the grid, day 185 is the first dot of a new one.
    expect(fixedGridFill(fixed("2027-04-02"), "2026-10-01", 184)).toBe(184);
    expect(fixedGridFill(fixed("2027-04-03"), "2026-10-01", 184)).toBe(1);
  });

  it("keeps the last half-year on top of the year grid", () => {
    const start = "2026-10-01";
    const year = (day: string) => fixedGridFill(fixed(day), start, 364, 184);
    // The first half-year fills the year grid from the top: day 184 — dot 184.
    expect(year("2026-10-01")).toBe(1);
    expect(year("2027-04-02")).toBe(184);
    // Day 185: the list starts over; on the year grid the past half-year is the top half
    // (its last 182 days) and the new one starts at the bottom half.
    expect(year("2027-04-03")).toBe(183);
    expect(fixedGridFill(fixed("2027-04-03"), start, 184)).toBe(1);
    // The new half-year's day 182 is the last dot; its last two days shift the grid.
    expect(year("2027-10-01")).toBe(364);
    expect(year("2027-10-03")).toBe(364);
    // The next half-year: the same again.
    expect(year("2027-10-04")).toBe(183);
  });

  it("never goes before the first dot", () => {
    // Created «tomorrow» after the time zone moved west.
    expect(fixedGridFill(fixed("2026-10-01"), "2026-10-02", 184)).toBe(1);
  });
});
