import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { getGlyph, parseTypeface } from "@/components/scene/letters/glyphs";
import { fitScale, layoutName, quantiseAspect, REF_ASPECT } from "@/components/scene/physics/layout-fallback";
import { NAME_ROWS } from "@/data/derived";
import { SECTION_ORDER, type Aspect, type Keyframe } from "@/lib/contracts";
import { HERO_FIT, projectToNdc } from "./frame";
import { FRAMING, NOMINAL_ASPECT, PROJECT_STOPS, WORLD, buildKeyframes, buildPath, createPathSample, heroDistance, heroGeometry, heroVisibleWidth, keyframes, keyframesFor, pathFor, samplePath, type HeroBox } from "./places";

const T_MAX = SECTION_ORDER.length - 1;

function expectValidTable(frames: readonly Keyframe[]) {
  expect(frames.length).toBeGreaterThan(8);
  expect(frames[0].t).toBe(0);
  expect(frames.at(-1)?.t).toBe(T_MAX);
  for (let i = 1; i < frames.length; i++) expect(frames[i].t).toBeGreaterThan(frames[i - 1].t);
  for (const f of frames) {
    expect(Math.abs(f.position[0])).toBeLessThan(WORLD.halfWidth);
    expect(f.position[1]).toBeGreaterThan(0.3);
    expect(f.position[1]).toBeLessThan(6);
    expect(f.position[2]).toBeGreaterThan(WORLD.farWall);
    expect(f.position[2]).toBeLessThan(14);
    expect(f.fov).toBeGreaterThan(20);
    expect(f.fov).toBeLessThan(70);
    // never looking at its own position
    const d = Math.hypot(f.target[0] - f.position[0], f.target[1] - f.position[1], f.target[2] - f.position[2]);
    expect(d).toBeGreaterThan(0.5);
  }
  for (const stop of PROJECT_STOPS) expect(frames.some((f) => Math.abs(f.t - stop) < 1e-9)).toBe(true);
  for (const t of [1, 2, 4, 5, 6]) expect(frames.some((f) => f.t === t)).toBe(true);
}

function frameAt(frames: readonly Keyframe[], t: number): Keyframe {
  const f = frames.find((k) => Math.abs(k.t - t) < 1e-9);
  if (!f) throw new Error(`no keyframe at t=${t}`);
  return f;
}

describe("places: keyframe tables", () => {
  it("exports valid static tables for both aspects", () => {
    expectValidTable(keyframes.landscape);
    expectValidTable(keyframes.portrait);
  });

  it("builds valid tables for any live aspect", () => {
    for (const a of [0.42, 0.5625, 0.75, 1.0, 1.33, 1.78, 2.4]) expectValidTable(buildKeyframes(a));
  });

  it("frames lit things where the text is not, on both aspects", () => {
    const kinds: Aspect[] = ["landscape", "portrait"];
    for (const kind of kinds) {
      const aspect = NOMINAL_ASPECT[kind];
      const frames = keyframes[kind];
      const F = FRAMING[kind];
      const check = (t: number, point: readonly number[], ndc: readonly [number, number]) => {
        const f = frameAt(frames, t);
        const p = projectToNdc(f.position, f.target, point as [number, number, number], f.fov ?? 32, aspect);
        expect(p.depth).toBeGreaterThan(1);
        expect(p.x).toBeCloseTo(ndc[0], 5);
        expect(p.y).toBeCloseTo(ndc[1], 5);
      };
      check(0, WORLD.name.centre, kind === "landscape" ? heroGeometry(aspect).ndc : F.hero);
      check(1, WORLD.lamp, F.about);
      check(PROJECT_STOPS[0], WORLD.initials.yot, F.project);
      check(PROJECT_STOPS[1], WORLD.initials.remodely, F.project);
      check(PROJECT_STOPS[2], WORLD.initials.servicepoints, F.project);
      check(4, WORLD.tubeWall, F.stack);
      check(5, WORLD.door, F.education);
    }
  });

  it("fits the name block to exactly 72 % of a landscape viewport at the hero stop", () => {
    // up to about 5:4 the width fit wins; wider screens hit the height cap first (checked below)
    for (const aspect of [1.0, 1.2]) {
      const f = buildKeyframes(aspect)[0];
      const half = WORLD.name.width / 2;
      const c = WORLD.name.centre;
      const left = projectToNdc(f.position, f.target, [c[0] - half, c[1], c[2]], f.fov ?? 32, aspect);
      const right = projectToNdc(f.position, f.target, [c[0] + half, c[1], c[2]], f.fov ?? 32, aspect);
      expect((right.x - left.x) / 2).toBeCloseTo(HERO_FIT.landscape, 6);
      expect(heroDistance(aspect)).toBeCloseTo(f.position[2] - c[2], 9);
      expect(heroGeometry(aspect).depth).toBeCloseTo(left.depth, 9);
    }
    // 16:10, 16:9 and ultra-wide: height-limited, so the block is narrower than the width fit but never taller than 38 %
    const c = WORLD.name.centre;
    for (const aspect of [1.33, 1.6, 1.78, 2.4]) {
      const wide = buildKeyframes(aspect)[0];
      const top = projectToNdc(wide.position, wide.target, [c[0], c[1] + WORLD.name.height / 2, c[2]], 32, aspect);
      const bottom = projectToNdc(wide.position, wide.target, [c[0], c[1] - WORLD.name.height / 2, c[2]], 32, aspect);
      expect(top.y - bottom.y).toBeLessThanOrEqual(2 * 0.38 + 0.02);
      const wl = projectToNdc(wide.position, wide.target, [c[0] - WORLD.name.width / 2, c[1], c[2]], 32, aspect);
      const wr = projectToNdc(wide.position, wide.target, [c[0] + WORLD.name.width / 2, c[1], c[2]], 32, aspect);
      expect((wr.x - wl.x) / 2).toBeLessThanOrEqual(HERO_FIT.landscape + 1e-9);
    }
  });

  it("keeps the name block's top edge below the top bar on every landscape aspect", () => {
    for (const aspect of [1.33, 1.6, 1.78, 2.4]) {
      const f = buildKeyframes(aspect)[0];
      const c = WORLD.name.centre;
      const top = projectToNdc(f.position, f.target, [c[0], c[1] + WORLD.name.height / 2, c[2]], 32, aspect);
      const bottom = projectToNdc(f.position, f.target, [c[0], c[1] - WORLD.name.height / 2, c[2]], 32, aspect);
      expect(top.y).toBeLessThanOrEqual(1 - 2 * 0.19 + 0.03);
      expect(top.y).toBeGreaterThan(0.5);
      // ≤ 38 % tall with its top at 19 %: the bottom edge never drops below 57 % of the viewport (plus a little pitch)
      expect(bottom.y).toBeGreaterThanOrEqual(1 - 2 * (0.19 + 0.38) - 0.03);
      expect(heroGeometry(aspect).ndc[0]).toBe(0);
    }
    expect(heroGeometry(0.462).ndc).toEqual(FRAMING.portrait.hero);
  });

  it("publishes the hero view width for U2's portrait row scale", () => {
    const aspect = NOMINAL_ASPECT.portrait;
    expect(heroGeometry(aspect).depth).toBe(WORLD.heroDistancePortrait);
    const w = heroVisibleWidth(aspect);
    expect(w).toBeCloseTo(2 * WORLD.heroDistancePortrait * Math.tan((16 * Math.PI) / 180) * aspect, 9);
    // a block scaled to 88 % of it spans exactly 88 % of the width at the hero stop
    const f = keyframes.portrait[0];
    const half = (w * HERO_FIT.portrait) / 2;
    const c = WORLD.name.centre;
    const left = projectToNdc(f.position, f.target, [c[0] - half, c[1], c[2]], 32, aspect);
    const right = projectToNdc(f.position, f.target, [c[0] + half, c[1], c[2]], 32, aspect);
    expect((right.x - left.x) / 2).toBeCloseTo(HERO_FIT.portrait, 6);
  });

  it("describes the name rows exactly as U3 hangs them (Anton glyphs, bevels included)", () => {
    parseTypeface(JSON.parse(readFileSync("public/fonts/anton.typeface.json", "utf8")));
    const slots = layoutName(NAME_ROWS, REF_ASPECT, (c) => getGlyph(c).advance);
    WORLD.name.rows.forEach((row, i) => {
      const letters = slots.filter((s) => s.row === i).map((s) => ({ ...s, size: getGlyph(s.char).size }));
      expect(Math.min(...letters.map((l) => l.x - l.size.w / 2))).toBeCloseTo(row.x[0], 2);
      expect(Math.max(...letters.map((l) => l.x + l.size.w / 2))).toBeCloseTo(row.x[1], 2);
      expect(Math.min(...letters.map((l) => l.y - l.size.h / 2))).toBeCloseTo(row.y[0], 2);
      expect(Math.max(...letters.map((l) => l.y + l.size.h / 2))).toBeCloseTo(row.y[1], 2);
      for (const l of letters) {
        expect(l.z).toBe(row.z);
        expect(l.size.d).toBeCloseTo(WORLD.name.depth, 3);
      }
    });
  });

  it("fits the hanging rows into the measured room: top on its top edge, centred across it, as large as fits", () => {
    // rooms measured on the dev server (the h1 box, down to 12 px above the grab hint) from phones to a 1080p desktop
    const rooms: [number, number, HeroBox][] = [
      [320, 568, [24 / 320, 141 / 568, 296 / 320, 263 / 568]],
      [390, 844, [29 / 390, 204 / 844, 361 / 390, 415 / 844]],
      [768, 1024, [101 / 768, 191 / 1024, 667 / 768, 514 / 1024]],
      [1280, 720, [303 / 1280, 128 / 720, 977 / 1280, 420 / 720]],
      [1440, 900, [299 / 1440, 128 / 900, 1141 / 1440, 493 / 900]],
      [1920, 1080, [454 / 1920, 137 / 1080, 1466 / 1920, 577 / 1080]],
    ];
    const c = WORLD.name.centre;
    for (const [w, h, box] of rooms) {
      const aspect = w / h;
      const f = buildKeyframes(aspect, box)[0];
      const s = aspect < 1 ? fitScale(quantiseAspect(aspect)) : 1;
      let [left, right, top, bottom] = [Infinity, -Infinity, -Infinity, Infinity];
      for (const row of WORLD.name.rows) {
        for (const x of row.x) {
          for (const y of row.y) {
            for (const dz of [-0.5, 0.5]) {
              const p = projectToNdc(f.position, f.target, [x * s, c[1] + (y - c[1]) * s, (row.z + dz * WORLD.name.depth) * s], 32, aspect);
              [left, right, top, bottom] = [Math.min(left, p.x), Math.max(right, p.x), Math.max(top, p.y), Math.min(bottom, p.y)];
            }
          }
        }
      }
      // in CSS px: the top row's top edge on the room's top, nothing outside the room, centred across it
      expect(Math.abs(((1 - top) / 2) * h - box[1] * h)).toBeLessThan(1);
      expect(((1 - bottom) / 2) * h).toBeLessThanOrEqual(box[3] * h + 1);
      expect(((left + 1) / 2) * w).toBeGreaterThanOrEqual(box[0] * w - 1);
      expect(((right + 1) / 2) * w).toBeLessThanOrEqual(box[2] * w + 1);
      expect(Math.abs(((left + right) / 2 + 1) / 2 - (box[0] + box[2]) / 2) * w).toBeLessThan(1);
      // and as large as fits: one dimension fills the room
      expect(Math.max((right - left) / (2 * (box[2] - box[0])), (top - bottom) / (2 * (box[3] - box[1])))).toBeCloseTo(1, 2);
    }
  });

  it("looks back down the hall through the door at contact and holds to the footer", () => {
    for (const frames of [keyframes.landscape, keyframes.portrait]) {
      const contact = frameAt(frames, 6);
      const footer = frameAt(frames, 7);
      expect(contact.position[2]).toBeLessThan(WORLD.door[2]);
      expect(contact.target[2]).toBeGreaterThan(contact.position[2] + 10);
      expect(footer.position).toEqual(contact.position);
      expect(footer.target).toEqual(contact.target);
    }
  });

  it("caches paths per aspect", () => {
    expect(pathFor(1.6)).toBe(pathFor(1.6));
    expect(keyframesFor(1.6)).toBe(pathFor(1.6).frames);
    expect(pathFor(1.6)).not.toBe(pathFor(0.5));
  });
});

describe("places: spline", () => {
  const path = buildPath(keyframes.landscape);
  const out = createPathSample();

  it("passes through every keyframe exactly", () => {
    for (const f of path.frames) {
      samplePath(path, f.t, out);
      expect(out.position.x).toBeCloseTo(f.position[0], 9);
      expect(out.position.y).toBeCloseTo(f.position[1], 9);
      expect(out.position.z).toBeCloseTo(f.position[2], 9);
      expect(out.target.x).toBeCloseTo(f.target[0], 9);
      expect(out.target.y).toBeCloseTo(f.target[1], 9);
      expect(out.target.z).toBeCloseTo(f.target[2], 9);
      expect(out.fov).toBeCloseTo(f.fov ?? 32, 9);
    }
  });

  it("clamps outside the table", () => {
    samplePath(path, -3, out);
    expect(out.position.toArray()).toEqual([...path.frames[0].position]);
    samplePath(path, 99, out);
    expect(out.position.toArray()).toEqual([...path.frames.at(-1)!.position]);
    samplePath(path, NaN, out);
    expect(out.position.toArray()).toEqual([...path.frames[0].position]);
  });

  it("never overshoots a keyframe on any axis and holds still between identical keyframes", () => {
    const frames = path.frames;
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i];
      const b = frames[i + 1];
      for (let k = 0; k <= 40; k++) {
        const t = a.t + ((b.t - a.t) * k) / 40;
        samplePath(path, t, out);
        const pos = out.position.toArray();
        const tgt = out.target.toArray();
        for (let c = 0; c < 3; c++) {
          const lo = Math.min(a.position[c], b.position[c]) - 1e-9;
          const hi = Math.max(a.position[c], b.position[c]) + 1e-9;
          expect(pos[c]).toBeGreaterThanOrEqual(lo);
          expect(pos[c]).toBeLessThanOrEqual(hi);
          const tlo = Math.min(a.target[c], b.target[c]) - 1e-9;
          const thi = Math.max(a.target[c], b.target[c]) + 1e-9;
          expect(tgt[c]).toBeGreaterThanOrEqual(tlo);
          expect(tgt[c]).toBeLessThanOrEqual(thi);
        }
      }
    }
    const hold = new Vector3();
    samplePath(path, 6.5, out);
    hold.copy(out.position);
    expect(hold.toArray()).toEqual([...frames.at(-1)!.position]);
  });

  it("is continuous at every knot and never faster than a dolly", () => {
    const a = createPathSample();
    const b = createPathSample();
    for (const f of path.frames) {
      samplePath(path, f.t - 1e-7, a);
      samplePath(path, f.t + 1e-7, b);
      expect(a.position.distanceTo(b.position)).toBeLessThan(1e-4);
      expect(a.target.distanceTo(b.target)).toBeLessThan(1e-4);
      expect(Math.abs(a.fov - b.fov)).toBeLessThan(1e-4);
    }
    let maxSpeed = 0;
    samplePath(path, 0, a);
    for (let t = 0.001; t <= 7; t += 0.001) {
      samplePath(path, t, b);
      maxSpeed = Math.max(maxSpeed, b.position.distanceTo(a.position) / 0.001);
      a.position.copy(b.position);
    }
    // metres per unit of t: the fastest leg (S initial → the tube wall, 14 m in a third of a section) peaks near 50
    expect(maxSpeed).toBeLessThan(80);
  });

  it("refuses an empty table", () => {
    expect(() => buildPath([])).toThrow();
  });
});
