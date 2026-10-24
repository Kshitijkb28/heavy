/**
 * Camera framing maths (U5, pure). Shared with the U2/U3 labs and the integrator.
 *
 * Conventions: metres, y up, the hall runs along −z; a camera "looks" down its −z axis with zero roll (world up).
 * NDC: x −1 (left) … +1 (right), y −1 (bottom) … +1 (top).
 */
import type { Aspect, Vec3 } from "@/lib/contracts";

export const DEFAULT_FOV = 32;

/** Fraction of the viewport width the name block spans at the hero stop (DESIGN.md §3). */
export const HERO_FIT: Record<Aspect, number> = { landscape: 0.62, portrait: 0.88 };

const DEG2RAD = Math.PI / 180;

/** Which keyframe table a viewport uses: anything narrower than tall is portrait. */
export function aspectOf(width: number, height: number): Aspect {
  return width / Math.max(1, height) < 1 ? "portrait" : "landscape";
}

/** Half extents of the view frustum at unit distance: tan(fov/2) vertically, × aspect horizontally. */
export function halfExtents(fovDeg: number, aspect: number): { x: number; y: number } {
  const y = Math.tan((fovDeg * DEG2RAD) / 2);
  return { x: y * aspect, y };
}

/** Width (metres) of the view at `distance` in front of the camera. */
export function visibleWidth(distance: number, fovDeg: number, aspect: number): number {
  return 2 * distance * halfExtents(fovDeg, aspect).x;
}

/** Height (metres) of the view at `distance` in front of the camera. */
export function visibleHeight(distance: number, fovDeg: number): number {
  return 2 * distance * halfExtents(fovDeg, 1).y;
}

/**
 * Camera distance at which a block `widthMetres` wide spans `fraction` of the viewport width
 * (DESIGN.md §3: the name block spans 72 % on landscape, 88 % on portrait).
 */
export function fitDistance(widthMetres: number, fovDeg: number, aspect: number, fraction: number): number {
  const half = halfExtents(fovDeg, aspect).x;
  return widthMetres / (2 * half * Math.max(1e-6, fraction));
}

/** Distance at which a block fits both `fractionW` of the width and `fractionH` of the height (the larger of the two). */
export function fitDistanceBox(width: number, height: number, fovDeg: number, aspect: number, fractionW: number, fractionH: number): number {
  const byWidth = fitDistance(width, fovDeg, aspect, fractionW);
  const byHeight = height / (2 * halfExtents(fovDeg, 1).y * Math.max(1e-6, fractionH));
  return Math.max(byWidth, byHeight);
}

export interface NdcPoint {
  x: number;
  y: number;
  /** distance along the view axis; ≤ 0 means behind the camera (x/y are then meaningless) */
  depth: number;
}

/** Where a world point lands on screen for a camera at `position` looking at `target` (zero roll). */
export function projectToNdc(position: Vec3, target: Vec3, point: Vec3, fovDeg: number, aspect: number): NdcPoint {
  // look-at basis as three builds it: z = eye − target, x = up × z, y = z × x
  let zx = position[0] - target[0];
  let zy = position[1] - target[1];
  let zz = position[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl;
  zy /= zl;
  zz /= zl;
  // x = (0,1,0) × z = (zz, 0, −zx)
  let xx = zz;
  let xz = -zx;
  const xl = Math.hypot(xx, xz);
  if (xl < 1e-8) {
    // looking straight up/down: any horizontal basis will do
    xx = 1;
    xz = 0;
  } else {
    xx /= xl;
    xz /= xl;
  }
  // y = z × x
  const yx = zy * xz;
  const yy = zz * xx - zx * xz;
  const yz = -zy * xx;
  const vx = point[0] - position[0];
  const vy = point[1] - position[1];
  const vz = point[2] - position[2];
  const cx = vx * xx + vz * xz;
  const cy = vx * yx + vy * yy + vz * yz;
  const cz = vx * zx + vy * zy + vz * zz;
  const depth = -cz;
  const { x: hx, y: hy } = halfExtents(fovDeg, aspect);
  if (depth <= 1e-9) return { x: 0, y: 0, depth };
  return { x: cx / depth / hx, y: cy / depth / hy, depth };
}

function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * The look-at target that puts `point` at normalised device coordinates `ndc` for a camera at `position`
 * (zero roll). Closed form: pitch from the vertical component, then yaw from the horizontal one. The target is
 * returned at the point's distance so interpolated targets stay at comparable depths between keyframes.
 */
export function solveTargetForNdc(position: Vec3, point: Vec3, ndc: readonly [number, number], fovDeg: number, aspect: number): Vec3 {
  const vx = point[0] - position[0];
  const vy = point[1] - position[1];
  const vz = point[2] - position[2];
  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-6) return [position[0], position[1], position[2] - 1];
  const ux = vx / len;
  const uy = vy / len;
  const uz = vz / len;

  // desired direction of the point in camera space
  const { x: hx, y: hy } = halfExtents(fovDeg, aspect);
  let dx = ndc[0] * hx;
  let dy = ndc[1] * hy;
  let dz = -1;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;

  // pitch θ (about the camera x axis): dy·cosθ − dz·sinθ = uy  ⇔  r·sin(θ + φ) = uy
  const a = dy;
  const b = -dz;
  const r = Math.hypot(a, b) || 1;
  const c = Math.max(-1, Math.min(1, uy / r));
  const phi = Math.atan2(a, b);
  const s = Math.asin(c);
  const t1 = wrapPi(s - phi);
  const t2 = wrapPi(Math.PI - s - phi);
  const theta = Math.abs(t2) < Math.abs(t1) ? t2 : t1;

  // d' = Rx(θ)·d, then yaw ψ (about world y) aligns its horizontal direction with the point's
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const dpx = dx;
  const dpz = dy * st + dz * ct;
  const psi = Math.atan2(ux, uz) - Math.atan2(dpx, dpz);
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);

  // forward = Ry(ψ)·Rx(θ)·(0,0,−1)
  const fx = -ct * sp;
  const fy = st;
  const fz = -ct * cp;
  return [position[0] + fx * len, position[1] + fy * len, position[2] + fz * len];
}
