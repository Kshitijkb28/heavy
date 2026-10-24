"use client";

/**
 * About — the hanging work lamp: a steel shade on a cord from the ceiling, a scripted two-axis damped pendulum with
 * its own spotlight, so pushing it (pointerdown / tap) swings real light across the floor and wall. Live only while
 * 0.6 < t < 1.6 (`lampLive`); outside that window it hangs still. A slow draught keeps it from looking dead.
 */
import { useEffect, useMemo, useRef } from "react";
import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { DoubleSide, type Group, Object3D, Vector3 } from "three";
import { markInput, sceneState } from "@/lib/scene-state";
import { box, cylinder, mergeAll, v3 } from "./build";
import { lampLive, type PendulumState, stepPendulum } from "./drives";
import { LAMP } from "./layout";
import { createEmissiveMaterial, createSteelMaterial, TOKENS } from "./materials";
import { VolumeCone } from "./VolumeCone";

export interface LampProps {
  /** always simulate (lab); by default the pendulum runs only while the About place is near */
  alwaysLive?: boolean;
  /** draw the volumetric light cone under the shade (TierConfig.cones) */
  cones?: boolean;
}

/** the shade's light falls this far to the floor when the lamp hangs plumb (pivot y − cord − shade) */
const CONE_REACH = LAMP.pivot[1] - LAMP.length - 0.25;

/** the cone belongs to the hero → About stretch; past About the camera looks through it (Experience), so it fades out */
function coneLevel(): number {
  const t = sceneState.t;
  if (t <= 1.45) return 1;
  if (t >= 1.8) return 0;
  const u = (t - 1.45) / 0.35;
  return 1 - u * u * (3 - 2 * u);
}

const L = LAMP.length;

export function Lamp({ alwaysLive = false, cones = true }: LampProps) {
  const pivot = useRef<Group>(null);
  const state = useRef<PendulumState>({ ax: 0.05, az: -0.08, vx: 0, vz: 0 });
  const gl = useThree((s) => s.gl);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(0, -L - 3, 0);
    return o;
  }, []);
  const geometry = useMemo(
    () =>
      mergeAll([
        cylinder(0.012, 0.012, L, 6, [0, -L / 2, 0]),
        cylinder(0.09, 0.09, 0.05, 16, [0, -0.03, 0]),
        cylinder(0.07, 0.07, 0.16, 16, [0, -L + 0.1, 0]),
        cylinder(0.11, 0.44, 0.34, 28, [0, -L - 0.12, 0], undefined, true),
        box(0.02, 0.5, 0.02, [0.38, -L - 0.3, 0]),
        box(0.02, 0.5, 0.02, [-0.38, -L - 0.3, 0]),
      ]),
    [],
  );
  const bulbGeometry = useMemo(() => cylinder(0.06, 0.06, 0.12, 12, [0, -L - 0.2, 0]), []);
  const steel = useMemo(() => {
    const m = createSteelMaterial();
    m.side = DoubleSide;
    return m;
  }, []);
  const bulb = useMemo(() => createEmissiveMaterial(TOKENS.mercury, 3.2), []);
  const tmp = useMemo(() => ({ bob: new Vector3(), d: new Vector3() }), []);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => bulbGeometry.dispose(), [bulbGeometry]);
  useEffect(() => () => steel.dispose(), [steel]);
  useEffect(() => () => bulb.dispose(), [bulb]);
  useEffect(() => {
    const el = gl.domElement;
    canvas.current = el;
    return () => {
      if (el.style.cursor === "grab") el.style.cursor = "";
      canvas.current = null;
    };
  }, [gl]);

  useFrame((frame, delta) => {
    const g = pivot.current;
    if (!g) return;
    const dt = Math.min(delta, 1 / 30);
    const s = state.current;
    if (alwaysLive || lampLive(sceneState.t)) {
      const e = frame.clock.elapsedTime;
      s.vx += Math.sin(e * 0.37) * 0.004 * dt;
      s.vz += Math.cos(e * 0.29) * 0.004 * dt;
      stepPendulum(s, dt);
    }
    g.rotation.set(s.ax, 0, s.az);
  });

  const push = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const g = pivot.current;
    if (!g) return;
    markInput();
    tmp.bob.set(0, -L, 0).applyQuaternion(g.quaternion).add(g.position);
    tmp.d.set(e.point.x - tmp.bob.x, 0, e.point.z - tmp.bob.z);
    const side = tmp.d.length() > 0.05 ? tmp.d.normalize().multiplyScalar(-0.45) : tmp.d.set(0, 0, 0);
    tmp.d.set(e.ray.direction.x, 0, e.ray.direction.z).normalize().multiplyScalar(0.55).add(side).normalize();
    const kick = 1.35;
    state.current.vz += tmp.d.x * kick;
    state.current.vx -= tmp.d.z * kick;
  };

  return (
    <group ref={pivot} name="lamp-pivot" position={v3(LAMP.pivot)}>
      <mesh
        geometry={geometry}
        material={steel}
        onPointerDown={push}
        onPointerOver={() => {
          const el = canvas.current;
          if (el) el.style.cursor = "grab";
        }}
        onPointerOut={() => {
          const el = canvas.current;
          if (el && el.style.cursor === "grab") el.style.cursor = "";
        }}
      />
      <mesh geometry={bulbGeometry} material={bulb} />
      <spotLight position={[0, -L - 0.2, 0]} target={target} color={TOKENS.mercury} intensity={420} angle={0.6} penumbra={0.6} decay={2} distance={16} />
      {/* the cone swings with the pivot: apex in the shade, axis down the cord */}
      {cones && <VolumeCone apex={[0, -L - 0.25, 0]} aim={[0, -L - 0.25 - CONE_REACH, 0]} radius={CONE_REACH * Math.tan(0.52)} intensity={0.17} noiseScale={0.42} floorFade={0.5} segments={24} driver={coneLevel} />}
      <primitive object={target} />
    </group>
  );
}
