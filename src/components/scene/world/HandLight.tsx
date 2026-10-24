"use client";

/**
 * Signature effect 2 — the hand light. On fine pointers a small cold point light rides 0.6 m in front of the pointer's
 * world position (`sceneState.pointerWorld`, written by U3's input layer), raking highlights across the iron. It fades
 * out while the pointer is off the canvas (`pointerNdc` NaN) and is never mounted on coarse-pointer devices.
 */
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { type PointLight, Vector3 } from "three";
import { sceneState } from "@/lib/scene-state";
import { TOKENS } from "./materials";

const FINE = "(pointer: fine)";
export function HandLight() {
  // decided once per mount: a light appearing or vanishing mid-session (hybrid devices switching pointers) would change
  // the light count and recompile every lit material
  const [fine] = useState(() => (typeof window === "undefined" ? false : window.matchMedia(FINE).matches));
  return fine ? <HandLightInner /> : null;
}

const OFFSET = 0.6;
const tmp = new Vector3();

function HandLightInner() {
  const light = useRef<PointLight>(null);
  const smooth = useRef({ on: 0 });

  useFrame((state, delta) => {
    const l = light.current;
    if (!l) return;
    const dt = Math.min(delta, 1 / 30);
    const has = !Number.isNaN(sceneState.pointerNdc[0]) && sceneState.active;
    const k = 1 - Math.exp(-dt * (has ? 14 : 6));
    smooth.current.on += ((has ? 1 : 0) - smooth.current.on) * k;
    l.intensity = 4 * smooth.current.on;
    if (has) {
      const [px, py, pz] = sceneState.pointerWorld;
      tmp.set(state.camera.position.x - px, state.camera.position.y - py, state.camera.position.z - pz).normalize().multiplyScalar(OFFSET);
      tmp.x += px;
      tmp.y += py;
      tmp.z += pz;
      const kp = 1 - Math.exp(-dt * 22);
      l.position.lerp(tmp, kp);
    }
  });

  return <pointLight ref={light} color={TOKENS.mercury} intensity={0} distance={6} decay={2} position={[0, 2.4, 0.6]} />;
}
