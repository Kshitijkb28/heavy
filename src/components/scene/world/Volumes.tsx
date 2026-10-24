"use client";

/**
 * The volumetric layer: the mercury key cone over the rig and the light wedge through the door (≤ 2 large cones), each
 * with its own dust cloud, plus a slim cone under the Projects follow spot. Visibility follows `sceneState.t` (hero
 * volumes while t < 2.6, the initials cone 2.6 → 3.95, door volumes 3.8 → 6, fading as the camera passes the door) so
 * at most two cones are ever drawn; the key cone fades in over 1.2 s after mount (the entrance).
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { stageReveal } from "@/lib/scene/reveal";
import { doorVolumeLevel, initialSpotZ } from "./drives";
import { CONES, DUST, INITIALS, KEY_LIGHT } from "./layout";
import { TOKENS } from "./materials";
import { Dust } from "./Dust";
import { VolumeCone } from "./VolumeCone";

export interface VolumesProps {
  cfg: TierConfig;
}

const KEY_CONE = { apex: KEY_LIGHT.position, aim: KEY_LIGHT.target, halfAngle: KEY_LIGHT.angle + 0.06, reach: 12 } as const;
const DOOR_CONE = { apex: CONES.door.apex, aim: CONES.door.aim, halfAngle: 0.42, reach: 13 } as const;

export function Volumes({ cfg }: VolumesProps) {
  const hero = useRef<Group>(null);
  const door = useRef<Group>(null);
  const proj = useRef<Group>(null);
  const born = useRef(-1);

  useFrame((state) => {
    const t = sceneState.t;
    if (hero.current) hero.current.visible = t < 2.6;
    if (door.current) door.current.visible = t > 3.8 && t < 5.95;
    if (proj.current) {
      proj.current.visible = t > INITIALS.live[0] && t < INITIALS.live[1];
      proj.current.position.setZ(initialSpotZ(t));
    }
    // the key cone fades in from the reveal, not from the hidden mount
    if (born.current < 0 && stageReveal.at > 0) born.current = state.clock.elapsedTime;
  });

  const doorLevel = useMemo(() => () => doorVolumeLevel(sceneState.t), []);

  const entrance = useMemo(
    () => (elapsed: number) => {
      if (born.current < 0) return 0;
      const u = Math.min(1, (elapsed - born.current) / 1.2);
      // in portrait the camera sits inside the key cone's footprint: a full-strength cone washes the whole view grey
      return u * u * (3 - 2 * u) * (sceneState.portrait ? 0.35 : 1);
    },
    [],
  );

  const heroDust = Math.round(cfg.dust * DUST.hero.share);
  const doorDust = Math.round(cfg.dust * DUST.door.share);

  return (
    <>
      <group ref={hero}>
        {cfg.cones && <VolumeCone apex={CONES.key.apex} aim={CONES.key.aim} radius={CONES.key.radius} color={TOKENS.mercury} intensity={CONES.key.intensity} noiseScale={0.32} floorFade={0.6} driver={entrance} />}
        {heroDust > 0 && <Dust count={heroDust} center={DUST.hero.center} extent={DUST.hero.extent} cone={KEY_CONE} seed={5} />}
      </group>
      <group ref={proj} visible={false}>
        {cfg.cones && <VolumeCone apex={CONES.initial.apex} aim={CONES.initial.aim} radius={CONES.initial.radius} color={TOKENS.mercury} intensity={CONES.initial.intensity} noiseScale={0.4} floorFade={0.5} segments={20} />}
      </group>
      <group ref={door}>
        {cfg.cones && <VolumeCone apex={CONES.door.apex} aim={CONES.door.aim} radius={CONES.door.radius} color={TOKENS.mercury} intensity={CONES.door.intensity} noiseScale={0.3} floorFade={0.4} driver={doorLevel} />}
        {doorDust > 0 && <Dust count={doorDust} center={DUST.door.center} extent={DUST.door.extent} cone={DOOR_CONE} seed={9} intensity={0.9} driver={doorLevel} />}
      </group>
    </>
  );
}
