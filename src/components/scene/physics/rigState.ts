/**
 * Module-level runtime state of the hanging-letter system (U3). Plain mutable singletons, written from effects,
 * useFrame and physics-step callbacks only (never during render), so the kinematic → physical hand-off and the
 * Strict-Mode remounts keep continuity: poses, sway phases, the entrance choreography and the contact bus all
 * outlive any one component instance.
 */
import { Quaternion, Vector3, type Object3D } from "three";
import type { RapierRigidBody } from "@react-three/rapier";
import type { Vec3 } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import type { HangController } from "./breakHoist";
import { createSway, type SwayState } from "./sway";

/** Last known pose of one letter, world space. */
export interface LetterPose {
  /** body centre */
  p: Vector3;
  q: Quaternion;
  /** linear / angular velocity (estimated by finite differences in kinematic mode) */
  v: Vector3;
  w: Vector3;
  /** chain attachment point (top of the letter) */
  attach: Vector3;
  /** performance.now() of the last write */
  at: number;
}

/** Everything the input layer, the breeze, the push button and the lab need to drive one letter. */
export interface LetterHandle {
  id: string;
  group: string;
  char: string;
  mass: number;
  scale: number;
  ropeLength: number;
  anchor: Vec3;
  home: Vec3;
  mesh: Object3D | null;
  /** the positioned object: the kinematic group, or the RigidBody's object3D */
  object: Object3D | null;
  /** null before physics is live (kinematic mode) */
  body: RapierRigidBody | null;
  controller: HangController | null;
  /** apply an impulse (N·s, world space); `touch` also resets the hoist idle timer */
  kick: (impulse: Vec3, worldPoint: Vec3 | undefined, touch: boolean) => void;
  /** kinematic-mode drag: nudge the letter toward a world point (pre-physics grabs) */
  drag?: (target: Vector3, dt: number) => void;
  touch: () => void;
}

const handles = new Map<string, LetterHandle>();
export function setHandle(h: LetterHandle): void {
  handles.set(h.id, h);
}
export function deleteHandle(id: string): void {
  handles.delete(id);
}
export function getHandle(id: string): LetterHandle | undefined {
  return handles.get(id);
}
export function allHandles(): LetterHandle[] {
  return [...handles.values()];
}

const poses = new Map<string, LetterPose>();
/** The pose record for a letter (created on first access). */
export function poseOf(id: string): LetterPose {
  let p = poses.get(id);
  if (!p) {
    p = { p: new Vector3(), q: new Quaternion(), v: new Vector3(), w: new Vector3(), attach: new Vector3(), at: 0 };
    poses.set(id, p);
  }
  return p;
}
export function hasPose(id: string): boolean {
  return poses.has(id);
}

const sways = new Map<string, SwayState>();
/** Scripted pendulum state for a letter (kinematic mode), kept across remounts. */
export function swayOf(id: string): SwayState {
  let s = sways.get(id);
  if (!s) {
    s = createSway();
    sways.set(id, s);
  }
  return s;
}

/** Entrance choreography (DESIGN.md §4 "Entrance"): the letters drop from the rail once per page load. */
export const entrance = { started: false, startedAt: 0, done: false, doneAt: 0, skipped: false };

export function beginEntrance(now: number, skip: boolean): void {
  if (entrance.started) return;
  entrance.started = true;
  entrance.startedAt = now;
  entrance.skipped = skip;
  if (skip) finishEntrance(now);
}
export function finishEntrance(now: number): void {
  if (entrance.done) return;
  entrance.done = true;
  entrance.doneAt = now;
  sceneState.entered = true;
}

/** Counters for the lab overlay and U8's `?debug=stats` (read-only for everyone else). */
export const physicsStats = { bodies: 0, stepMs: 0, snapped: 0, hoisting: 0, grabId: null as string | null, contacts: 0 };

/** A contact worth showing: heat pulse + flash sprite (and a rope snap when `kind` is "snap"). */
export interface ContactHit {
  id: string;
  mesh: Object3D | null;
  point: Vector3;
  /** total contact force, N */
  force: number;
  kind: "heat" | "snap";
}
const contactSinks = new Set<(hit: ContactHit) => void>();
export function onContactHit(fn: (hit: ContactHit) => void): () => void {
  contactSinks.add(fn);
  return () => {
    contactSinks.delete(fn);
  };
}
export function reportContact(hit: ContactHit): void {
  physicsStats.contacts++;
  contactSinks.forEach((fn) => fn(hit));
}

/** Test/lab helper: forget every letter (poses, sway phases, entrance). */
export function resetRigState(): void {
  handles.clear();
  poses.clear();
  sways.clear();
  entrance.started = false;
  entrance.startedAt = 0;
  entrance.done = false;
  entrance.doneAt = 0;
  entrance.skipped = false;
  physicsStats.snapped = 0;
  physicsStats.hoisting = 0;
  physicsStats.grabId = null;
  physicsStats.contacts = 0;
}
