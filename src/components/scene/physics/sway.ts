/**
 * Scripted pendulum for the letters before the physics chunk lands (DESIGN.md §4: "Until it lands: scripted
 * kinematic sway + a fake hover spring"). Pure maths, unit tested; `HangSystem` drives it from useFrame.
 *
 * Each letter is a small-angle spherical pendulum of length L (its rope) with two angles: `az` swings along +x,
 * `ax` swings along +z. `r` is the rope extension factor used by the entrance drop (0 → 1 with a bounce).
 */
export interface SwayState {
  ax: number;
  az: number;
  wx: number;
  wz: number;
  r: number;
}

export const G = 9.81;
/** viscous damping, s⁻¹ (a swing halves in ≈ 2 s) */
export const SWAY_DAMPING = 0.35;
/** entrance drop: duration, per-letter stagger and the slack with which a letter starts below its anchor (m) */
export const DROP_MS = 900;
export const DROP_STAGGER_MS = 35;
export const DROP_START_M = 0.12;
/** the rig counts as settled this long after the last letter finished its drop */
export const DROP_SETTLE_MS = 300;

export function createSway(): SwayState {
  return { ax: 0, az: 0, wx: 0, wz: 0, r: 1 };
}

/** Semi-implicit Euler step of both pendulum axes. */
export function stepSway(s: SwayState, dt: number, ropeLength: number, damping = SWAY_DAMPING, g = G): void {
  const k = g / Math.max(0.2, ropeLength);
  s.wx += (-k * Math.sin(s.ax) - damping * s.wx) * dt;
  s.wz += (-k * Math.sin(s.az) - damping * s.wz) * dt;
  s.ax += s.wx * dt;
  s.az += s.wz * dt;
}

/** A horizontal impulse (N·s) on the bob changes its speed by J/m, so its angular rate by J/(m·L). */
export function kickSway(s: SwayState, impulse: readonly [number, number, number], mass: number, ropeLength: number): void {
  const mL = Math.max(0.1, mass) * Math.max(0.2, ropeLength);
  s.wz += impulse[0] / mL;
  s.wx += impulse[2] / mL;
}

/** Offset of the bob from its anchor for the current angles and extension (world units). */
export function swayOffset(s: SwayState, ropeLength: number, out: { x: number; y: number; z: number }): void {
  const sx = Math.sin(s.az);
  const sz = Math.sin(s.ax);
  const cy = Math.sqrt(Math.max(0, 1 - sx * sx - sz * sz));
  const len = ropeLength * s.r;
  out.x = len * sx;
  out.y = -len * cy;
  out.z = len * sz;
}

/** Overshooting ease (≈ CSS `--ease-drop`): the letter dips past its rope length and springs back. */
export function easeOutBack(t: number, overshoot = 1.70158): number {
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

/** Rope extension factor during the entrance drop; 1 once the drop has finished. */
export function dropExtension(elapsedMs: number, ropeLength: number): number {
  if (elapsedMs <= 0) return Math.min(1, DROP_START_M / Math.max(0.2, ropeLength));
  if (elapsedMs >= DROP_MS) return 1;
  const r0 = Math.min(1, DROP_START_M / Math.max(0.2, ropeLength));
  return r0 + (1 - r0) * easeOutBack(elapsedMs / DROP_MS);
}

/** Has the whole rig (n letters, staggered) finished dropping and had time to settle? */
export function dropSettled(elapsedMs: number, letterCount: number): boolean {
  return elapsedMs >= DROP_MS + DROP_STAGGER_MS * Math.max(0, letterCount - 1) + DROP_SETTLE_MS;
}

/**
 * Fake hover spring (fine pointers, kinematic mode): a letter within `radius` of the pointer is pushed away,
 * strongest at the centre. Returns the horizontal impulse to apply (N·s) for this frame.
 */
export function hoverPush(dx: number, dz: number, radius: number, strengthNs: number, dt: number): [number, number] {
  const d = Math.hypot(dx, dz);
  if (d >= radius || d < 1e-4) return [0, 0];
  const f = (strengthNs * (1 - d / radius) * dt) / d;
  return [dx * f, dz * f];
}
