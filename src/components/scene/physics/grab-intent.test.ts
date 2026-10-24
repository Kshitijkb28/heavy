import { describe, expect, it } from "vitest";
import { classifyTouchMove, HOLD_MS, isTap, nudgeImpulse, springImpulse, SPRING_FORCE_CAP_PER_KG, SPRING_K_PER_KG } from "./grab-intent";

describe("touch intent", () => {
  it("a still finger is pending until the hold time, then a grab", () => {
    expect(classifyTouchMove(0, 0, 100)).toBe("pending");
    expect(classifyTouchMove(3, 2, HOLD_MS - 1)).toBe("pending");
    expect(classifyTouchMove(0, 0, HOLD_MS)).toBe("grab");
  });
  it("a horizontal move is a grab, a vertical or diagonal-down move scrolls", () => {
    expect(classifyTouchMove(20, 3, 50)).toBe("grab");
    expect(classifyTouchMove(-14, 6, 50)).toBe("grab");
    expect(classifyTouchMove(3, 20, 50)).toBe("scroll");
    expect(classifyTouchMove(10, 12, 50)).toBe("scroll");
    expect(classifyTouchMove(7, 1, 50)).toBe("scroll");
  });
  it("a quick still release is a tap", () => {
    expect(isTap(2, 1, 90)).toBe(true);
    expect(isTap(2, 1, HOLD_MS)).toBe(false);
    expect(isTap(12, 0, 90)).toBe(false);
  });
});

describe("hand spring", () => {
  it("is quiet at the target with no velocity", () => {
    expect(springImpulse([1, 2, 3], [1, 2, 3], [0, 0, 0], 12, 1 / 60)).toEqual([0, 0, 0]);
  });
  it("pulls toward the target with k = 60·m", () => {
    const [jx, jy, jz] = springImpulse([0.1, 0, 0], [0, 0, 0], [0, 0, 0], 12, 1 / 60);
    expect(jx).toBeCloseTo((SPRING_K_PER_KG * 12 * 0.1) / 60);
    expect(jy).toBe(0);
    expect(jz).toBe(0);
  });
  it("damps the grab point's velocity", () => {
    const [jx] = springImpulse([0, 0, 0], [0, 0, 0], [1, 0, 0], 12, 1 / 60);
    expect(jx).toBeLessThan(0);
  });
  it("caps the force for a far pointer", () => {
    const j = springImpulse([10, 0, 0], [0, 0, 0], [0, 0, 0], 12, 1 / 60);
    expect(Math.hypot(...j)).toBeCloseTo((SPRING_FORCE_CAP_PER_KG * 12) / 60);
  });
});

describe("tap nudge", () => {
  it("kicks sideways away from the tap, upward, slightly back", () => {
    const left = nudgeImpulse(12, 1, -1);
    const right = nudgeImpulse(12, 1, 1);
    expect(left[0]).toBeLessThan(0);
    expect(right[0]).toBeGreaterThan(0);
    expect(right[1]).toBeGreaterThan(0);
    expect(right[2]).toBeLessThan(0);
    expect(nudgeImpulse(12, 0.5, 1)[1]).toBeCloseTo(right[1] / 2);
  });
});
