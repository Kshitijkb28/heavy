"use client";

/**
 * An additive, camera-facing radial glow (one quad, one draw call) that stands in for Bloom where there is no post
 * (mid tier). `driver` returns a per-frame multiplier so tubes can flicker and the beacon can flare at the camera.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, type Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils } from "three";
import type { Vec3 } from "@/lib/contracts";
import { glowFragment, glowVertex } from "./shaders/glow";
import { TOKENS } from "./materials";

export interface GlowSpriteProps {
  position: Vec3;
  /** diameter in metres */
  size: number;
  color?: string;
  intensity?: number;
  driver?: (elapsed: number) => number;
  visible?: boolean;
}

let sharedQuad: PlaneGeometry | null = null;
function quad(): PlaneGeometry {
  if (!sharedQuad) sharedQuad = new PlaneGeometry(1, 1);
  return sharedQuad;
}

export function GlowSprite({ position, size, color = TOKENS.mercury, intensity = 1, driver, visible = true }: GlowSpriteProps) {
  const mesh = useRef<Mesh>(null);
  const geometry = useMemo(() => quad(), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: UniformsUtils.merge([UniformsLib.fog, { uSize: { value: size }, uColor: { value: new Color(color) }, uIntensity: { value: intensity } }]),
        vertexShader: glowVertex,
        fragmentShader: glowFragment,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        fog: true,
        toneMapped: false,
      }),
    [size, color, intensity],
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const m = mesh.current?.material as ShaderMaterial | undefined;
    if (m) m.uniforms.uIntensity.value = intensity * (driver ? driver(state.clock.elapsedTime) : 1);
  });

  return <mesh ref={mesh} geometry={geometry} material={material} position={[position[0], position[1], position[2]]} visible={visible} renderOrder={22} frustumCulled={false} />;
}
