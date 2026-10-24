"use client";

/**
 * The dolly (U5): drives the default camera along the track in `places.ts` from `sceneState.t`. The journey parameter is
 * damped with λ = 4 (DESIGN.md §3) and the spline is evaluated at the damped value, so the camera lags like a dolly on
 * rails and never leaves them (no corner-cutting through the rig or the door frame on the 180° turn). It cuts instead of
 * flying when `ScrollWriter` requests a snap (deep link, restored scroll) and whenever motion is reduced.
 */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { KeyframeTable } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { buildPath, createPathSample, pathFor, samplePath, type CameraPath, type PathSample } from "@/lib/scene/places";
import { cameraSnapSerial } from "@/lib/scene/scroll-map";

/** exponential damping rate of the journey parameter (1/s); time constant 0.25 s */
export const DOLLY_LAMBDA = 4;
/** the damper never integrates more than this per frame (a hidden tab must not teleport the dolly) */
const MAX_DELTA = 1 / 20;

const dolly = { t: 0 };

/** The damped journey parameter the camera is actually at (debug overlay, labs). */
export function getDollyT(): number {
  return dolly.t;
}

export interface CameraRigProps {
  /** keyframes to use instead of `places.ts` (chosen per aspect); default builds the track for the live canvas aspect */
  table?: KeyframeTable;
  /** damping rate (1/s) */
  lambda?: number;
  /** alternative source of t (lab scrubbing); default `sceneState.t` */
  getT?: () => number;
}

export function CameraRig({ table, lambda = DOLLY_LAMBDA, getT }: CameraRigProps) {
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const fixed: CameraPath | null = useMemo(() => (table ? buildPath(aspect < 1 ? table.portrait : table.landscape) : null), [table, aspect]);
  const state = useRef<{ t: number; snapSeen: number; sample: PathSample; path: CameraPath | null; pathAspect: number; boxSeen: number }>({ t: NaN, snapSeen: -1, sample: createPathSample(), path: null, pathAspect: NaN, boxSeen: -1 });

  useFrame(({ camera }, delta) => {
    const s = state.current;
    const target = getT ? getT() : sceneState.t;
    const snap = cameraSnapSerial();
    if (Number.isNaN(s.t) || snap !== s.snapSeen || sceneState.reducedMotion) {
      s.t = target;
      s.snapSeen = snap;
    } else {
      const dt = delta > MAX_DELTA ? MAX_DELTA : delta;
      s.t += (target - s.t) * (1 - Math.exp(-lambda * dt));
      if (Math.abs(target - s.t) < 1e-4) s.t = target;
    }
    dolly.t = s.t;
    // the default track follows the live canvas aspect and the measured DOM h1 box (rebuilt only when either changes)
    if (!fixed && (s.path === null || s.pathAspect !== aspect || s.boxSeen !== sceneState.heroBoxSerial)) {
      s.path = pathFor(aspect, sceneState.heroBox);
      s.pathAspect = aspect;
      s.boxSeen = sceneState.heroBoxSerial;
    }
    const path = fixed ?? s.path!;
    const sample = samplePath(path, s.t, s.sample);
    camera.position.copy(sample.position);
    camera.lookAt(sample.target);
    const pc = camera as PerspectiveCamera;
    if (pc.isPerspectiveCamera && Math.abs(pc.fov - sample.fov) > 1e-3) {
      pc.fov = sample.fov;
      pc.updateProjectionMatrix();
    }
  });

  return null;
}
