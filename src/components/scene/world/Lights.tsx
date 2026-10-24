"use client";

/**
 * Base lighting (docs/DESIGN.md §4): the mercury key spotlight over the rig (38° cone, penumbra .5, 1024 PCF-soft
 * shadows on high), a faint hemisphere fill and a once-rendered `Environment` of two Lightformers — an overhead
 * mercury strip and a red side strip — so iron and wet concrete have something to reflect.
 */
import { useEffect, useMemo, useRef } from "react";
import { Environment, Lightformer } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Object3D, type PointLight, type SpotLight } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { v3 } from "./build";
import { initialSpotZ } from "./drives";
import { INITIALS, KEY_LIGHT } from "./layout";
import { TOKENS } from "./materials";

export interface LightsProps {
  cfg: TierConfig;
}

export function Lights({ cfg }: LightsProps) {
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(...KEY_LIGHT.target);
    return o;
  }, []);
  useEffect(
    () => () => {
      target.removeFromParent();
    },
    [target],
  );

  return (
    <>
      <spotLight
        position={v3(KEY_LIGHT.position)}
        target={target}
        color={TOKENS.mercury}
        intensity={KEY_LIGHT.intensity}
        angle={KEY_LIGHT.angle}
        penumbra={KEY_LIGHT.penumbra}
        decay={2}
        distance={0}
        castShadow={cfg.shadows}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={3}
        shadow-camera-near={2}
        shadow-camera-far={18}
      />
      <primitive object={target} />
      <hemisphereLight args={["#1a1d26", "#050507", 0.35]} />
      <InitialSpot />
      <Environment frames={1} resolution={64} environmentIntensity={0.6}>
        <Lightformer form="rect" intensity={3} color={TOKENS.mercury} position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[6, 1.2, 1]} />
        <Lightformer form="rect" intensity={1.6} color={TOKENS.signal} position={[-8, 2.5, -3]} rotation={[0, Math.PI / 2, 0]} scale={[5, 0.5, 1]} />
      </Environment>
    </>
  );
}

/** Projects: a cold follow spot over whichever initial the camera frames (`initialSpotZ`), dark outside 2.6 < t < 3.95. */
function InitialSpot() {
  const light = useRef<SpotLight>(null);
  const fill = useRef<PointLight>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(INITIALS.x, INITIALS.y - 0.3, INITIALS.zs[0] - 0.2);
    return o;
  }, []);
  useFrame((_, delta) => {
    const l = light.current;
    if (!l) return;
    const t = sceneState.t;
    const z = initialSpotZ(t);
    l.position.setZ(z + INITIALS.spot.zOffset);
    target.position.setZ(z - 0.2);
    const on = t > INITIALS.live[0] && t < INITIALS.live[1] ? 1 : 0;
    const k = 1 - Math.exp(-Math.min(delta, 1 / 30) * 6);
    l.intensity += (on * INITIALS.spot.intensity - l.intensity) * k;
    // a low cold fill from the camera side so the initial's face reads, not only its top bevels
    const f = fill.current;
    if (f) {
      f.position.setZ(z + 3.4);
      f.intensity += (on * 52 - f.intensity) * k;
    }
  });
  return (
    <>
      <spotLight ref={light} position={[INITIALS.spot.x, INITIALS.spot.y, INITIALS.zs[0] + INITIALS.spot.zOffset]} target={target} color={TOKENS.mercury} intensity={0} angle={INITIALS.spot.angle} penumbra={INITIALS.spot.penumbra} decay={2} distance={14} />
      <pointLight ref={fill} position={[INITIALS.x - 2.4, INITIALS.y + 0.5, INITIALS.zs[0] + 3.4]} color={TOKENS.mercury} intensity={0} distance={9} decay={2} />
      <primitive object={target} />
    </>
  );
}
