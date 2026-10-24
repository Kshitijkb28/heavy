/**
 * Break / hoist (DESIGN.md §4): rope tension or a hard contact snaps a letter's chain; after 6 s without
 * interaction a kinematic hoist winches it home and the rope re-attaches.
 *
 * The rope is modelled in two layers: a soft spring–damper along the chain (so drops and throws catch with a
 * visible bounce instead of a rigid jerk) and a hard Rapier rope joint 20 cm longer than the chain (the yank
 * that stops a violent throw). Tension is estimated from the pendulum state — `m·(g·cosθ + v_t²/L)` while taut,
 * plus the catch impulse `m·Δv_r/τ` when a slack chain comes taut — and compared with 1.4 × the letter's weight.
 * Pure functions first (unit tested), then the per-letter `HangController` that drives a Rapier body.
 */
import { Quaternion, Vector3 } from "three";
import type { RapierContext, RapierRigidBody } from "@react-three/rapier";
import type { ImpulseJoint, World } from "@dimforge/rapier3d-compat";
import type { Vec3 } from "@/lib/contracts";

/** the rapier namespace as `useRapier().rapier` hands it out */
export type RapierApi = RapierContext["rapier"];

export const G = 9.81;
/**
 * rope tension / weight above which the chain snaps. DESIGN.md said 1.4, but tension = m(g + v²/L) passes 1.4 × weight
 * at ~2.5 m/s on the 1.6 m ropes — any push snapped the name. 3.2 needs a fling: ≈ 5.9 m/s (1.6 m) / 8.1 m/s (3.0 m).
 */
export const SNAP_FACTOR = 3.2;
/** chain compliance (s): converts the radial speed absorbed by a catch into an equivalent sustained force */
export const CHAIN_COMPLIANCE_S = 0.25;
/** contact force / weight that lights the heat pulse + flash (≈ 1 m/s clangs between 12 kg letters; touches stay dark) */
export const CONTACT_HEAT_FACTOR = 6;
/** contact force / weight that snaps the hit letter's rope outright (a violent hit, ≈ 5 m/s; a push's clangs stay below) */
export const CONTACT_SNAP_FACTOR = 30;
export const HOIST_IDLE_MS = 6000;
/** no snapping right after a rope is (re)attached: a hand-off or a rebuild may start with the rope stretched */
export const ATTACH_GRACE_MS = 400;
export const HOIST_MS = 1200;
/** no snapping while the entrance drop is still bouncing */
export const ENTRANCE_GRACE_MS = 800;
/** soft rope: stiffness per kg (ω = √200 ≈ 14 rad/s → a 0.45 s bounce) and damping ratio */
export const ROPE_STIFFNESS_PER_KG = 200;
export const ROPE_DAMPING_RATIO = 0.35;
/** the hard rope joint sits this much beyond the chain length */
export const ROPE_HARD_SLACK = 0.2;
/** sleeping or barely-moving bodies are not evaluated */
const EPS = 1e-6;

/** Static sag of the soft rope under the letter's own weight (m) — independent of mass. */
export function ropeSag(): number {
  return G / ROPE_STIFFNESS_PER_KG;
}

/** Soft rope force (N) pulling the attachment point toward the anchor; a rope never pushes. */
export function softRopeForce(stretch: number, vRadialOut: number, mass: number): number {
  if (stretch <= 0) return 0;
  const k = ROPE_STIFFNESS_PER_KG * mass;
  const c = 2 * ROPE_DAMPING_RATIO * Math.sqrt(k * mass);
  return Math.max(0, k * stretch + c * vRadialOut);
}

export interface RopeSample {
  mass: number;
  ropeLength: number;
  /** verticality of the rope: 1 = hanging straight down, 0 = horizontal */
  cosTheta: number;
  /** tangential speed of the attachment point (m/s) */
  vTangential: number;
  /** outward radial speed of the attachment point before this step (m/s) */
  vRadialOut: number;
  wasTaut: boolean;
  isTaut: boolean;
}

/** Estimated rope tension (N): the larger of the sustained pendulum tension and the catch impulse. */
export function ropeTension(s: RopeSample): number {
  const sustained = s.isTaut ? s.mass * (G * Math.max(0, s.cosTheta) + (s.vTangential * s.vTangential) / Math.max(0.2, s.ropeLength)) : 0;
  const catching = !s.wasTaut && s.isTaut && s.vRadialOut > 0 ? (s.mass * s.vRadialOut) / CHAIN_COMPLIANCE_S : 0;
  return Math.max(sustained, catching);
}

export function shouldSnap(tension: number, mass: number, factor = SNAP_FACTOR): boolean {
  return tension > factor * mass * G;
}

/** Classify a contact by its total force relative to the letter's weight. */
export function contactClass(force: number, mass: number): "none" | "heat" | "snap" {
  const w = mass * G;
  if (force > CONTACT_SNAP_FACTOR * w) return "snap";
  if (force > CONTACT_HEAT_FACTOR * w) return "heat";
  return "none";
}

export function easeOutCubic(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function hoistProgress(now: number, startedAt: number, duration = HOIST_MS): number {
  return Math.min(1, Math.max(0, (now - startedAt) / duration));
}

/** The hoist lifts first (y leads) and drifts into place: a winch, not a tween. */
export function hoistPosition(from: Vec3, home: Vec3, u: number, out: { x: number; y: number; z: number }): void {
  const uy = easeOutCubic(Math.min(1, u * 1.5));
  const uxz = easeOutCubic(u);
  out.x = from[0] + (home[0] - from[0]) * uxz;
  out.y = from[1] + (home[1] - from[1]) * uy;
  out.z = from[2] + (home[2] - from[2]) * uxz;
}

export function hoistDue(lastTouchAt: number, now: number, grabbed: boolean, idleMs = HOIST_IDLE_MS): boolean {
  return !grabbed && now - lastTouchAt >= idleMs;
}

export interface HangControllerOptions {
  id: string;
  body: RapierRigidBody;
  anchorBody: RapierRigidBody;
  /** world anchor on the rail (the anchor body sits at the origin, so local = world) */
  anchorWorld: Vec3;
  /** attachment point in the letter's local frame (top of the glyph, world units) */
  attachLocal: Vec3;
  ropeLength: number;
  mass: number;
  home: Vec3;
  world: World;
  rapier: RapierApi;
  onSnap?: (id: string) => void;
  onHoist?: (id: string, phase: "start" | "end") => void;
}

const _t = new Vector3();
const _q = new Quaternion();
const _attach = new Vector3();
const _dir = new Vector3();
const _vel = new Vector3();
const _ang = new Vector3();
const _r = new Vector3();
const _com = new Vector3();
const _imp = new Vector3();
const _pos = new Vector3();
const _rot = new Quaternion();
const IDENTITY = new Quaternion();

/** Drives one hanging letter: soft rope, hard joint, snap, hoist. Call `step` from `useBeforePhysicsStep`. */
export class HangController {
  readonly id: string;
  attached = false;
  hoisting = false;
  grabbed = false;
  snapEnabled = true;
  lastTouchAt: number;
  joint: ImpulseJoint | null = null;
  /** performance.now() of the last snap (the broken chain stub swings from it) */
  snappedAt = 0;
  /** diagnostics: last estimated tension (N) */
  tension = 0;
  /** performance.now() of the last attach (snap grace) */
  private attachedAt = -Infinity;
  private wasTaut = true;
  private hoistStartedAt = 0;
  private readonly from = new Vector3();
  private readonly fromQ = new Quaternion();
  private readonly opts: HangControllerOptions;
  private readonly attachLocal: Vector3;
  private readonly anchor: Vector3;

  constructor(opts: HangControllerOptions, now: number) {
    this.opts = opts;
    this.id = opts.id;
    this.lastTouchAt = now;
    this.attachLocal = new Vector3(...opts.attachLocal);
    this.anchor = new Vector3(...opts.anchorWorld);
  }

  /** Create the hard rope joint (chain length + slack). */
  attach(): void {
    if (this.joint) return;
    const { world, rapier, anchorBody, body, anchorWorld, attachLocal, ropeLength } = this.opts;
    const data = rapier.JointData.rope(
      ropeLength + ROPE_HARD_SLACK,
      { x: anchorWorld[0], y: anchorWorld[1], z: anchorWorld[2] },
      { x: attachLocal[0], y: attachLocal[1], z: attachLocal[2] },
    );
    this.joint = world.createImpulseJoint(data, anchorBody, body, true);
    this.attached = true;
    this.wasTaut = true;
    this.attachedAt = performance.now();
  }

  /** Remove the joint: the letter is a free body until it is hoisted. */
  detach(now: number, silent = false): void {
    const { world } = this.opts;
    if (this.joint && world.getImpulseJoint(this.joint.handle)) world.removeImpulseJoint(this.joint, true);
    this.joint = null;
    const was = this.attached;
    this.attached = false;
    this.lastTouchAt = now;
    this.snappedAt = now;
    if (was && !silent) this.opts.onSnap?.(this.id);
  }

  touch(now: number): void {
    this.lastTouchAt = now;
  }

  setGrabbed(grabbed: boolean, now: number): void {
    this.grabbed = grabbed;
    this.lastTouchAt = now;
  }

  /** Contact with another body: heat, or a snap when the hit is hard. Returns the class for the caller. */
  contact(force: number, now: number): "none" | "heat" | "snap" {
    const cls = contactClass(force, this.opts.mass);
    if (cls === "none") return cls;
    this.lastTouchAt = now;
    if (cls === "snap" && this.attached && this.snapEnabled && !this.hoisting) this.detach(now);
    return cls;
  }

  /** One physics step (before the world steps). */
  step(now: number, dt: number): void {
    const { body, mass, ropeLength, home } = this.opts;
    if (this.hoisting) {
      const u = hoistProgress(now, this.hoistStartedAt);
      hoistPosition([this.from.x, this.from.y, this.from.z], home, u, _pos);
      _rot.copy(this.fromQ).slerp(IDENTITY, easeOutCubic(u));
      body.setNextKinematicTranslation(_pos);
      body.setNextKinematicRotation(_rot);
      if (u >= 1) this.finishHoist(now);
      return;
    }
    if (!this.attached) {
      if (hoistDue(this.lastTouchAt, now, this.grabbed)) this.startHoist(now);
      return;
    }
    if (body.isSleeping()) {
      this.wasTaut = true;
      return;
    }
    const t = body.translation();
    const r = body.rotation();
    _t.set(t.x, t.y, t.z);
    _q.set(r.x, r.y, r.z, r.w);
    _attach.copy(this.attachLocal).applyQuaternion(_q).add(_t);
    _dir.copy(_attach).sub(this.anchor);
    const d = _dir.length();
    if (d < EPS) return;
    _dir.multiplyScalar(1 / d);
    const lv = body.linvel();
    const av = body.angvel();
    const com = body.worldCom();
    _com.set(com.x, com.y, com.z);
    _vel.set(lv.x, lv.y, lv.z);
    _ang.set(av.x, av.y, av.z);
    _r.copy(_attach).sub(_com);
    _vel.add(_ang.cross(_r));
    const vRadial = _vel.dot(_dir);
    const vTangential = Math.sqrt(Math.max(0, _vel.lengthSq() - vRadial * vRadial));
    const restLen = ropeLength - ropeSag();
    const stretch = d - restLen;
    const isTaut = stretch > -0.02;
    this.tension = ropeTension({ mass, ropeLength, cosTheta: -_dir.y, vTangential, vRadialOut: vRadial, wasTaut: this.wasTaut, isTaut });
    if (this.snapEnabled && !this.grabbed && now - this.attachedAt > ATTACH_GRACE_MS && shouldSnap(this.tension, mass)) {
      this.wasTaut = isTaut;
      this.detach(now);
      return;
    }
    // size the rope by the body's actual mass: the collider's mass reaches the body only at the next world step, and a
    // 12 kg impulse on the stale density mass would launch the letter
    const bodyMass = body.mass();
    const f = softRopeForce(stretch, vRadial, bodyMass > 1e-3 ? bodyMass : mass);
    if (f > 0) {
      _imp.copy(_dir).multiplyScalar(-f * dt);
      body.applyImpulseAtPoint(_imp, _attach, false);
    }
    this.wasTaut = isTaut;
  }

  startHoist(now: number): void {
    const { body, rapier } = this.opts;
    const t = body.translation();
    const r = body.rotation();
    this.from.set(t.x, t.y, t.z);
    this.fromQ.set(r.x, r.y, r.z, r.w);
    this.hoisting = true;
    this.hoistStartedAt = now;
    body.setBodyType(rapier.RigidBodyType.KinematicPositionBased, true);
    this.opts.onHoist?.(this.id, "start");
  }

  private finishHoist(now: number): void {
    const { body, rapier, home } = this.opts;
    body.setBodyType(rapier.RigidBodyType.Dynamic, true);
    body.setTranslation({ x: home[0], y: home[1], z: home[2] }, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.hoisting = false;
    this.lastTouchAt = now;
    this.attach();
    this.opts.onHoist?.(this.id, "end");
  }

  dispose(): void {
    const { world, body, rapier } = this.opts;
    if (this.joint && world.getImpulseJoint(this.joint.handle)) world.removeImpulseJoint(this.joint, false);
    this.joint = null;
    this.attached = false;
    if (this.hoisting && world.getRigidBody(body.handle)) body.setBodyType(rapier.RigidBodyType.Dynamic, false);
    this.hoisting = false;
  }
}
