import { describe, expect, it } from "vitest";
import { ATTACH_Y, blockWidth, FIT_LANDSCAPE, FIT_PORTRAIT, fitScale, HERO_FOV_DEG, heroFit, layoutName, layoutWord, LETTER_GAP, quantiseAspect, RAIL_Y, ROW_Y } from "./layout-fallback";

const advance = () => 0.6;
const ROWS: readonly [string, string] = ["KSHITIJ", "BHARDWAJ"];

describe("layoutName (fallback)", () => {
  it("hangs fifteen letters in two rows at the spec heights, centred at x 0", () => {
    const slots = layoutName(ROWS, 1.6, advance);
    expect(slots).toHaveLength(15);
    expect(new Set(slots.map((s) => s.id)).size).toBe(15);
    const row0 = slots.filter((s) => s.row === 0);
    const row1 = slots.filter((s) => s.row === 1);
    expect(row0).toHaveLength(7);
    expect(row1).toHaveLength(8);
    expect(row0.every((s) => s.y === ROW_Y[0])).toBe(true);
    expect(row1.every((s) => s.y === ROW_Y[1])).toBe(true);
    expect(row0.reduce((a, s) => a + s.x, 0)).toBeCloseTo(0);
    expect(row1.reduce((a, s) => a + s.x, 0)).toBeCloseTo(0);
  });
  it("anchors every letter on the rail above itself with a positive rope", () => {
    for (const s of layoutName(ROWS, 1.6, advance)) {
      expect(s.anchor[0]).toBe(s.x);
      expect(s.anchor[1]).toBe(RAIL_Y);
      expect(s.anchor[2]).toBe(s.z);
      expect(s.ropeLength).toBeCloseTo(RAIL_Y - (s.y + ATTACH_Y));
      expect(s.ropeLength).toBeGreaterThan(1);
    }
  });
  it("advances by the glyph advance plus the gap", () => {
    const row0 = layoutName(ROWS, 1.6, advance).filter((s) => s.row === 0);
    expect(row0[1].x - row0[0].x).toBeCloseTo(0.6 + LETTER_GAP);
    expect(blockWidth(row0, 1, advance)).toBeCloseTo(7 * 0.6 + 6 * LETTER_GAP);
  });
  it("shrinks the rows in portrait about the block centre", () => {
    const s = fitScale(0.46);
    expect(s).toBeLessThan(1);
    expect(s).toBeCloseTo((FIT_PORTRAIT / FIT_LANDSCAPE) * (0.46 / 1.6));
    const portrait = layoutName(ROWS, 0.46, advance);
    const landscape = layoutName(ROWS, 1.6, advance);
    expect(blockWidth(portrait, s, advance)).toBeCloseTo(blockWidth(landscape, 1, advance) * s);
    expect(portrait[0].y).toBeLessThan(landscape[0].y);
    expect(portrait[7].y).toBeGreaterThan(landscape[7].y);
  });
  it("fitScale is 1 on landscape and bounded on extreme portrait", () => {
    expect(fitScale(1.6)).toBe(1);
    expect(fitScale(2.4)).toBe(1);
    expect(fitScale(0.1)).toBeGreaterThanOrEqual(0.22);
  });
});

describe("layoutWord", () => {
  it("centres a word at its origin", () => {
    const word = layoutWord("Y", [2.6, 2.3, -24], 1.5, advance);
    expect(word).toHaveLength(1);
    expect(word[0].x).toBeCloseTo(2.6);
    expect(word[0].z).toBe(-24);
    expect(word[0].ropeLength).toBeCloseTo(RAIL_Y - (2.3 + ATTACH_Y * 1.5));
    const two = layoutWord("AB", [0, 2, 0], 1, advance);
    expect(two[0].x + two[1].x).toBeCloseTo(0);
  });
});

describe("heroFit", () => {
  it("places the camera so the block spans the fraction of the visible width", () => {
    const tan = Math.tan((HERO_FOV_DEG * Math.PI) / 360);
    const fit = heroFit(1.6, 5.8);
    expect((5.8 / (2 * fit.distance * tan * 1.6))).toBeCloseTo(FIT_LANDSCAPE);
    expect(fit.halfWidth).toBeCloseTo(fit.distance * tan * 1.6);
  });
  it("keeps the same camera distance in portrait (the rows shrink instead)", () => {
    const landscape = heroFit(1.6, 5.8);
    const s = fitScale(0.46);
    const portrait = heroFit(0.46, 5.8 * s);
    expect(portrait.distance).toBeCloseTo(landscape.distance);
  });
  it("quantises the aspect so resizes do not rebuild the rig", () => {
    expect(quantiseAspect(1.3)).toBe(quantiseAspect(1.9));
    expect(quantiseAspect(0.462)).toBe(0.45);
    expect(quantiseAspect(0.48)).toBe(0.5);
  });
});
