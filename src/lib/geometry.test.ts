import { describe, expect, it } from "vitest";
import { baseScale, mmToPixels, orientedSize, snapToCenter } from "./geometry";

describe("print geometry", () => {
  it("converts 15x21 cm at 300 DPI", () => {
    expect(mmToPixels(150, 300)).toBe(1772);
    expect(mmToPixels(210, 300)).toBe(2480);
  });
  it("orients the format", () => {
    expect(orientedSize({ widthMm: 150, heightMm: 210, orientation: "landscape" })).toEqual({ widthMm: 210, heightMm: 150 });
  });
  it("computes fill and fit", () => {
    expect(baseScale("fill", 400, 200, 100, 100)).toBe(0.5);
    expect(baseScale("fit", 400, 200, 100, 100)).toBe(0.25);
  });
  it("snaps an offset to the frame center within a pixel threshold", () => {
    expect(snapToCenter(0.009, 1000, 10)).toEqual({ offset: 0, snapped: true });
    expect(snapToCenter(-0.011, 1000, 10)).toEqual({ offset: -0.011, snapped: false });
  });
});
