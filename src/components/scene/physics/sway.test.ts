import { describe, expect, it } from "vitest";
import { createSway, DROP_MS, dropExtension, dropSettled, easeOutBack, hoverPush, kickSway, stepSway, swayOffset } from "./sway";

describe("sway (scripted pendulum)", () => {
  it("rests at zero", () => {
    const s = createSway();
    for (let i = 0; i < 120; i++) stepSway(s, 1 / 60, 2);
    expect(s.ax).toBe(0);
    expect(s.az).toBe(0);
  });

  it("damps a displaced pendulum without stopping it dead", () => {
    const s = createSway();
    s.az = 0.3;
    let maxLate = 0;
    for (let i = 0; i < 600; i++) {
      stepSway(s, 1 / 60, 2);
      if (i > 300) maxLate = Math.max(maxLate, Math.abs(s.az));
    }
    expect(maxLate).toBeLessThan(0.3);
    expect(maxLate).toBeGreaterThan(0.01);
  });

  it("a +x impulse raises the x-swing rate by J/(m·L)", () => {
    const s = createSway();
    kickSway(s, [12, 0, 0], 12, 2);
    expect(s.wz).toBeCloseTo(0.5);
    expect(s.wx).toBe(0);
    kickSway(s, [0, 0, 6], 12, 2);
    expect(s.wx).toBeCloseTo(0.25);
  });

  it("hangs straight down at rest and swings along x", () => {
    const s = createSway();
    const o = { x: 0, y: 0, z: 0 };
    swayOffset(s, 2, o);
    expect(o).toEqual({ x: 0, y: -2, z: 0 });
    s.az = 0.1;
    swayOffset(s, 2, o);
    expect(o.x).toBeCloseTo(2 * Math.sin(0.1));
    expect(o.y).toBeLessThan(0);
    expect(o.y).toBeGreaterThan(-2);
  });

  it("easeOutBack overshoots then lands", () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
    expect(easeOutBack(1)).toBeCloseTo(1);
    expect(easeOutBack(0.75)).toBeGreaterThan(1);
  });

  it("the drop starts slack, overshoots the rope length and ends at it", () => {
    expect(dropExtension(0, 2)).toBeCloseTo(0.06);
    expect(dropExtension(DROP_MS * 0.75, 2)).toBeGreaterThan(1);
    expect(dropExtension(DROP_MS, 2)).toBe(1);
    expect(dropExtension(5000, 2)).toBe(1);
  });

  it("settles only after the staggered rig has dropped", () => {
    expect(dropSettled(DROP_MS, 15)).toBe(false);
    expect(dropSettled(DROP_MS + 35 * 14 + 300, 15)).toBe(true);
  });

  it("the hover spring repels inside its radius only", () => {
    expect(hoverPush(2, 0, 1, 10, 1 / 60)).toEqual([0, 0]);
    const [ix, iz] = hoverPush(0.5, 0, 1, 10, 1 / 60);
    expect(ix).toBeGreaterThan(0);
    expect(iz).toBe(0);
    const [jx] = hoverPush(-0.5, 0, 1, 10, 1 / 60);
    expect(jx).toBeLessThan(0);
  });
});
