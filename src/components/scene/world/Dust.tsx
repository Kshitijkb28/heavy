"use client";

/**
 * Dust motes drifting through a lit volume. `count` points inside a box; each is lit only inside the given cone
 * (apex, aim, half angle, reach), so the hero cone and the door wedge each get their own cloud. Additive soft discs.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, type Points, ShaderMaterial, Sphere, UniformsLib, UniformsUtils, Vector3 } from "three";
import type { Vec3 } from "@/lib/contracts";
import { mulberry32 } from "./drives";
import { dustFragment, dustVertex } from "./shaders/dust";
import { TOKENS } from "./materials";

export interface DustProps {
  count: number;
  /** box centre and half extents (metres) */
  center: Vec3;
  extent: Vec3;
  /** the light volume that makes the dust visible */
  cone: { apex: Vec3; aim: Vec3; halfAngle: number; reach: number };
  color?: string;
  intensity?: number;
  /** base point size in CSS px at 6 m */
  size?: number;
  seed?: number;
  visible?: boolean;
  /** per-frame multiplier on `intensity` */
  driver?: (elapsed: number) => number;
}

export function Dust({ count, center, extent, cone, color = TOKENS.mercury, intensity = 1.1, size = 2.2, seed = 3, visible = true, driver }: DustProps) {
  const dpr = useThree((s) => s.viewport.dpr);
  const points = useRef<Points>(null);

  const geometry = useMemo(() => {
    const rand = mulberry32(seed);
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() * 2 - 1) * extent[0];
      pos[i * 3 + 1] = (rand() * 2 - 1) * extent[1];
      pos[i * 3 + 2] = (rand() * 2 - 1) * extent[2];
      seeds[i * 4] = rand() * Math.PI * 2;
      seeds[i * 4 + 1] = 0.6 + rand() * 0.9;
      seeds[i * 4 + 2] = 0.55 + rand() * 0.9;
      seeds[i * 4 + 3] = 0.6 + rand() * 1.8;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    g.boundingSphere = new Sphere(new Vector3(0, 0, 0), Math.hypot(extent[0], extent[1], extent[2]) + 1);
    return g;
  }, [count, extent, seed]);

  const material = useMemo(() => {
    const dir = new Vector3(cone.aim[0] - cone.apex[0], cone.aim[1] - cone.apex[1], cone.aim[2] - cone.apex[2]).normalize();
    return new ShaderMaterial({
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uSize: { value: size },
          uApex: { value: new Vector3(...cone.apex) },
          uDir: { value: dir },
          uCos: { value: Math.cos(cone.halfAngle) },
          uReach: { value: cone.reach },
          uColor: { value: new Color(color) },
          uIntensity: { value: intensity },
        },
      ]),
      vertexShader: dustVertex,
      fragmentShader: dustFragment,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      fog: true,
      toneMapped: false,
    });
  }, [cone, size, color, intensity]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const m = points.current?.material as ShaderMaterial | undefined;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uPixelRatio.value = dpr;
    m.uniforms.uIntensity.value = intensity * (driver ? driver(state.clock.elapsedTime) : 1);
  });

  if (count <= 0) return null;
  return <points ref={points} geometry={geometry} material={material} position={[center[0], center[1], center[2]]} visible={visible} renderOrder={21} />;
}
