/**
 * Pure drive functions for the world (no three, no DOM): what each lit thing does for a given journey parameter `t`,
 * the beacon phase, the lamp pendulum, procedural noise and the wall/plate layout maths. Unit-tested in `world.test.ts`.
 */
import { BAY_DRIVE, DOOR, HAZE, INITIALS, LAMP, TUBE_WINDOW } from "./layout";

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function smoothstep(a: number, b: number, x: number): number {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}

/** Deterministic 0–1 hash of a number (shader-style), stable across runs. */
export function hash1(n: number): number {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Seeded PRNG (mulberry32) so geometry and particle layouts are reproducible and render-pure. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Beacon phase 0 → 1 per turn for an elapsed time (s); the `--beacon` custom property. */
export function beaconPhase(elapsed: number, period = 9): number {
  const p = (elapsed / period) % 1;
  return p < 0 ? p + 1 : p;
}

/**
 * Fluorescent tube `index` (0–4) for the journey parameter `t`: 0 before its window, a deterministic strobe inside it
 * (sparse at first, dense at the end), 1 once lit. Driven by `t` so scrubbing is repeatable.
 */
export function tubeLevel(t: number, index: number, count = 5, window: { start: number; end: number } = TUBE_WINDOW): number {
  const span = (window.end - window.start) / count;
  const t0 = window.start + index * span;
  const p = (t - t0) / span;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  const step = Math.floor(p * 16);
  const h = hash1(step * 7.31 + index * 13.7 + 1);
  const on = h < p * p * 1.25 + 0.04;
  return on ? 0.55 + 0.45 * hash1(step * 3.1 + index) : 0.03 + 0.05 * p;
}

/**
 * Both Experience bays for `t`: fade in from 1.7, the nearer entry lit, hand over at 2.5, fade out by 3.4; the idle one
 * keeps a faint glow. A bay with no plate (`lit` false: one company so far) stays dark.
 */
export function bayLevels(t: number, lit: readonly [boolean, boolean] = [true, true]): [number, number] {
  const enter = smoothstep(BAY_DRIVE.enter[0], BAY_DRIVE.enter[1], t) * (1 - smoothstep(BAY_DRIVE.leave[0], BAY_DRIVE.leave[1], t));
  const cross = smoothstep(BAY_DRIVE.cross[0], BAY_DRIVE.cross[1], t);
  const idle = BAY_DRIVE.idle;
  return [lit[0] ? enter * (idle + (1 - idle) * (1 - cross)) : 0, lit[1] ? enter * (idle + (1 - idle) * cross) : 0];
}

/** The About lamp simulates only while the camera is near it. */
export function lampLive(t: number): boolean {
  return t > LAMP.live[0] && t < LAMP.live[1];
}

/** Door hinge angle (rad): ajar until the camera approaches, swinging open through 5.15 → 5.9. */
export function doorAngle(t: number): number {
  return DOOR.ajar + (DOOR.open - DOOR.ajar) * smoothstep(DOOR.swing[0], DOOR.swing[1], t);
}

/**
 * z of the Projects follow spot: holds on each initial at its sub-stop (t = 3 + i/n) and slides to the next one through
 * the middle half of the gap between them.
 */
export function initialSpotZ(t: number, zs: readonly number[] = INITIALS.zs): number {
  const n = zs.length;
  if (n === 0) return -24;
  const u = clamp01(t - 3);
  let z = zs[0];
  for (let k = 1; k < n; k++) {
    const centre = (k - 0.5) / n;
    z += (zs[k] - zs[k - 1]) * smoothstep(centre - 0.25 / n, centre + 0.25 / n, u);
  }
  return z;
}

/** FogExp2 density for `t`: the hall haze inside, thinning once the camera is through the door. */
export function fogDensity(t: number): number {
  return HAZE.inside + (HAZE.outside - HAZE.inside) * smoothstep(HAZE.swing[0], HAZE.swing[1], t);
}

/** The door wedge and its dust fade out as the camera pushes through the doorway (gone by t 5.95). */
export function doorVolumeLevel(t: number): number {
  return 1 - smoothstep(5.7, 5.95, t);
}

export interface PendulumState {
  /** swing about the x axis (bob moves along −z for +ax) and the z axis (bob moves along +x for +az), rad */
  ax: number;
  az: number;
  vx: number;
  vz: number;
}

/** One damped-pendulum step (semi-implicit Euler, substepped ≤ 1/120 s); mutates and returns `s`. */
export function stepPendulum(s: PendulumState, dt: number, length = LAMP.length, damping = LAMP.damping, g = 9.81): PendulumState {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  const k = g / length;
  for (let i = 0; i < n; i++) {
    s.vx += (-k * Math.sin(s.ax) - damping * s.vx) * h;
    s.vz += (-k * Math.sin(s.az) - damping * s.vz) * h;
    s.ax += s.vx * h;
    s.az += s.vz * h;
  }
  return s;
}

/** Pendulum energy proxy (for tests and sleep checks). */
export function pendulumEnergy(s: PendulumState): number {
  return s.ax * s.ax + s.az * s.az + s.vx * s.vx + s.vz * s.vz;
}

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * Cover a wall rectangle (u0..u1 × v0..v1) minus rectangular openings with axis-aligned rectangles: full-height bands
 * between openings, and a band below / above each opening. Openings must not overlap along u.
 */
export function splitWall(u0: number, u1: number, v0: number, v1: number, openings: readonly Rect[]): Rect[] {
  const lo = Math.min(u0, u1);
  const hi = Math.max(u0, u1);
  const holes = openings
    .map((o) => ({ u0: Math.max(lo, Math.min(o.u0, o.u1)), u1: Math.min(hi, Math.max(o.u0, o.u1)), v0: Math.max(v0, Math.min(o.v0, o.v1)), v1: Math.min(v1, Math.max(o.v0, o.v1)) }))
    .filter((o) => o.u1 > o.u0 && o.v1 > o.v0)
    .sort((a, b) => a.u0 - b.u0);
  const out: Rect[] = [];
  let cursor = lo;
  for (const h of holes) {
    if (h.u0 > cursor) out.push({ u0: cursor, u1: h.u0, v0, v1 });
    if (h.v0 > v0) out.push({ u0: h.u0, u1: h.u1, v0, v1: h.v0 });
    if (h.v1 < v1) out.push({ u0: h.u0, u1: h.u1, v0: h.v1, v1 });
    cursor = h.u1;
  }
  if (cursor < hi) out.push({ u0: cursor, u1: hi, v0, v1 });
  return out;
}

export const rectArea = (r: Rect): number => Math.abs(r.u1 - r.u0) * Math.abs(r.v1 - r.v0);

/**
 * Tiling value noise, `size × size` bytes, `octaves` octaves (8, 16, 32 … cells), seeded. Used for the wet-concrete
 * roughness and the wall mottling; wraps on both axes so the texture repeats seamlessly.
 */
export function noiseField(size: number, seed: number, octaves = 3): Uint8Array {
  const out = new Float32Array(size * size);
  let amp = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 8 << o;
    const rand = mulberry32(seed * 1013 + o * 7919 + 17);
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
    const scale = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const ya = y0 % cells;
      const yb = (y0 + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = x * scale;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % cells;
        const xb = (x0 + 1) % cells;
        const a = lattice[ya * cells + xa];
        const b = lattice[ya * cells + xb];
        const c = lattice[yb * cells + xa];
        const d = lattice[yb * cells + xb];
        const v = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
        out[y * size + x] += v * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  const bytes = new Uint8Array(size * size);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round((out[i] / total) * 255);
  return bytes;
}

export interface PlateGlyph {
  /** glyph width at size 1 (0 for a space) */
  w: number;
  /** horizontal advance at size 1 */
  advance: number;
}

/** Centre x of every glyph of a word laid out on a baseline from `GlyphData.advance`, centred on 0, plus the word width. */
export function layoutPlate(glyphs: readonly PlateGlyph[]): { xs: number[]; width: number } {
  if (glyphs.length === 0) return { xs: [], width: 0 };
  let cursor = 0;
  const xs: number[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    xs.push(cursor + glyphs[i].w / 2);
    cursor += glyphs[i].advance;
  }
  const last = glyphs[glyphs.length - 1];
  const width = cursor - last.advance + last.w;
  const shift = width / 2;
  return { xs: xs.map((x) => x - shift), width };
}
