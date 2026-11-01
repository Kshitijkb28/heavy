/**
 * The hall, in metres (docs/DESIGN.md §3). Floor at y 0, the hall runs along −z, x spans ±12. Every world object of U4 is
 * placed from these constants so U5 (camera keyframes) and I1 can aim at them without reading component code. The set
 * pieces that stand for content follow the published counts: one initial per project, the two latest companies on the
 * bay plates, one tube per skill group.
 */
import type { Vec3 } from "@/lib/contracts";
import { experience, projects, skills } from "@/data/resume";

export const HALL = {
  xMin: -12,
  xMax: 12,
  /** the floor starts a little behind the hero camera */
  zNear: 10,
  zFar: -70,
  height: 10,
} as const;

/** The hero rig rail: the chains of the name hang from y 5.2 over the two rows at z 0 and −0.7 (U3), so the beam is a
 *  deep box girder centred between them. Half width covers BHARDWAJ on landscape. */
export const RAIL = { y: 5.2, z: -0.35, depth: 1.0, halfWidth: 3.9, hangerX: 3.3, section: 0.16 } as const;

/** Key spotlight (DESIGN.md §4): mercury, 38° cone (19° half angle), penumbra .5, from (0, 7, 4) onto the rig. */
export const KEY_LIGHT = {
  position: [0, 7, 4] as Vec3,
  /* both rows (BHARDWAJ hangs 0.7 m behind and 1.4 m below KSHITIJ) sit inside the hot spot */
  target: [0, 2.1, -0.35] as Vec3,
  angle: (26 * Math.PI) / 180,
  penumbra: 0.55,
  intensity: 1150,
} as const;

/** The beacon mast: a steel pole at (−6, 0, −3), the red light turning on its head at (−6, 4.5, −3), one turn per 9 s. */
export const MAST = { base: [-6, 0, -3] as Vec3, head: [-6, 4.5, -3] as Vec3, period: 9, capRadius: 0.22 } as const;

/** About: the hanging work lamp. Pivot in the ceiling, cord length; the pendulum is live only while 0.6 < t < 1.6. */
export const LAMP = { pivot: [5.5, 7.4, -3] as Vec3, length: 4.0, damping: 0.32, live: [0.6, 1.6] as const } as const;

export interface BayDef {
  id: string;
  /** the iron plate text (merged glyphs) */
  word: string;
  z: number;
}
export const BAY = { width: 4.6, sill: 0.5, height: 3.0, depth: 1.5, plateScale: 0.42, plateY: 2.05 } as const;
/** The widest plate (m): today's longest name, MIND2WEB LLP (2.34 m), at the design scale; longer names are cast smaller, not wider. */
export const PLATE_MAX_WIDTH = 2.4;

/** A company name as the iron plate spells it: capitals, accents dropped, anything the baked typeface lacks (A–Z, 0–9, `. @ - & ' ?`) a space. */
export function plateWord(company: string): string {
  return company
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9.@\-&'? ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The two plates: the two latest different companies, newest first (a promotion is one company); empty when there is one. */
export function bayWords(companies: readonly string[]): [string, string] {
  const words: string[] = [];
  for (const c of companies) {
    const w = plateWord(c);
    if (w && !words.includes(w)) words.push(w);
    if (words.length === 2) break;
  }
  return [words[0] ?? "", words[1] ?? ""];
}

/** Plate scale for a word `width` metres wide at scale 1: the design scale, shrunk so the plate keeps the designed footprint. */
export function plateScaleFor(width: number): number {
  if (!(width > 0)) return BAY.plateScale;
  return Math.min(BAY.plateScale, PLATE_MAX_WIDTH / width);
}

const [bayWord1, bayWord2] = bayWords(experience.map((j) => j.company));
/** Experience: two recessed steel bays in the right wall carrying the two latest companies (the hall has room for two). */
export const BAYS: readonly BayDef[] = [
  { id: "bay-1", word: bayWord1, z: -10 },
  { id: "bay-2", word: bayWord2, z: -16 },
];
/** `t` windows for the bays: fade in from 1.7, hand over at 2.5, fade out by 3.4; the idle bay keeps a faint glow. */
export const BAY_DRIVE = { enter: [1.7, 2.05] as const, cross: [2.35, 2.65] as const, leave: [3.0, 3.4] as const, idle: 0.12 } as const;

export interface TubeDef {
  index: number;
  y: number;
  z: number;
}
/** Stack: fluorescent tubes stacked on the right wall at z −44, one per skill group (top = the first group). */
export const TUBE = { x: HALL.xMax - 0.14, length: 2.4, radius: 0.035, dropPerTube: 0.62, topY: 4.1, z: -44 } as const;
/** The ladder's height: five tubes 0.62 m apart, as designed; other counts spread over the same height. */
const TUBE_SPAN = TUBE.dropPerTube * 4;

/** One tube per skill group, top to bottom; a single tube sits at the ladder's centre. */
export function tubeLayout(count: number): TubeDef[] {
  if (count <= 1) return [{ index: 0, y: TUBE.topY - TUBE_SPAN / 2, z: TUBE.z }];
  return Array.from({ length: count }, (_, index) => ({ index, y: TUBE.topY - (TUBE_SPAN * index) / (count - 1), z: TUBE.z }));
}

/** a ladder on the right wall: one tube per skill group, top = the first group (DESIGN.md §3) */
export const TUBES: readonly TubeDef[] = tubeLayout(skills.length);
/** The tubes flicker on in order while `t` runs 3.6 → 4.4 (DESIGN.md §3). */
export const TUBE_WINDOW = { start: 3.45, end: 3.95 } as const;

/** Education / Contact: the 3.2 m door in the far wall, ajar; it swings open as the camera pushes through (t 5.15 → 5.9). */
export const DOOR = { x: 2.4, z: -62, width: 1.5, height: 3.2, thickness: 0.08, ajar: 0.55, open: 1.45, swing: [5.15, 5.9] as const } as const;

/** Volumetric cones (≤ 2 large on screen at once): the key cone over the rig and the door wedge. */
export const CONES = {
  key: { apex: KEY_LIGHT.position, aim: [0, -0.4, 0.2] as Vec3, radius: 3.9, intensity: 0.2 },
  door: { apex: [DOOR.x, 1.9, DOOR.z - 0.2] as Vec3, aim: [DOOR.x + 1.6, 0.4, DOOR.z + 11] as Vec3, radius: 4.2, intensity: 0.22 },
  beam: { length: 11, radius: 0.95, drop: 1.7, intensity: 0.2 },
  initial: { apex: [2.6, 6.8, 0.9] as Vec3, aim: [2.6, -0.3, 1.2] as Vec3, radius: 1.3, intensity: 0.05 },
} as const;

/**
 * z of each project initial: the designed 6 m spacing (−24 / −30 / −36) for up to three; four to six spread evenly over
 * −21 … −37 (≥ 3.2 m apart), clear of the bays (z −16) and far enough from the tube wall (z −44) that the dolly
 * swinging from the last initial to the tubes keeps 1.5 m from it.
 */
export function initialZs(count: number): number[] {
  if (count <= 3) return [-24, -30, -36].slice(0, Math.max(0, count));
  return Array.from({ length: count }, (_, i) => -21 - (16 * i) / (count - 1));
}

/** Projects: one cold follow spot steps along the initials (one per project) with the sub-stops of t 3 → 4. */
export const INITIALS = { x: 2.6, zs: initialZs(projects.length) as readonly number[], y: 2.6, spot: { x: 2.6, y: 6.8, zOffset: 0.9, intensity: 760, angle: 0.36, penumbra: 0.6 }, live: [2.6, 3.95] as const } as const;

/** Scene haze: FogExp2 density thins as the camera passes the door so the hall reads far and small from Contact. */
export const HAZE = { inside: 0.045, outside: 0.016, swing: [5.2, 6.0] as const } as const;

/** Dust drifts through the two lit volumes; counts split from `TierConfig.dust`. */
export const DUST = {
  hero: { center: [0, 3.2, 1.6] as Vec3, extent: [4.2, 3.4, 4.0] as Vec3, share: 0.62 },
  door: { center: [DOOR.x + 0.8, 1.8, DOOR.z + 4.5] as Vec3, extent: [3.0, 2.2, 5.0] as Vec3, share: 0.38 },
} as const;
