/**
 * The dolly track (U5): camera keyframes for the journey t ∈ [0, 7] (DESIGN.md §3) and the spline that joins them.
 *
 * `keyframesFor(aspectRatio)` builds a table for the live canvas aspect (lit things are solved onto exact NDC
 * positions, the hero distance fits the name block); `keyframes` is the static contract table built for nominal
 * aspects (16:10 landscape, 390×844 portrait). `samplePath` evaluates the track at any t: a monotone cubic Hermite
 * (Fritsch–Carlson) per axis, so the camera passes through every keyframe, never overshoots one into a wall, and
 * holds exactly still where two consecutive keyframes coincide (6 → 7).
 */
import { Vector3 } from "three";
import type { Aspect, Keyframe, KeyframeTable, Vec3 } from "@/lib/contracts";
import { fitScale as rigScale, quantiseAspect } from "@/components/scene/physics/layout-fallback";
import { INITIALS } from "@/components/scene/world/layout";
import { projects } from "@/data/resume";
import { DEFAULT_FOV, HERO_FIT, fitDistanceBox, halfExtents, projectToNdc, solveTargetForNdc, visibleHeight } from "./frame";

/**
 * The room the iron name may fill with the page at the top, as fractions [left, top, right, bottom] of the viewport
 * (`sceneState.heroBox`): the DOM h1's box, extended down to the grab hint where the layout leaves a gap (phones).
 */
export type HeroBox = readonly [number, number, number, number];

/** One hanging project initial as the camera aims at it. */
export interface InitialPlace {
  /** the project id */
  id: string;
  position: Vec3;
}

/**
 * Where things stand in the hall (metres), as the camera assumes them. U2/U3/U4 place the real objects; if one moves,
 * change it here and every keyframe that frames it follows.
 */
export const WORLD = {
  /** walls at x = ±halfWidth, the hall runs from the rig (z 0) to the far wall */
  halfWidth: 12,
  farWall: -70,
  /** the name block: 15 iron letters in two rows (U3 `layoutName`: rows at y 3.1 / 1.7, z 0 / −0.7), landscape, unscaled;
   *  width = BHARDWAJ by Anton advances + 0.12 m gaps */
  name: {
    centre: [0, 2.4, -0.35] as Vec3,
    width: 4.95,
    height: 2.3,
    /** each row as it hangs (scale 1, Anton outlines with bevels): x and y extent of its letters, z of its plane. The top
     *  row hangs in front of the centre, so from the low hero camera it looks bigger and higher than a flat block. */
    rows: [
      { x: [-1.751, 1.741], y: [2.632, 3.568], z: 0 },
      { x: [-2.47, 2.475], y: [1.236, 2.164], z: -0.7 },
    ],
    /** letter depth: extrusion plus both bevels */
    depth: 0.43,
  },
  /** on portrait U3 scales the rows by (0.88 / 0.72)·(aspect / 1.6), which spans 88 % of the width at this distance for
   *  every portrait aspect (4.95 m / (0.72 · 2 tan 16° · 1.6)) */
  heroDistancePortrait: 7.5,
  /** the About work lamp (U4 `Lamp`): shade position at rest */
  lamp: [5.5, 3.4, -3] as Vec3,
  /** the two Experience bays, recessed in the right wall (U4 `Bays`) */
  bays: [
    [13.3, 2.55, -10],
    [13.3, 2.55, -16],
  ] as readonly Vec3[],
  /** the project initials on chains (U3 `Initials`), one per project in page order, hung at `INITIALS.zs` */
  initials: projects.map((p, i): InitialPlace => ({ id: p.id, position: [INITIALS.x, 2.5, INITIALS.zs[i]] })),
  /** centre of the five Stack tubes on the right wall (U4 `Tubes`, z −40 … −48) */
  tubeWall: [11.86, 2.86, -44] as Vec3,
  /** the Education door: centre of a 3.2 m opening in the far wall (U4 `Door`) */
  door: [2.4, 1.6, -62] as Vec3,
} as const;

/** Journey parameters of the project sub-stops: one per initial, the projects section split evenly (t = 3 + i/n). */
export function projectStops(count: number): number[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => 3 + i / n);
}

export const PROJECT_STOPS: readonly number[] = projectStops(WORLD.initials.length);

/**
 * Where each lit thing sits on screen (NDC) so it stays in the half (landscape) or third (portrait) of the viewport
 * the text does not use (DESIGN.md §3 readability rules; U6 compositions).
 */
export const FRAMING: Record<Aspect, Record<"hero" | "about" | "experience" | "project" | "stack" | "education", readonly [number, number]>> = {
  landscape: {
    /** fallback only: on landscape `heroGeometry` derives the hero NDC from the block's screen height */
    hero: [0, 0.42],
    about: [0.4, 0.45],
    experience: [0.5, 0.05],
    project: [0.55, 0.05],
    /* the ladder's five tubes sit roughly level with the five DOM rows below the heading */
    stack: [0.45, -0.42],
    education: [0.45, 0.1],
  },
  portrait: {
    /* the DOM h1 centre on phones sits at NDC ≈ 0.33–0.37 (320×568 … 430×932): the iron name lands in its place */
    hero: [0, 0.34],
    about: [0, 0.5],
    experience: [0, 0.5],
    project: [0, 0.45],
    stack: [0, 0.55],
    education: [0, 0.35],
  },
};

/** Fraction of the viewport height the name block may take at the hero stop (keeps ultra-wide screens from cropping it). */
const HERO_FIT_HEIGHT: Record<Aspect, number> = { landscape: 0.38, portrait: 0.4 };

/** Camera height at the hero stop: low, looking up at the rig. */
const HERO_CAMERA_Y: Record<Aspect, number> = { landscape: 1.0, portrait: 1.1 };

export function aspectKind(aspectRatio: number): Aspect {
  return aspectRatio < 1 ? "portrait" : "landscape";
}

export interface HeroGeometry {
  position: Vec3;
  /** where the block centre sits on screen */
  ndc: readonly [number, number];
  /** distance from the camera to the name block measured along the view axis */
  depth: number;
  /** horizontal distance from the camera to the block (its z offset) */
  distance: number;
}

/** On landscape the block's top edge sits this far below the top of the viewport (fraction of the height). */
const HERO_TOP_MARGIN = 0.19;

/** Horizontal camera distance that puts the block centre `depth` along the view axis when it sits at `ndc`. */
function heroDistanceFor(depth: number, ndc: readonly [number, number], camY: number): number {
  const gamma = Math.atan(ndc[1] * halfExtents(DEFAULT_FOV, 1).y);
  const straight = depth / Math.cos(gamma);
  const dy = WORLD.name.centre[1] - camY;
  return Math.sqrt(Math.max(0, straight * straight - dy * dy));
}

/** Screen bounds (NDC) of the hanging rows, scaled by `s` like U3's portrait layout (about y 2.4, z 0). */
function projectedName(position: Vec3, ndc: readonly [number, number], s: number, aspectRatio: number) {
  const c = WORLD.name.centre;
  const target = solveTargetForNdc(position, c, ndc, DEFAULT_FOV, aspectRatio);
  const b = { left: Infinity, right: -Infinity, top: -Infinity, bottom: Infinity };
  for (const row of WORLD.name.rows) {
    for (const x of row.x) {
      for (const y of row.y) {
        for (const z of [row.z - WORLD.name.depth / 2, row.z + WORLD.name.depth / 2]) {
          const p = projectToNdc(position, target, [x * s, c[1] + (y - c[1]) * s, z * s], DEFAULT_FOV, aspectRatio);
          b.left = Math.min(b.left, p.x);
          b.right = Math.max(b.right, p.x);
          b.top = Math.max(b.top, p.y);
          b.bottom = Math.min(b.bottom, p.y);
        }
      }
    }
  }
  return b;
}

/**
 * Solves the hero camera: along the view axis the block is exactly as far as the fit needs, and the block centre sits
 * at the hero NDC. With a measured `box` the rows, projected as they hang, fill it: as large as fits, centred across it,
 * their top on its top edge (the eyebrow sits just above). Before the measure: landscape fits width ≤ 72 % and height
 * ≤ 38 % of the viewport with the top edge clear of the top bar; portrait keeps `WORLD.heroDistancePortrait` (U2 scales
 * the rows to 88 %) at `FRAMING.portrait.hero`.
 */
export function heroGeometry(aspectRatio: number, box?: HeroBox | null): HeroGeometry {
  const kind = aspectKind(aspectRatio);
  const c = WORLD.name.centre;
  const camY = HERO_CAMERA_Y[kind];
  let depth =
    kind === "portrait"
      ? WORLD.heroDistancePortrait
      : fitDistanceBox(WORLD.name.width, WORLD.name.height, DEFAULT_FOV, aspectRatio, HERO_FIT.landscape, HERO_FIT_HEIGHT.landscape);
  let ndc: readonly [number, number] = FRAMING[kind].hero;
  if (box && box[2] - box[0] > 0.05 && box[3] - box[1] > 0.03) {
    // a flat block centred in the box first, then corrections on the projected rows: each one scales the view about the
    // block centre and moves it, so a handful of steps converge
    const s = kind === "portrait" ? rigScale(quantiseAspect(aspectRatio)) : 1;
    const room = { left: 2 * box[0] - 1, right: 2 * box[2] - 1, top: 1 - 2 * box[1], bottom: 1 - 2 * box[3] };
    depth = fitDistanceBox(WORLD.name.width * s, WORLD.name.height * s, DEFAULT_FOV, aspectRatio, box[2] - box[0], box[3] - box[1]);
    ndc = [(room.left + room.right) / 2, (room.top + room.bottom) / 2];
    for (let i = 0; i < 6; i++) {
      const b = projectedName([c[0], camY, c[2] + heroDistanceFor(depth, ndc, camY)], ndc, s, aspectRatio);
      const k = Math.max((b.right - b.left) / (room.right - room.left), (b.top - b.bottom) / (room.top - room.bottom));
      depth *= k;
      const top = ndc[1] + (b.top - ndc[1]) / k;
      const middle = ndc[0] + ((b.left + b.right) / 2 - ndc[0]) / k;
      ndc = [ndc[0] + (room.left + room.right) / 2 - middle, ndc[1] + room.top - top];
    }
  } else if (kind === "landscape") {
    const blockHeight = WORLD.name.height / visibleHeight(depth, DEFAULT_FOV);
    ndc = [0, Math.min(0.6, Math.max(-0.2, 1 - 2 * (HERO_TOP_MARGIN + blockHeight / 2)))];
  }
  const distance = heroDistanceFor(depth, ndc, camY);
  return { position: [c[0], camY, c[2] + distance], ndc, depth, distance };
}

/** Horizontal camera distance from the name block at the hero stop. */
export function heroDistance(aspectRatio: number, box?: HeroBox | null): number {
  return heroGeometry(aspectRatio, box).distance;
}

/**
 * Width of the view (metres) at the name block when the hero camera sits at its stop. U2's `fitScale(aspect)` can scale
 * the rows so the block spans `HERO_FIT[aspect]` of this width.
 */
export function heroVisibleWidth(aspectRatio: number, box?: HeroBox | null): number {
  return 2 * heroGeometry(aspectRatio, box).depth * halfExtents(DEFAULT_FOV, aspectRatio).x;
}

const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Builds the keyframe table for one aspect ratio (width / height). Sorted by t; first at 0, last at 7. One project stop
 * per initial (`projectStops`), each camera 3.8 m off the initials' line and 6.5 m in front of its initial: about 30°
 * off the letter's face, so it reads, while the nearer initials fall outside the frame and the dolly never passes
 * through one, however closely they hang.
 */
export function buildKeyframes(aspectRatio: number, box?: HeroBox | null, initials: readonly InitialPlace[] = WORLD.initials): readonly Keyframe[] {
  const kind = aspectKind(aspectRatio);
  const F = FRAMING[kind];
  const fov = DEFAULT_FOV;
  const look = (position: Vec3, point: Vec3, ndc: readonly [number, number]): Keyframe["target"] => solveTargetForNdc(position, point, ndc, fov, aspectRatio);
  const [bay1, bay2] = WORLD.bays;
  const stops = projectStops(initials.length);
  const projectFrames = (projectPosition: (p: Vec3) => Vec3): Keyframe[] =>
    initials.map(({ position: p }, i) => {
      const position = projectPosition(p);
      return { t: stops[i], position, target: look(position, p, F.project), fov };
    });
  const door = WORLD.door;
  const contactPosition: Vec3 = [door[0], 1.95, door[2] - 1.9];
  const contactTarget: Vec3 = [0.3, 2.3, -35];

  if (kind === "landscape") {
    const hero = heroGeometry(aspectRatio, box);
    const aboutPosition: Vec3 = [6.6, 2.2, 2.4];
    const experiencePosition: Vec3 = [5.0, 2.3, -1.0];
    const projectPosition = (p: Vec3): Vec3 => [p[0] - 3.8, 2.1, p[2] + 6.5];
    const stackPosition: Vec3 = [3.5, 2.9, -44.0];
    const educationPosition: Vec3 = [-2.0, 1.9, -52.5];
    const frames: Keyframe[] = [
      { t: 0, position: hero.position, target: look(hero.position, WORLD.name.centre, hero.ndc), fov },
      { t: 1, position: aboutPosition, target: look(aboutPosition, WORLD.lamp, F.about), fov },
      { t: 2, position: experiencePosition, target: look(experiencePosition, mid(bay1, bay2), F.experience), fov },
      { t: 2.5, position: [2.6, 2.2, -8.5], target: look([2.6, 2.2, -8.5], bay2, F.experience), fov },
      ...projectFrames(projectPosition),
      { t: 4, position: stackPosition, target: look(stackPosition, WORLD.tubeWall, F.stack), fov },
      { t: 5, position: educationPosition, target: look(educationPosition, door, F.education), fov },
      { t: 5.5, position: [door[0], 1.7, door[2] + 1.2], target: [door[0], 1.7, door[2] - 5], fov },
      { t: 5.78, position: [door[0], 1.75, door[2] - 1.4], target: [door[0] + 4.3, 1.8, door[2] - 1.6], fov },
      { t: 6, position: contactPosition, target: contactTarget, fov },
      { t: 7, position: contactPosition, target: contactTarget, fov },
    ];
    return frames;
  }

  const hero = heroGeometry(aspectRatio, box);
  const aboutPosition: Vec3 = [5.0, 1.8, 3.8];
  const experiencePosition: Vec3 = [3.5, 2.3, 2.5];
  // off the initials' line like landscape: straight down it, a nearer initial would hang right in front of the lens
  const projectPosition = (p: Vec3): Vec3 => [p[0] - 3.8, 1.6, p[2] + 6.5];
  const stackPosition: Vec3 = [-1.0, 2.9, -44.0];
  const educationPosition: Vec3 = [door[0], 1.7, -47.0];
  const frames: Keyframe[] = [
    { t: 0, position: hero.position, target: look(hero.position, WORLD.name.centre, hero.ndc), fov },
    { t: 1, position: aboutPosition, target: look(aboutPosition, WORLD.lamp, F.about), fov },
    { t: 2, position: experiencePosition, target: look(experiencePosition, mid(bay1, bay2), F.experience), fov },
    { t: 2.5, position: [4.0, 2.2, -8.0], target: look([4.0, 2.2, -8.0], bay2, F.experience), fov },
    ...projectFrames(projectPosition),
    { t: 4, position: stackPosition, target: look(stackPosition, WORLD.tubeWall, F.stack), fov },
    { t: 5, position: educationPosition, target: look(educationPosition, door, F.education), fov },
    { t: 5.5, position: [door[0], 1.7, door[2] + 1.2], target: [door[0], 1.7, door[2] - 5], fov },
    { t: 5.78, position: [door[0], 1.75, door[2] - 1.4], target: [door[0] + 4.3, 1.8, door[2] - 1.6], fov },
    { t: 6, position: contactPosition, target: contactTarget, fov },
    { t: 7, position: contactPosition, target: contactTarget, fov },
  ];
  return frames;
}

/** Nominal aspects the static tables are built for. */
export const NOMINAL_ASPECT: Record<Aspect, number> = { landscape: 16 / 10, portrait: 390 / 844 };

/** The contract table (DESIGN.md §3): one sorted list per aspect, t 0 … 7. */
export const keyframes: KeyframeTable = {
  landscape: buildKeyframes(NOMINAL_ASPECT.landscape),
  portrait: buildKeyframes(NOMINAL_ASPECT.portrait),
};

/* ----------------------------------------------------------------------------------------------------------------- */
/* Spline                                                                                                             */

export interface CameraPath {
  readonly frames: readonly Keyframe[];
  /** knot parameters */
  readonly ts: Float64Array;
  /** per-knot tangents (units per t), xyz for positions then xyz for targets */
  readonly mPos: Float64Array;
  readonly mTgt: Float64Array;
}

export interface PathSample {
  position: Vector3;
  target: Vector3;
  fov: number;
}

/** Fritsch–Carlson monotone tangents for one component sampled at knots `ts`. */
function monotoneTangents(ts: Float64Array, values: Float64Array, out: Float64Array, stride: number, offset: number): void {
  const n = ts.length;
  if (n === 1) {
    out[offset] = 0;
    return;
  }
  const delta = new Float64Array(n - 1);
  for (let k = 0; k < n - 1; k++) delta[k] = (values[k + 1] - values[k]) / Math.max(1e-9, ts[k + 1] - ts[k]);
  const m = new Float64Array(n);
  m[0] = delta[0];
  m[n - 1] = delta[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  for (let k = 0; k < n - 1; k++) {
    if (delta[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / delta[k];
    const b = m[k + 1] / delta[k];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[k] = tau * a * delta[k];
      m[k + 1] = tau * b * delta[k];
    }
  }
  for (let i = 0; i < n; i++) out[i * stride + offset] = m[i];
}

/** Precomputes the spline for a keyframe list (sorted by t, at least one frame). */
export function buildPath(frames: readonly Keyframe[]): CameraPath {
  if (frames.length === 0) throw new Error("buildPath: no keyframes");
  const n = frames.length;
  const ts = new Float64Array(n);
  for (let i = 0; i < n; i++) ts[i] = frames[i].t;
  const mPos = new Float64Array(n * 3);
  const mTgt = new Float64Array(n * 3);
  const comp = new Float64Array(n);
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) comp[i] = frames[i].position[c];
    monotoneTangents(ts, comp, mPos, 3, c);
    for (let i = 0; i < n; i++) comp[i] = frames[i].target[c];
    monotoneTangents(ts, comp, mTgt, 3, c);
  }
  return { frames, ts, mPos, mTgt };
}

function hermite(p0: number, m0: number, p1: number, m1: number, u: number, dt: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * dt * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * dt * m1;
}

/** Evaluates the track at journey parameter `t` (clamped to the table's range) into `out`. */
export function samplePath(path: CameraPath, t: number, out: PathSample): PathSample {
  const { frames, ts, mPos, mTgt } = path;
  const n = frames.length;
  if (!(t > ts[0])) {
    out.position.set(...frames[0].position);
    out.target.set(...frames[0].target);
    out.fov = frames[0].fov ?? DEFAULT_FOV;
    return out;
  }
  if (t >= ts[n - 1]) {
    const f = frames[n - 1];
    out.position.set(...f.position);
    out.target.set(...f.target);
    out.fov = f.fov ?? DEFAULT_FOV;
    return out;
  }
  // segment i: ts[i] <= t < ts[i+1]
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const midI = (lo + hi) >> 1;
    if (ts[midI] <= t) lo = midI;
    else hi = midI;
  }
  const i = lo;
  const a = frames[i];
  const b = frames[i + 1];
  const dt = ts[i + 1] - ts[i];
  const u = (t - ts[i]) / dt;
  out.position.set(
    hermite(a.position[0], mPos[i * 3], b.position[0], mPos[(i + 1) * 3], u, dt),
    hermite(a.position[1], mPos[i * 3 + 1], b.position[1], mPos[(i + 1) * 3 + 1], u, dt),
    hermite(a.position[2], mPos[i * 3 + 2], b.position[2], mPos[(i + 1) * 3 + 2], u, dt),
  );
  out.target.set(
    hermite(a.target[0], mTgt[i * 3], b.target[0], mTgt[(i + 1) * 3], u, dt),
    hermite(a.target[1], mTgt[i * 3 + 1], b.target[1], mTgt[(i + 1) * 3 + 1], u, dt),
    hermite(a.target[2], mTgt[i * 3 + 2], b.target[2], mTgt[(i + 1) * 3 + 2], u, dt),
  );
  const s = u * u * (3 - 2 * u);
  out.fov = (a.fov ?? DEFAULT_FOV) + ((b.fov ?? DEFAULT_FOV) - (a.fov ?? DEFAULT_FOV)) * s;
  return out;
}

const pathCache = new Map<string, CameraPath>();

/** The precomputed track for a live aspect ratio (cached per 0.001 of aspect; the canvas is 100lvh so it rarely changes). */
export function pathFor(aspectRatio: number, box?: HeroBox | null): CameraPath {
  const a = Math.round(aspectRatio * 1000) / 1000;
  const key = `${a.toFixed(3)}|${box ? box.map((v) => v.toFixed(3)).join(",") : "-"}`;
  let path = pathCache.get(key);
  if (!path) {
    path = buildPath(buildKeyframes(a, box));
    if (pathCache.size > 32) pathCache.clear();
    pathCache.set(key, path);
  }
  return path;
}

/** Keyframes for a live aspect ratio (same cache as `pathFor`). */
export function keyframesFor(aspectRatio: number, box?: HeroBox | null): readonly Keyframe[] {
  return pathFor(aspectRatio, box).frames;
}

export function createPathSample(): PathSample {
  return { position: new Vector3(), target: new Vector3(), fov: DEFAULT_FOV };
}
