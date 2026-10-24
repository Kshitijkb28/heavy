/**
 * Pure parts of the grab (DESIGN.md §4 "Grab / throw"): the touch intent classifier (hold ≥ 180 ms with < 6 px
 * movement, or a horizontal move > 8 px with |dx| > |dy|; a vertical pan is never a grab) and the hand spring
 * (k = 60·m, c = 8·m, capped) that pulls the grab point toward the pointer. Unit tested.
 */
import type { Vec3 } from "@/lib/contracts";

export const HOLD_MS = 180;
export const HOLD_SLOP_PX = 6;
export const HORIZONTAL_PX = 8;
export const SPRING_K_PER_KG = 60;
export const SPRING_C_PER_KG = 8;
/** force cap per kg (≈ 4 g) so a far pointer cannot yank a letter at silly speeds */
export const SPRING_FORCE_CAP_PER_KG = 40;
/** a plain tap nudges with this impulse per kg (N·s/kg) */
export const NUDGE_PER_KG = 0.9;

export type TouchPhase = "pending" | "grab" | "scroll";

/** Where a touch stands after moving (dx, dy) px in `elapsedMs` since it started. */
export function classifyTouchMove(dx: number, dy: number, elapsedMs: number): TouchPhase {
  const dist = Math.hypot(dx, dy);
  if (dist < HOLD_SLOP_PX) return elapsedMs >= HOLD_MS ? "grab" : "pending";
  if (Math.abs(dx) > HORIZONTAL_PX && Math.abs(dx) > Math.abs(dy)) return "grab";
  return "scroll";
}

/** A touch released before the hold time without moving is a tap (nudge). */
export function isTap(dx: number, dy: number, elapsedMs: number): boolean {
  return Math.hypot(dx, dy) < HOLD_SLOP_PX && elapsedMs < HOLD_MS;
}

/**
 * Hand-spring impulse (N·s) for one step: F = k·(target − point) − c·v, |F| ≤ cap, J = F·dt.
 */
export function springImpulse(target: Vec3, point: Vec3, pointVelocity: Vec3, mass: number, dt: number): Vec3 {
  const k = SPRING_K_PER_KG * mass;
  const c = SPRING_C_PER_KG * mass;
  let fx = k * (target[0] - point[0]) - c * pointVelocity[0];
  let fy = k * (target[1] - point[1]) - c * pointVelocity[1];
  let fz = k * (target[2] - point[2]) - c * pointVelocity[2];
  const cap = SPRING_FORCE_CAP_PER_KG * mass;
  const f = Math.hypot(fx, fy, fz);
  if (f > cap) {
    const s = cap / f;
    fx *= s;
    fy *= s;
    fz *= s;
  }
  return [fx * dt, fy * dt, fz * dt];
}

/** Tap nudge: a little lift plus a sideways kick away from where the letter was tapped (`sideSign` ±1). */
export function nudgeImpulse(mass: number, scale: number, sideSign: number): Vec3 {
  const j = NUDGE_PER_KG * mass * scale;
  return [0.6 * j * Math.sign(sideSign || 1), 0.8 * j, -0.3 * j];
}
