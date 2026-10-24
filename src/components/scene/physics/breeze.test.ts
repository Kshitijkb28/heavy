import { describe, expect, it } from "vitest";
import { biasedImpulse, BREEZE_IDLE_STOP_MS, breezeActive, gustAt, gustImpulse, hash01 } from "./breeze";

describe("breeze", () => {
  it("hash01 is deterministic and in [0, 1)", () => {
    for (let i = 0; i < 50; i++) {
      const h = hash01(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
      expect(hash01(i)).toBe(h);
    }
  });

  it("gusts are gentle and mostly sideways", () => {
    for (let k = 0; k < 20; k++) {
      const g = gustAt(k);
      expect(g.strength).toBeGreaterThanOrEqual(0.25);
      expect(g.strength).toBeLessThanOrEqual(0.55);
      expect(Math.hypot(g.dirX, g.dirZ)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(g.dirZ)).toBeLessThanOrEqual(0.35);
    }
  });

  it("gust impulses scale with mass and size, with ±20 % jitter", () => {
    const g = { dirX: 1, dirZ: 0, strength: 0.4 };
    const [x0, y0] = gustImpulse(g, 12, 1, 0);
    const [x1] = gustImpulse(g, 12, 1, 1);
    expect(x0).toBeCloseTo(12 * 0.4 * 0.8);
    expect(x1).toBeCloseTo(12 * 0.4 * 1.2);
    expect(y0).toBe(0);
    expect(gustImpulse(g, 12, 0.35, 0.5)[0]).toBeCloseTo(12 * 0.4 * 0.35);
  });

  it("biased impulses follow the direction with bounded scatter", () => {
    const j = biasedImpulse([1, 0, 0], 40, () => 0.5);
    expect(j[0]).toBeCloseTo(40);
    expect(j[1]).toBeCloseTo(0);
    expect(j[2]).toBeCloseTo(0);
    const k = biasedImpulse([0, 2, 0], 40, () => 1);
    expect(k[1]).toBeCloseTo(40 + 6);
    expect(Math.abs(k[0])).toBeLessThanOrEqual(6.0001);
  });

  it("blows only while the hero is in view and the visitor is not idle", () => {
    expect(breezeActive(true, 0)).toBe(true);
    expect(breezeActive(false, 0)).toBe(false);
    expect(breezeActive(true, BREEZE_IDLE_STOP_MS)).toBe(false);
  });
});
