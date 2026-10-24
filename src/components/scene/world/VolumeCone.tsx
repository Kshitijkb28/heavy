"use client";

/**
 * Volumetric light cone: an open cone (apex at `apex`, axis toward `aim`) drawn additively with the cone shader
 * (|N·V| body × apex falloff × drifting 2-octave noise × floor fade), double-sided, no depth write. Lab-measured at
 * ≈ 0.3 ms per screen-filling cone on the phone profile. `driver` returns a per-frame intensity multiplier.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, CylinderGeometry, DoubleSide, type Group, Matrix3, type Mesh, Quaternion, ShaderMaterial, UniformsLib, UniformsUtils, Vector3 } from "three";
import type { Vec3 } from "@/lib/contracts";
import { coneFragment, coneVertex } from "./shaders/cone";
import { TOKENS } from "./materials";

export interface VolumeConeProps {
  /** world (or parent-local) position of the light source */
  apex: Vec3;
  /** the point the axis aims at; the cone ends there unless `length` says otherwise */
  aim: Vec3;
  length?: number;
  /** radius at the far end */
  radius: number;
  color?: string;
  intensity?: number;
  /** world-space noise frequency */
  noiseScale?: number;
  /** metres above y 0 over which the cone fades into the floor */
  floorFade?: number;
  /** how fast the cone fades from the apex toward its far end (power on 0–1) */
  falloff?: number;
  segments?: number;
  /** per-frame multiplier on `intensity` (0–1); read inside useFrame, never subscribed */
  driver?: (elapsed: number) => number;
  visible?: boolean;
}

const DOWN = new Vector3(0, -1, 0);

export function VolumeCone({ apex, aim, length, radius, color = TOKENS.mercury, intensity = 0.5, noiseScale = 0.35, floorFade = 0.5, falloff = 1.3, segments = 28, driver, visible = true }: VolumeConeProps) {
  const group = useRef<Group>(null);
  const mesh = useRef<Mesh>(null);
  const { quaternion, height } = useMemo(() => {
    const dir = new Vector3(aim[0] - apex[0], aim[1] - apex[1], aim[2] - apex[2]);
    const h = length ?? dir.length();
    return { quaternion: new Quaternion().setFromUnitVectors(DOWN, dir.normalize()), height: h };
  }, [apex, aim, length]);

  const geometry = useMemo(() => new CylinderGeometry(radius * 0.03, radius, height, segments, 6, true), [radius, height, segments]);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: UniformsUtils.merge([
          UniformsLib.fog,
          {
            uColor: { value: new Color(color) },
            uIntensity: { value: intensity },
            uTime: { value: 0 },
            uHeight: { value: height },
            uNoiseScale: { value: noiseScale },
            uFloorFade: { value: floorFade },
            uSlope: { value: (radius - radius * 0.03) / height },
            uFalloff: { value: falloff },
            uRot: { value: new Matrix3() },
          },
        ]),
        vertexShader: coneVertex,
        fragmentShader: coneFragment,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        fog: true,
        toneMapped: false,
      }),
    [color, intensity, height, noiseScale, floorFade, radius, falloff],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state) => {
    const m = mesh.current?.material as ShaderMaterial | undefined;
    if (!m) return;
    m.uniforms.uTime.value = state.clock.elapsedTime;
    m.uniforms.uIntensity.value = intensity * (driver ? driver(state.clock.elapsedTime) : 1);
    const obj = mesh.current;
    if (obj) (m.uniforms.uRot.value as Matrix3).setFromMatrix4(obj.matrixWorld);
  });

  return (
    <group ref={group} position={[apex[0], apex[1], apex[2]]} quaternion={quaternion} visible={visible}>
      <mesh ref={mesh} geometry={geometry} material={material} position={[0, -height / 2, 0]} renderOrder={20} frustumCulled />
    </group>
  );
}
