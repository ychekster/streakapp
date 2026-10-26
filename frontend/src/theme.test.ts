import { describe, expect, it } from "vitest";

import { contrast, readableRgb } from "./theme";

const WHITE: [number, number, number] = [255, 255, 255];
const DARK_CARD: [number, number, number] = [28, 28, 30];

describe("readableRgb", () => {
  it("darkens white in the light theme until it shows on the card", () => {
    const shown = readableRgb(WHITE, "light");
    expect(contrast(shown, WHITE)).toBeGreaterThanOrEqual(2.2);
    expect(contrast(shown, WHITE)).toBeLessThan(2.3);
    expect(shown[0]).toBe(shown[2]);
  });

  it("lightens black in the dark theme", () => {
    const shown = readableRgb([0, 0, 0], "dark");
    expect(contrast(shown, DARK_CARD)).toBeGreaterThanOrEqual(3);
  });

  it("keeps a color that already reads", () => {
    expect(readableRgb([0, 122, 255], "light")).toEqual([0, 122, 255]);
    expect(readableRgb(WHITE, "dark")).toEqual(WHITE);
  });

  it("keeps the hue of a pale color", () => {
    const [r, g, b] = readableRgb([255, 255, 160], "light");
    expect(r).toBe(g);
    expect(b).toBeLessThan(r);
  });
});
