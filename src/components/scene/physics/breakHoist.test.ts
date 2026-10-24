import { describe, expect, it } from "vitest";
import { contactClass, easeOutCubic, G, HOIST_IDLE_MS, hoistDue, hoistPosition, hoistProgress, ropeSag, ropeTension, shouldSnap, SNAP_FACTOR, softRopeForce } from "./breakHoist";

const m = 12;
const L = 2.1;
const rest = { mass: m, ropeLength: L, cosTheta: 1, vTangential: 0, vRadialOut: 0, wasTaut: true, isTaut: true };

describe("rope tension", () => {
  it("equals the weight at rest and does not snap", () => {
    const t = ropeTension(rest);
    expect(t).toBeCloseTo(m * G);
    expect(shouldSnap(t, m)).toBe(false);
  });

  it("is zero while the chain is slack", () => {
    expect(ropeTension({ ...rest, isTaut: false, wasTaut: false, vRadialOut: 3 })).toBe(0);
  });

  it("snaps on a flung swing through the bottom but not a pushed one", () => {
    // 3.2 × weight on a 2.1 m rope: v² > 2.2 g L → v > 6.7 m/s
    expect(shouldSnap(ropeTension({ ...rest, vTangential: 7.5 }), m)).toBe(true);
    expect(shouldSnap(ropeTension({ ...rest, vTangential: 5.5 }), m)).toBe(false);
  });

  it("snaps when a slack chain catches a fast letter but not a slow one", () => {
    const catching = { ...rest, cosTheta: 0.5, wasTaut: false, isTaut: true };
    // catch impulse m·v / 0.25 s > 3.2 m g → v > 7.85 m/s
    expect(shouldSnap(ropeTension({ ...catching, vRadialOut: 8.5 }), m)).toBe(true);
    expect(shouldSnap(ropeTension({ ...catching, vRadialOut: 6 }), m)).toBe(false);
  });

  it("ignores radial speed while the chain was already taut", () => {
    expect(ropeTension({ ...rest, vRadialOut: 10 })).toBeCloseTo(m * G);
  });

  it("uses the 3.2 × weight threshold", () => {
    expect(SNAP_FACTOR).toBe(3.2);
    expect(shouldSnap(3.19 * m * G, m)).toBe(false);
    expect(shouldSnap(3.21 * m * G, m)).toBe(true);
    // a push (≈ 1.8 m/s on the 1.6 m upper ropes) stays well under it
    expect(shouldSnap(m * (G + (1.8 * 1.8) / 1.6), m)).toBe(false);
  });
});

describe("contacts", () => {
  it("classifies by force relative to the weight", () => {
    expect(contactClass(m * G, m)).toBe("none");
    expect(contactClass(5 * m * G, m)).toBe("none");
    expect(contactClass(7 * m * G, m)).toBe("heat");
    expect(contactClass(29 * m * G, m)).toBe("heat");
    expect(contactClass(31 * m * G, m)).toBe("snap");
  });
});

describe("soft rope", () => {
  it("never pushes", () => {
    expect(softRopeForce(-0.1, 0, m)).toBe(0);
    expect(softRopeForce(0, 0, m)).toBe(0);
  });
  it("carries the weight at the static sag", () => {
    expect(softRopeForce(ropeSag(), 0, m)).toBeCloseTo(m * G);
  });
  it("damps outward motion", () => {
    expect(softRopeForce(0.01, 1, m)).toBeGreaterThan(softRopeForce(0.01, 0, m));
  });
});

describe("hoist", () => {
  it("progress clamps to [0, 1]", () => {
    expect(hoistProgress(0, 100)).toBe(0);
    expect(hoistProgress(700, 100)).toBeCloseTo(0.5);
    expect(hoistProgress(5000, 100)).toBe(1);
  });
  it("lifts first, then drifts home", () => {
    const out = { x: 0, y: 0, z: 0 };
    hoistPosition([4, 0.4, 1], [0, 3.1, 0], 0, out);
    expect(out).toEqual({ x: 4, y: 0.4, z: 1 });
    hoistPosition([4, 0.4, 1], [0, 3.1, 0], 1, out);
    expect(out.x).toBeCloseTo(0);
    expect(out.y).toBeCloseTo(3.1);
    expect(out.z).toBeCloseTo(0);
    hoistPosition([4, 0.4, 1], [0, 3.1, 0], 0.4, out);
    const yProgress = (out.y - 0.4) / (3.1 - 0.4);
    const xProgress = (4 - out.x) / 4;
    expect(yProgress).toBeGreaterThan(xProgress);
  });
  it("is due after six idle seconds and never while grabbed", () => {
    expect(hoistDue(0, HOIST_IDLE_MS - 1, false)).toBe(false);
    expect(hoistDue(0, HOIST_IDLE_MS, false)).toBe(true);
    expect(hoistDue(0, HOIST_IDLE_MS * 3, true)).toBe(false);
  });
  it("easeOutCubic ends at 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});
