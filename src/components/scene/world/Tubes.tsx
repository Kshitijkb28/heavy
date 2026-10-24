"use client";

/**
 * Stack: five fluorescent tubes stepping down the right wall (z −40 … −48), one per skill group. They flicker on in
 * order as `sceneState.t` runs 3.6 → 4.4 (`tubeLevel`), as one instanced mesh with per-instance emission, one steel
 * housing mesh, one point light for the bank and, without post, five glow sprites.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, CylinderGeometry, type InstancedMesh, Matrix4, MeshBasicMaterial, type PointLight } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { box, mergeAll } from "./build";
import { tubeLevel } from "./drives";
import { HALL, TUBE, TUBES } from "./layout";
import { createSteelMaterial, TOKENS } from "./materials";
import { GlowSprite } from "./GlowSprite";

export interface TubesProps {
  cfg: TierConfig;
  /** draw glow sprites (no Bloom on this tier) */
  glow: boolean;
}

const COUNT = TUBES.length;

export function Tubes({ glow }: TubesProps) {
  const inst = useRef<InstancedMesh>(null);
  const light = useRef<PointLight>(null);
  const levels = useRef<Float32Array>(new Float32Array(COUNT));
  const shown = useRef<Float32Array>(new Float32Array(COUNT).fill(-1));

  const housing = useMemo(
    () =>
      mergeAll(
        TUBES.flatMap((t) => [
          box(0.14, 0.1, TUBE.length + 0.2, [HALL.xMax - 0.07, t.y + 0.09, t.z]),
          box(0.05, 0.08, 0.06, [HALL.xMax - 0.1, t.y, t.z - TUBE.length / 2 - 0.02]),
          box(0.05, 0.08, 0.06, [HALL.xMax - 0.1, t.y, t.z + TUBE.length / 2 + 0.02]),
        ]),
      ),
    [],
  );
  const steel = useMemo(() => createSteelMaterial(), []);
  const tube = useMemo(() => new CylinderGeometry(TUBE.radius, TUBE.radius, TUBE.length, 10, 1).rotateX(Math.PI / 2), []);
  const emissive = useMemo(() => new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), []);
  const cold = useMemo(() => new Color(TOKENS.coldTube), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), c: new Color() }), []);

  useEffect(() => () => housing.dispose(), [housing]);
  useEffect(() => () => steel.dispose(), [steel]);
  useEffect(() => () => tube.dispose(), [tube]);
  useEffect(() => () => emissive.dispose(), [emissive]);

  useEffect(() => {
    const mesh = inst.current;
    if (!mesh) return;
    TUBES.forEach((t, i) => {
      tmp.m.makeTranslation(TUBE.x, t.y, t.z);
      mesh.setMatrixAt(i, tmp.m);
      mesh.setColorAt(i, tmp.c.setScalar(0.04));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    shown.current.fill(-1);
  }, [tmp]);

  useFrame((state) => {
    const mesh = inst.current;
    if (!mesh) return;
    const t = sceneState.t;
    const e = state.clock.elapsedTime;
    let sum = 0;
    let dirty = false;
    for (let i = 0; i < COUNT; i++) {
      const level = tubeLevel(t, i);
      levels.current[i] = level;
      sum += level;
      const hum = 1 - 0.035 * (0.5 + 0.5 * Math.sin(e * 41 + i * 1.7));
      const v = 0.04 + 2.3 * level * hum;
      if (Math.abs(v - shown.current[i]) > 0.004) {
        tmp.c.copy(cold).multiplyScalar(v);
        mesh.setColorAt(i, tmp.c);
        shown.current[i] = v;
        dirty = true;
      }
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (light.current) light.current.intensity = 110 * (sum / COUNT);
  });

  const drivers = useMemo(() => TUBES.map((_, i) => () => levels.current[i] * 0.9), []);

  return (
    <group>
      <mesh geometry={housing} material={steel} />
      <instancedMesh ref={inst} args={[tube, emissive, COUNT]} frustumCulled={false} />
      <pointLight ref={light} position={[HALL.xMax - 1.6, 3.1, -44]} color={TOKENS.coldTube} intensity={0} distance={18} decay={2} />
      {glow && TUBES.map((t, i) => <GlowSprite key={t.index} position={[TUBE.x - 0.3, t.y, t.z]} size={1.5} color={TOKENS.coldTube} intensity={0.42} driver={drivers[i]} />)}
    </group>
  );
}
