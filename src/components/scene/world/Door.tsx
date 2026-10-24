"use client";

/**
 * Education / Contact: a 3.2 m steel door in the far wall (z −62), ajar, with light pouring through — a bright plane
 * behind the opening (bloom-friendly), a spotlight raking the floor into the hall and, without post, a glow sprite.
 * The slab swings open on its hinge as the camera pushes through (`doorAngle(t)`); `<Volumes>` adds the light wedge.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { type Group, Object3D, PlaneGeometry } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { box, mergeAll, v3 } from "./build";
import { doorAngle, doorVolumeLevel } from "./drives";
import { DOOR } from "./layout";
import { createEmissiveMaterial, createSteelMaterial, TOKENS } from "./materials";
import { GlowSprite } from "./GlowSprite";

export interface DoorProps {
  cfg: TierConfig;
  glow: boolean;
}

export function Door({ glow }: DoorProps) {
  const hinge = useRef<Group>(null);
  const { x, z, width, height, thickness } = DOOR;

  const frame = useMemo(
    () =>
      mergeAll([
        box(0.14, height + 0.14, 0.26, [x - width / 2 - 0.07, (height + 0.14) / 2, z]),
        box(0.14, height + 0.14, 0.26, [x + width / 2 + 0.07, (height + 0.14) / 2, z]),
        box(width + 0.42, 0.14, 0.26, [x, height + 0.07, z]),
        box(width + 0.42, 0.03, 0.4, [x, 0.015, z]),
      ]),
    [x, z, width, height],
  );
  const slab = useMemo(
    () =>
      mergeAll([
        box(width - 0.02, height - 0.03, thickness, [width / 2, height / 2, 0]),
        box(0.04, 0.22, 0.03, [width - 0.18, height * 0.45, thickness / 2 + 0.02]),
        box(0.16, 0.03, 0.03, [width - 0.24, height * 0.45 + 0.1, thickness / 2 + 0.03]),
      ]),
    [width, height, thickness],
  );
  const lightPlane = useMemo(() => new PlaneGeometry(width + 1.6, height + 1.0), [width, height]);
  const steel = useMemo(() => createSteelMaterial(), []);
  const paint = useMemo(() => {
    const m = createSteelMaterial();
    m.color.set("#1b1e25");
    m.metalness = 0.6;
    m.roughness = 0.66;
    m.envMapIntensity = 0.4;
    return m;
  }, []);
  const emissive = useMemo(() => createEmissiveMaterial(TOKENS.mercury, 1.35), []);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(x + 1.4, 0.2, z + 10);
    return o;
  }, [x, z]);

  useEffect(() => () => frame.dispose(), [frame]);
  useEffect(() => () => slab.dispose(), [slab]);
  useEffect(() => () => lightPlane.dispose(), [lightPlane]);
  useEffect(() => () => steel.dispose(), [steel]);
  useEffect(() => () => paint.dispose(), [paint]);
  useEffect(() => () => emissive.dispose(), [emissive]);

  useFrame(() => {
    if (hinge.current) hinge.current.rotation.y = doorAngle(sceneState.t);
  });
  const glowLevel = useMemo(() => () => doorVolumeLevel(sceneState.t), []);

  return (
    <group>
      <mesh geometry={frame} material={steel} />
      <group ref={hinge} position={[x - width / 2, 0, z]} rotation={[0, DOOR.ajar, 0]}>
        <mesh geometry={slab} material={paint} />
      </group>
      <mesh geometry={lightPlane} material={emissive} position={[x + 0.4, height / 2 + 0.3, z - 0.5]} />
      <spotLight position={[x + 0.1, 1.9, z - 0.05]} target={target} color={TOKENS.mercury} intensity={300} angle={0.46} penumbra={0.5} decay={2} distance={32} />
      <primitive object={target} />
      {glow && <GlowSprite position={v3([x + 0.25, 1.75, z - 0.15])} size={3.4} color={TOKENS.mercury} intensity={0.85} driver={glowLevel} />}
    </group>
  );
}
