/** «Вид сетки»: how many dots of a fixed grid are taken by days. */

import { describe, expect, it } from "vitest";

import { HISTORY_DAYS } from "../constants";
import { daysBetween } from "../data/dates";
import { fixedGridFill, type GridView } from "./gridLayout";

const fixed = (day: string): GridView => ({ layout: "fixed", day });

/** A habit created on `created_on` with its history up to the marking day `day`, where
 *  only the days `marks` are done and the days `frozen` are frozen; the first of them
 *  comes from the server too, as in the API. */
const habit = (
  created_on: string | undefined,
  day: string,
  marks: string[] = [],
  frozen: string[] = [],
) => {
  const daysOf = (days: string[]) => {
    const flags = Array<boolean>(HISTORY_DAYS).fill(false);
    for (const at of days) {
      const index = HISTORY_DAYS - 1 - daysBetween(at, day);
      if (index >= 0) {
        flags[index] = true;
      }
    }
    return flags;
  };
  const started_on = [...marks, ...frozen].sort()[0] ?? null;
  return { created_on, started_on, history: daysOf(marks), frozen_history: daysOf(frozen) };
};

/** The fixed grid's fill on the marking day `day`. */
const fill = (day: string, created: string, marks: string[], cells = 184, page = 184) =>
  fixedGridFill(fixed(day), habit(created, day, marks), cells, page);

describe("fixedGridFill", () => {
  it("is null for the rolling grid and before the day is known", () => {
    const water = habit("2026-10-01", "2026-10-05", ["2026-10-01"]);
    expect(fixedGridFill({ layout: "rolling", day: "2026-10-05" }, water, 184)).toBeNull();
    expect(fixedGridFill({ layout: "fixed", day: null }, water, 184)).toBeNull();
    expect(fixedGridFill(fixed("2026-10-05"), { ...water, created_on: undefined }, 184)).toBeNull();
  });

  it("starts on the first mark, not on the creation day", () => {
    expect(fill("2026-10-18", "2026-10-15", ["2026-10-15"])).toBe(4);
    // Created on the 15th, first marked on the 17th: the 17th is the first dot.
    expect(fill("2026-10-18", "2026-10-15", ["2026-10-17", "2026-10-18"])).toBe(2);
    // Marked for yesterday (the 14th) on the creation day: the 14th is the first dot.
    expect(fill("2026-10-17", "2026-10-15", ["2026-10-14"])).toBe(4);
  });

  it("counts a partly done day as a mark", () => {
    const counts = Array<number>(HISTORY_DAYS).fill(0);
    counts[HISTORY_DAYS - 3] = 1;
    const partial = { ...habit("2026-10-15", "2026-10-17"), history_counts: counts };
    expect(fixedGridFill(fixed("2026-10-17"), partial, 184)).toBe(3);
  });

  it("is just the marking day before the first mark", () => {
    expect(fill("2026-10-15", "2026-10-15", [])).toBe(1);
    expect(fill("2026-10-20", "2026-10-15", [])).toBe(1);
    // «Mark as yesterday» on the creation day: yesterday.
    expect(fill("2026-10-14", "2026-10-15", [])).toBe(1);
  });

  it("ends on the marking day: «mark as yesterday» takes one dot off the end", () => {
    // First marked on the 15th, today the 18th: four dots; marking yesterday — three.
    expect(fill("2026-10-18", "2026-10-15", ["2026-10-15"])).toBe(4);
    expect(fill("2026-10-17", "2026-10-15", ["2026-10-15"])).toBe(3);
  });

  it("starts over once the list grid is full", () => {
    const first = ["2026-10-01"];
    // Day 184 fills the grid, day 185 is the first dot of a new one.
    expect(fill("2027-04-02", "2026-10-01", first)).toBe(184);
    expect(fill("2027-04-03", "2026-10-01", first)).toBe(1);
  });

  it("keeps the last half-year on top of the year grid", () => {
    const year = (day: string) => fill(day, "2026-10-01", ["2026-10-01"], 364, 184);
    // The first half-year fills the year grid from the top: day 184 — dot 184.
    expect(year("2026-10-01")).toBe(1);
    expect(year("2027-04-02")).toBe(184);
    // Day 185: the list starts over; on the year grid the past half-year is the top half
    // (its last 182 days) and the new one starts at the bottom half.
    expect(year("2027-04-03")).toBe(183);
    // The new half-year's day 182 is the last dot; its last two days shift the grid.
    expect(year("2027-10-01")).toBe(364);
    expect(year("2027-10-03")).toBe(364);
  });

  it("keeps its start once the first mark leaves the history", () => {
    // Created on Oct 1, first marked on Oct 10: the start stays on Oct 10 a year later.
    const marks = ["2026-10-10", "2027-10-01"];
    const before = fill("2027-10-07", "2026-10-01", marks) ?? 0;
    expect(fill("2027-10-08", "2026-10-01", marks)).toBe(before + 1);
    expect(fill("2027-10-12", "2026-10-01", marks)).toBe(before + 5);
    expect(fill("2027-10-12", "2026-10-01", marks)).toBe(
      (daysBetween("2026-10-10", "2027-10-12") % 184) + 1,
    );
  });

  it("counts a frozen day as a marked one", () => {
    // Created on the 1st, frozen on the 3rd–5th, first marked on the 7th: starts on the 3rd.
    const frozen = ["2026-10-03", "2026-10-04", "2026-10-05"];
    expect(fixedGridFill(fixed("2026-10-07"), habit("2026-10-01", "2026-10-07", ["2026-10-07"], frozen), 184)).toBe(5);
    // Frozen right after creation and never marked: every frozen day is a dot.
    expect(fixedGridFill(fixed("2026-10-05"), habit("2026-10-01", "2026-10-05", [], frozen), 184)).toBe(3);
    // A freeze older than the history still holds the start.
    const old = habit("2026-10-01", "2027-10-12", ["2027-10-01"], ["2026-10-03"]);
    expect(fixedGridFill(fixed("2027-10-12"), old, 184)).toBe((daysBetween("2026-10-03", "2027-10-12") % 184) + 1);
  });

  it("is the marking day for an old habit that was never marked", () => {
    expect(fill("2027-10-04", "2026-10-01", [])).toBe(1);
  });

  it("goes from the creation day for an old habit saved before the first mark was sent", () => {
    // Day 369 of a habit kept on the device without `started_on`.
    const old = { ...habit("2026-10-01", "2027-10-04", ["2027-10-01"]), started_on: undefined };
    expect(fixedGridFill(fixed("2027-10-04"), old, 364, 184)).toBe(183);
  });
});
