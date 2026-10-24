import { describe, expect, it } from "vitest";
import { bayLevels, beaconPhase, doorAngle, doorVolumeLevel, fogDensity, hash1, initialSpotZ, lampLive, layoutPlate, mulberry32, noiseField, pendulumEnergy, rectArea, smoothstep, splitWall, stepPendulum, tubeLevel } from "./drives";
import { BAY_DRIVE, BAYS, DOOR, LAMP, TUBE_WINDOW, TUBES } from "./layout";

describe("beaconPhase", () => {
  it("runs 0 → 1 once per 9 s turn and wraps", () => {
    expect(beaconPhase(0)).toBe(0);
    expect(beaconPhase(4.5)).toBeCloseTo(0.5);
    expect(beaconPhase(9)).toBeCloseTo(0);
    expect(beaconPhase(13.5)).toBeCloseTo(0.5);
    expect(beaconPhase(-2.25)).toBeCloseTo(0.75);
  });
});

describe("tubeLevel", () => {
  it("is 0 before its window, 1 after it, bounded inside, and the tubes light in order", () => {
    for (const tube of TUBES) {
      const i = tube.index;
      const span = (TUBE_WINDOW.end - TUBE_WINDOW.start) / TUBES.length;
      const t0 = TUBE_WINDOW.start + i * span;
      expect(tubeLevel(t0 - 0.01, i)).toBe(0);
      expect(tubeLevel(t0 + span + 0.001, i)).toBe(1);
      for (let p = 0.01; p < 1; p += 0.05) {
        const v = tubeLevel(t0 + p * span, i);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(tubeLevel(3.77, 0)).toBe(1);
    expect(tubeLevel(3.77, 4)).toBe(0);
    expect(tubeLevel(4.4, 4)).toBe(1);
  });
  it("is deterministic in t", () => {
    expect(tubeLevel(3.65, 0)).toBe(tubeLevel(3.65, 0));
    // sixteen samples across the first tube's own strobe window
    const span = (TUBE_WINDOW.end - TUBE_WINDOW.start) / TUBES.length;
    const strobe = Array.from({ length: 16 }, (_, k) => tubeLevel(TUBE_WINDOW.start + ((k + 0.5) / 16) * span, 0));
    expect(new Set(strobe).size).toBeGreaterThan(1);
  });
});

describe("bayLevels", () => {
  it("is dark outside Experience, lights the first bay, hands over at 2.5 and leaves a faint idle glow", () => {
    expect(bayLevels(0)).toEqual([0, 0]);
    expect(bayLevels(1.0)).toEqual([0, 0]);
    const [a0, a1] = bayLevels(2.1);
    expect(a0).toBeCloseTo(1, 1);
    expect(a1).toBeCloseTo(BAY_DRIVE.idle, 1);
    const [b0, b1] = bayLevels(2.9);
    expect(b1).toBeCloseTo(1, 1);
    expect(b0).toBeCloseTo(BAY_DRIVE.idle, 1);
    expect(bayLevels(3.6)).toEqual([0, 0]);
    expect(BAYS).toHaveLength(2);
  });
});

describe("lampLive / doorAngle", () => {
  it("runs the pendulum only near About", () => {
    expect(lampLive(0)).toBe(false);
    expect(lampLive(1)).toBe(true);
    expect(lampLive(LAMP.live[1] + 0.01)).toBe(false);
  });
  it("keeps the door ajar until the camera approaches, then opens it", () => {
    expect(doorAngle(0)).toBe(DOOR.ajar);
    expect(doorAngle(5)).toBe(DOOR.ajar);
    expect(doorAngle(7)).toBeCloseTo(DOOR.open);
    const mid = doorAngle((DOOR.swing[0] + DOOR.swing[1]) / 2);
    expect(mid).toBeGreaterThan(DOOR.ajar);
    expect(mid).toBeLessThan(DOOR.open);
  });
});

describe("stepPendulum", () => {
  it("swings with the pendulum period and damps toward rest", () => {
    const s = { ax: 0.4, az: 0, vx: 0, vz: 0 };
    const e0 = pendulumEnergy(s);
    let crossings = 0;
    let last = s.ax;
    for (let i = 0; i < 600; i++) {
      stepPendulum(s, 1 / 60);
      if (Math.sign(s.ax) !== Math.sign(last) && last !== 0) crossings++;
      last = s.ax;
    }
    expect(pendulumEnergy(s)).toBeLessThan(e0 * 0.15);
    expect(crossings).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 6000; i++) stepPendulum(s, 1 / 60);
    expect(Math.abs(s.ax)).toBeLessThan(1e-3);
    expect(Math.abs(s.vx)).toBeLessThan(1e-3);
  });
  it("substeps large frame deltas without blowing up", () => {
    const s = { ax: 0.6, az: 0.6, vx: 0, vz: 0 };
    for (let i = 0; i < 100; i++) stepPendulum(s, 1 / 30);
    expect(Math.abs(s.ax)).toBeLessThan(0.6);
    expect(Number.isFinite(s.vz)).toBe(true);
  });
});

describe("splitWall", () => {
  it("covers the wall minus the openings exactly, in either u direction", () => {
    const holes = [
      { u0: -12.3, u1: -7.7, v0: 0.5, v1: 3.5 },
      { u0: -18.3, u1: -13.7, v0: 0.5, v1: 3.5 },
    ];
    const rects = splitWall(-70, 10, 0, 10, holes);
    const area = rects.reduce((a, r) => a + rectArea(r), 0);
    expect(area).toBeCloseTo(80 * 10 - 2 * 4.6 * 3, 6);
    for (const r of rects) {
      expect(r.u1).toBeGreaterThan(r.u0);
      expect(r.v1).toBeGreaterThan(r.v0);
      for (const h of holes) {
        const overlapU = Math.min(r.u1, h.u1) - Math.max(r.u0, h.u0);
        const overlapV = Math.min(r.v1, h.v1) - Math.max(r.v0, h.v0);
        expect(overlapU <= 1e-9 || overlapV <= 1e-9).toBe(true);
      }
    }
    expect(splitWall(10, -70, 0, 10, holes).reduce((a, r) => a + rectArea(r), 0)).toBeCloseTo(area, 6);
  });
  it("handles a floor-to-lintel opening (the door) with no band below it", () => {
    const rects = splitWall(-12, 12, 0, 10, [{ u0: 1.5, u1: 3.3, v0: 0, v1: 3.34 }]);
    expect(rects).toHaveLength(3);
    expect(rects.reduce((a, r) => a + rectArea(r), 0)).toBeCloseTo(240 - 1.8 * 3.34, 6);
  });
  it("returns the whole wall when there are no openings", () => {
    expect(splitWall(0, 5, 0, 2, [])).toEqual([{ u0: 0, u1: 5, v0: 0, v1: 2 }]);
  });
});

describe("noise", () => {
  it("hash1 and mulberry32 are deterministic and in [0, 1)", () => {
    expect(hash1(3.7)).toBe(hash1(3.7));
    const r = mulberry32(42);
    const a = [r(), r(), r()];
    const r2 = mulberry32(42);
    expect([r2(), r2(), r2()]).toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it("noiseField tiles seamlessly, is deterministic and uses the full byte range", () => {
    const size = 64;
    const f = noiseField(size, 7, 3);
    expect(f).toHaveLength(size * size);
    expect(noiseField(size, 7, 3)).toEqual(f);
    expect(noiseField(size, 8, 3)).not.toEqual(f);
    let min = 255;
    let max = 0;
    for (const v of f) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    expect(min).toBeLessThan(80);
    expect(max).toBeGreaterThan(175);
    for (let y = 0; y < size; y++) expect(Math.abs(f[y * size] - f[y * size + size - 1])).toBeLessThanOrEqual(40);
    for (let x = 0; x < size; x++) expect(Math.abs(f[x] - f[(size - 1) * size + x])).toBeLessThanOrEqual(40);
  });
});

describe("layoutPlate", () => {
  it("centres a word on 0 and reports its width", () => {
    const { xs, width } = layoutPlate([
      { w: 0.5, advance: 0.6 },
      { w: 0.5, advance: 0.6 },
      { w: 0.25, advance: 0.3 },
      { w: 0.5, advance: 0.6 },
    ]);
    expect(width).toBeCloseTo(0.6 + 0.6 + 0.3 + 0.5);
    expect(xs[0]).toBeCloseTo(-width / 2 + 0.25);
    expect(xs[3]).toBeCloseTo(width / 2 - 0.25);
    expect(xs[0] + xs[3]).toBeCloseTo(0);
  });
  it("handles the empty word", () => {
    expect(layoutPlate([])).toEqual({ xs: [], width: 0 });
  });
});

describe("smoothstep", () => {
  it("clamps and eases", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe("initialSpotZ / fogDensity / doorVolumeLevel", () => {
  it("holds the follow spot on each initial at the sub-stops and slides between them", () => {
    expect(initialSpotZ(0)).toBe(-24);
    expect(initialSpotZ(3)).toBe(-24);
    expect(initialSpotZ(3.333)).toBeCloseTo(-30, 5);
    expect(initialSpotZ(3.667)).toBeCloseTo(-36, 5);
    expect(initialSpotZ(4)).toBe(-36);
    const mid = initialSpotZ(3.167);
    expect(mid).toBeLessThan(-24);
    expect(mid).toBeGreaterThan(-30);
  });
  it("thins the haze only once the camera passes the door", () => {
    expect(fogDensity(0)).toBeCloseTo(0.045);
    expect(fogDensity(5)).toBeCloseTo(0.045);
    expect(fogDensity(6)).toBeCloseTo(0.016);
    expect(fogDensity(5.6)).toBeGreaterThan(0.016);
    expect(fogDensity(5.6)).toBeLessThan(0.045);
  });
  it("fades the door volumes out through the doorway", () => {
    expect(doorVolumeLevel(5)).toBe(1);
    expect(doorVolumeLevel(5.95)).toBe(0);
    expect(doorVolumeLevel(5.8)).toBeGreaterThan(0);
    expect(doorVolumeLevel(5.8)).toBeLessThan(1);
  });
});
