/**
 * Idle breeze (DESIGN.md §4 "Idle"): a small coherent gust every 4 s keeps the rig swaying while the hero is in
 * view, and stops after 8 s without input so the bodies can sleep and U5's loop can drop to half rate.
 * Pure helpers (unit tested); `HangSystem` applies them.
 */
import type { Vec3 } from "@/lib/contracts";

export const BREEZE_MS = 4000;
export const BREEZE_IDLE_STOP_MS = 8000;

export interface Gust {
  dirX: number;
  dirZ: number;
  /** Δv the gust gives a letter (m/s at scale 1) */
  strength: number;
}

/** Deterministic 0–1 hash (same gust for the same index: reproducible tests, no Math.random in frame code). */
export function hash01(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** The k-th gust: mostly sideways (the camera looks along z, so an x sway reads best), 0.25–0.55 m/s. */
export function gustAt(k: number): Gust {
  const a = hash01(k) * Math.PI * 2;
  return { dirX: Math.cos(a), dirZ: 0.35 * Math.sin(a), strength: 0.25 + 0.3 * hash01(k + 1) };
}

/** Impulse (N·s) for one letter: the gust scaled by its mass and size, with ±20 % per-letter jitter. */
export function gustImpulse(g: Gust, mass: number, scale: number, jitter: number): Vec3 {
  const dv = g.strength * scale * (0.8 + 0.4 * jitter);
  return [mass * dv * g.dirX, mass * dv * 0.15 * jitter, mass * dv * g.dirZ];
}

/** Keyboard push with a direction bias (arrow keys): the bias plus 30 % scatter. */
export function biasedImpulse(dir: Vec3, magnitude: number, rnd: () => number): Vec3 {
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const s = 0.3 * magnitude;
  return [
    (dir[0] / len) * magnitude + (rnd() - 0.5) * s,
    (dir[1] / len) * magnitude + (rnd() - 0.5) * s,
    (dir[2] / len) * magnitude + (rnd() - 0.5) * s,
  ];
}

/** Should the breeze blow now? (hero in view, visitor not idle for too long) */
export function breezeActive(heroVisible: boolean, idleMs: number): boolean {
  return heroVisible && idleMs < BREEZE_IDLE_STOP_MS;
}
