"use client";

/**
 * Static colliders on the shared fixed body (DESIGN.md §4): the hall floor at y 0, the hall's side walls at
 * x ±12, and invisible walls at the hero viewport edges (sides, ceiling, front, back) so no letter leaves the
 * screen; the viewport walls are rebuilt on resize from the hero camera fit. Renders nothing.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { sceneState } from "@/lib/scene-state";
import { heroVisibleWidth } from "@/lib/scene/places";
import type { RapierModule } from "./loader";
import { usePhysicsModule } from "./PhysicsGate";
import { addStaticColliders, releaseStaticBody, removeStaticColliders, retainStaticBody } from "./statics";

export const HALL_HALF_WIDTH = 12;
export const HALL_LENGTH = 70;
export const RIG_CEILING_Y = 7.6;
export const RIG_FRONT_Z = 2.0;
export const RIG_BACK_Z = -2.6;

export function Walls() {
  const mod = usePhysicsModule();
  const size = useThree((s) => s.size);
  if (!mod) return null;
  // quantised so a window drag does not rebuild the colliders every frame
  const aspect = Math.round((size.width / Math.max(1, size.height)) * 50) / 50;
  return <LiveWalls mod={mod} aspect={aspect} />;
}

function LiveWalls({ mod, aspect }: { mod: RapierModule; aspect: number }) {
  const { useRapier } = mod;
  const { world, rapier } = useRapier();

  useEffect(() => {
    const body = retainStaticBody(world, rapier);
    const C = rapier.ColliderDesc;
    // the side walls sit at the screen edges of the real hero framing (U5 `heroGeometry`), so a thrown letter bounces
    // off the edge of the picture, not off air in the middle of a wide screen
    const hw = Math.max(0.6, heroVisibleWidth(aspect, sceneState.heroBox) / 2 - 0.05);
    const zMid = -HALL_LENGTH / 2 + 5;
    const descs = [
      // floor (top face at y 0) and the hall's side walls
      C.cuboid(HALL_HALF_WIDTH + 30, 0.5, HALL_LENGTH / 2 + 20).setTranslation(0, -0.5, zMid),
      C.cuboid(0.5, 6, HALL_LENGTH / 2 + 10).setTranslation(-(HALL_HALF_WIDTH + 0.5), 6, zMid),
      C.cuboid(0.5, 6, HALL_LENGTH / 2 + 10).setTranslation(HALL_HALF_WIDTH + 0.5, 6, zMid),
      // hero viewport edges: sides, ceiling, front (toward the camera), back
      C.cuboid(0.5, 5, 3).setTranslation(-(hw + 0.5), 4, -0.3),
      C.cuboid(0.5, 5, 3).setTranslation(hw + 0.5, 4, -0.3),
      C.cuboid(hw + 1, 0.5, 3).setTranslation(0, RIG_CEILING_Y + 0.5, -0.3),
      C.cuboid(hw + 1, 5, 0.5).setTranslation(0, 4, RIG_FRONT_Z + 0.5),
      C.cuboid(hw + 1, 5, 0.5).setTranslation(0, 4, RIG_BACK_Z - 0.5),
    ].map((d) => d.setFriction(0.6).setRestitution(0.1));
    const colliders = addStaticColliders(world, body, descs);
    return () => {
      removeStaticColliders(world, colliders);
      releaseStaticBody(world);
    };
  }, [world, rapier, aspect]);

  return null;
}
