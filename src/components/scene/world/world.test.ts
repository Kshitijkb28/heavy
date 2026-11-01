import { describe, expect, it } from "vitest";
import { bayLevels, beaconPhase, doorAngle, doorVolumeLevel, fogDensity, hash1, initialSpotZ, lampLive, layoutPlate, mulberry32, noiseField, pendulumEnergy, rectArea, smoothstep, splitWall, stepPendulum, tubeLevel } from "./drives";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMetrics, parseTypeface } from "@/components/scene/letters/glyphs";
import { BAY, BAY_DRIVE, BAYS, DOOR, INITIALS, LAMP, PLATE_MAX_WIDTH, TUBE_WINDOW, TUBES, bayWords, initialZs, plateScaleFor, plateWord, tubeLayout } from "./layout";
import { experience, projects, skills } from "@/data/resume";

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
      expect(tubeLevel(t0 - 0.01, i, TUBES.length)).toBe(0);
      expect(tubeLevel(t0 + span + 0.001, i, TUBES.length)).toBe(1);
      for (let p = 0.01; p < 1; p += 0.05) {
        const v = tubeLevel(t0 + p * span, i, TUBES.length);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // the designed five
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
  it("keeps a bay without a plate dark", () => {
    for (const t of [2.1, 2.5, 2.9]) {
      expect(bayLevels(t, [true, false])[1]).toBe(0);
      expect(bayLevels(t, [true, false])[0]).toBe(bayLevels(t)[0]);
    }
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
    // the designed three (the live count is covered by "holds the follow spot on every initial at its stop")
    const zs = initialZs(3);
    expect(initialSpotZ(0, zs)).toBe(-24);
    expect(initialSpotZ(3, zs)).toBe(-24);
    expect(initialSpotZ(3.333, zs)).toBeCloseTo(-30, 5);
    expect(initialSpotZ(3.667, zs)).toBeCloseTo(-36, 5);
    expect(initialSpotZ(4, zs)).toBe(-36);
    const mid = initialSpotZ(3.167, zs);
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

describe("the hall follows the content counts", () => {
  it("hangs up to three initials on today's 6 m spacing and spreads four to six over z −21 … −37", () => {
    expect(initialZs(1)).toEqual([-24]);
    expect(initialZs(2)).toEqual([-24, -30]);
    expect(initialZs(3)).toEqual([-24, -30, -36]);
    for (const n of [4, 5, 6]) {
      const zs = initialZs(n);
      expect(zs).toHaveLength(n);
      expect(zs[0]).toBe(-21);
      expect(zs[n - 1]).toBeCloseTo(-37, 9);
      for (let i = 1; i < n; i++) expect(zs[i - 1] - zs[i]).toBeCloseTo(16 / (n - 1), 9);
    }
    expect(INITIALS.zs).toEqual(initialZs(projects.length));
  });

  it("holds the follow spot on every initial at its stop, for any count", () => {
    for (const n of [1, 2, 4, 6]) {
      const zs = initialZs(n);
      for (let i = 0; i < n; i++) expect(initialSpotZ(3 + i / n, zs)).toBeCloseTo(zs[i], 9);
      expect(initialSpotZ(4, zs)).toBeCloseTo(zs[n - 1], 9);
      let prev = Infinity;
      for (let t = 3; t <= 4; t += 0.01) {
        const z = initialSpotZ(t, zs);
        expect(z).toBeLessThanOrEqual(prev + 1e-12);
        prev = z;
      }
    }
  });

  it("hangs one tube per skill group on today's ladder", () => {
    const five = tubeLayout(5).map((t) => t.y);
    [4.1, 3.48, 2.86, 2.24, 1.62].forEach((y, i) => expect(five[i]).toBeCloseTo(y, 9));
    expect(tubeLayout(1).map((t) => t.y)[0]).toBeCloseTo(2.86, 9);
    const eight = tubeLayout(8).map((t) => t.y);
    expect(eight).toHaveLength(8);
    expect(eight[0]).toBeCloseTo(4.1, 9);
    expect(eight[7]).toBeCloseTo(1.62, 9);
    expect(TUBES).toHaveLength(skills.length);
  });

  it("casts the two latest companies on the bay plates, in the glyphs the iron has", () => {
    expect(plateWord("Mind2web LLP")).toBe("MIND2WEB LLP");
    expect(plateWord("Café & Co.")).toBe("CAFE & CO.");
    expect(plateWord("Zürich/Labs, GmbH")).toBe("ZURICH LABS GMBH");
    expect(bayWords(["Ethara AI", "Mind2web LLP", "Older Co"])).toEqual(["ETHARA AI", "MIND2WEB LLP"]);
    expect(bayWords(["Solo"])).toEqual(["SOLO", ""]);
    // a promotion is two roles at one company: the plates name two different companies
    expect(bayWords(["Acme Labs", "ACME LABS", "Old Co"])).toEqual(["ACME LABS", "OLD CO"]);
    expect(bayWords(["Acme", "Acme"])).toEqual(["ACME", ""]);
    expect(BAYS.map((b) => b.word)).toEqual(bayWords(experience.map((j) => j.company)));
  });

  it("casts today's plates at the design scale and a longer name smaller, never wider than MIND2WEB LLP", () => {
    parseTypeface(JSON.parse(readFileSync(path.resolve(process.cwd(), "public/fonts/anton.typeface.json"), "utf8")));
    const width = (word: string) => layoutPlate([...word].map((c) => ({ w: getMetrics(c).w, advance: getMetrics(c).advance }))).width;
    expect(plateScaleFor(width("ETHARA AI"))).toBe(BAY.plateScale);
    expect(plateScaleFor(width("MIND2WEB LLP"))).toBe(BAY.plateScale);
    const long = width("NORTHWIND LOGISTICS INTL");
    expect(plateScaleFor(long)).toBeLessThan(BAY.plateScale);
    expect(plateScaleFor(long) * long).toBeLessThanOrEqual(PLATE_MAX_WIDTH + 1e-9);
    expect(PLATE_MAX_WIDTH).toBeLessThan(BAY.width);
  });
});
