"use client";

/**
 * Drives the scene's FogExp2 density from `sceneState.t` (`fogDensity`): the black haze of the hall thins as the
 * camera passes the door so the lit name reads far and small from Contact. Mount once inside the Canvas (I1); it only
 * touches `scene.fog` when that is a FogExp2.
 */
import { useFrame } from "@react-three/fiber";
import type { FogExp2 } from "three";
import { sceneState } from "@/lib/scene-state";
import { fogDensity } from "./drives";

export function Haze() {
  useFrame((state) => {
    const fog = state.scene.fog as FogExp2 | null;
    if (!fog || !(fog as Partial<FogExp2>).isFogExp2) return;
    const target = fogDensity(sceneState.t);
    if (Math.abs(fog.density - target) > 1e-5) fog.density = target;
  });
  return null;
}
