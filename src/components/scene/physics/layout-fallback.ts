/**
 * Pure layout maths used until U2's `letters/layout.ts` lands (same contract: `layoutName(rows, aspect)`,
 * `layoutWord(word, origin, scale?)`, `fitScale(aspect)`), plus the hero camera fit the lab and the viewport
 * walls need before U5's `frame.ts` is available. Unit tested. Glyph advances are injected so this stays pure.
 */
import type { Aspect, Vec3 } from "@/lib/contracts";

export interface LetterSlot {
  id: string;
  char: string;
  row: number;
  x: number;
  y: number;
  z: number;
  anchor: Vec3;
  ropeLength: number;
}

export const RAIL_Y = 5.2;
export const ROW_Y: readonly [number, number] = [3.1, 1.7];
/** the second row hangs 0.7 m behind the first so its chains clear the upper letters */
export const ROW_Z: readonly [number, number] = [0, -0.7];
export const LETTER_GAP = 0.12;
/** chain attachment above the glyph centre (world units at scale 1) */
export const ATTACH_Y = 0.5;
/** rows scale about the block centre in portrait */
export const BLOCK_CENTER_Y = 2.4;
export const HERO_FOV_DEG = 32;
export const FIT_LANDSCAPE = 0.72;
export const FIT_PORTRAIT = 0.88;
/** the landscape reference aspect at which the letters are life-size (scale 1) */
export const REF_ASPECT = 1.6;

export type AdvanceOf = (char: string) => number;

export function aspectKind(aspect: number): Aspect {
  return aspect < 1 ? "portrait" : "landscape";
}

/**
 * Aspect bucket the layout is computed for: landscape always lays out at the reference aspect (the letters are
 * life-size), portrait in 0.05 steps, so a window drag does not re-create the bodies every frame.
 */
export function quantiseAspect(aspect: number): number {
  return aspect >= 1 ? REF_ASPECT : Math.round(Math.max(0.2, aspect) * 20) / 20;
}

/**
 * Uniform scale of the hero letters. Landscape: 1. Portrait: the camera keeps its landscape distance, so the
 * rows shrink until the widest spans 88 % of the (narrower) viewport.
 */
export function fitScale(aspect: number): number {
  if (aspect >= 1) return 1;
  const s = (FIT_PORTRAIT / FIT_LANDSCAPE) * (aspect / REF_ASPECT);
  return Math.min(1, Math.max(0.22, s));
}

/** Lay one word out on a row centred at `cx` (x advances left → right, gap between letters). */
function layoutRow(word: string, cx: number, scale: number, advanceOf: AdvanceOf): { char: string; x: number; width: number }[] {
  const chars = [...word];
  const widths = chars.map((c) => Math.max(0.1, advanceOf(c)) * scale);
  const total = widths.reduce((a, b) => a + b, 0) + LETTER_GAP * scale * Math.max(0, chars.length - 1);
  let cursor = cx - total / 2;
  return chars.map((char, i) => {
    const x = cursor + widths[i] / 2;
    cursor += widths[i] + LETTER_GAP * scale;
    return { char, x, width: widths[i] };
  });
}

/** The two hero rows (KSHITIJ / BHARDWAJ): rail at y 5.2, rows at y 3.1 / 1.7, centred at x 0. */
export function layoutName(rows: readonly [string, string], aspect: number, advanceOf: AdvanceOf): LetterSlot[] {
  const s = fitScale(aspect);
  const slots: LetterSlot[] = [];
  rows.forEach((word, row) => {
    const y = BLOCK_CENTER_Y + (ROW_Y[row] - BLOCK_CENTER_Y) * s;
    const z = ROW_Z[row] * s;
    layoutRow(word, 0, s, advanceOf).forEach((l, i) => {
      slots.push({
        id: `name-r${row}-c${i}`,
        char: l.char,
        row,
        x: l.x,
        y,
        z,
        anchor: [l.x, RAIL_Y, z],
        ropeLength: RAIL_Y - (y + ATTACH_Y * s),
      });
    });
  });
  return slots;
}

/** A word hung from the rail with its centre at `origin` (bay plates, project initials). */
export function layoutWord(word: string, origin: Vec3, scale: number, advanceOf: AdvanceOf): LetterSlot[] {
  return layoutRow(word, origin[0], scale, advanceOf).map((l, i) => ({
    id: `${word.toLowerCase()}-c${i}`,
    char: l.char,
    row: 0,
    x: l.x,
    y: origin[1],
    z: origin[2],
    anchor: [l.x, RAIL_Y, origin[2]],
    ropeLength: RAIL_Y - (origin[1] + ATTACH_Y * scale),
  }));
}

/** Horizontal extent of a laid-out block (m), letters' own widths included. */
export function blockWidth(slots: readonly LetterSlot[], scale: number, advanceOf: AdvanceOf): number {
  if (slots.length === 0) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of slots) {
    const half = (Math.max(0.1, advanceOf(s.char)) * scale) / 2;
    min = Math.min(min, s.x - half);
    max = Math.max(max, s.x + half);
  }
  return max - min;
}

export interface HeroFit {
  scale: number;
  /** camera distance from the rig plane so the block spans 72 % (landscape) / 88 % (portrait) of the width */
  distance: number;
  /** half of the visible width at the rig plane */
  halfWidth: number;
  /** half of the visible height at the rig plane */
  halfHeight: number;
}

/** Solve the hero camera distance for a block `width` metres wide (same maths as U5's `fitDistance`). */
export function heroFit(aspect: number, width: number, fovDeg = HERO_FOV_DEG): HeroFit {
  const scale = fitScale(aspect);
  const fraction = aspect < 1 ? FIT_PORTRAIT : FIT_LANDSCAPE;
  const tanHalf = Math.tan((fovDeg * Math.PI) / 360);
  const safeWidth = Math.max(0.5, width);
  const distance = safeWidth / (fraction * 2 * tanHalf * Math.max(0.2, aspect));
  const halfHeight = distance * tanHalf;
  return { scale, distance, halfWidth: halfHeight * aspect, halfHeight };
}
