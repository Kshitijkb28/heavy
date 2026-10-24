"use client";

/**
 * Signature effect 1 — the beacon. A red spotlight on the mast head turns once every 9 s (spin-up over 1.5 s after
 * mount), with its red volumetric beam and a lens that flares when it faces the camera (and goes dark near the frame
 * edge, where it would be cut in half). Each frame it writes
 * `sceneState.beaconAngle` (rad) and mirrors the phase (0 → 1 per turn) to `--beacon` on `<html>`, throttled to
 * changes > 0.002 so DOM headings and the rail marker can glint when it passes.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, MathUtils, type Mesh, type MeshBasicMaterial, Object3D, Vector3 } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { stageReveal } from "@/lib/scene/reveal";
import { v3 } from "./build";
import { CONES, MAST } from "./layout";
import { createEmissiveMaterial, TOKENS } from "./materials";
import { GlowSprite } from "./GlowSprite";
import { VolumeCone } from "./VolumeCone";

export interface BeaconProps {
  cfg: TierConfig;
  /** seconds to reach full speed after mount (DESIGN.md: the beacon spins up at T + 1.2 s) */
  spinUp?: number;
}

const TWO_PI = Math.PI * 2;
const BEAM_AIM: readonly [number, number, number] = [CONES.beam.length, -CONES.beam.drop, 0];
/** the lens and its flare fade out while the mast head moves from these NDC distances (|x| or |y|) to the frame edge */
const LENS_EDGE_FADE: readonly [number, number] = [0.92, 0.975];

export function Beacon({ cfg, spinUp = 1.5 }: BeaconProps) {
  const rotor = useRef<Group>(null);
  const lens = useRef<Mesh>(null);
  const spin = useRef({ angle: 0, speed: 0, lastPhase: -1 });
  const facing = useRef(0);
  const shown = useRef(1);
  const target = useMemo(() => {
    const o = new Object3D();
    o.position.set(CONES.beam.length * 0.6, -CONES.beam.drop * 0.6, 0);
    return o;
  }, []);
  const lensMaterial = useMemo(() => createEmissiveMaterial(TOKENS.signal, 2.5), []);
  const lensColor = useMemo(() => new Color(TOKENS.signal), []);
  const tmp = useMemo(() => ({ dir: new Vector3(), toCam: new Vector3(), ndc: new Vector3() }), []);
  useEffect(() => () => lensMaterial.dispose(), [lensMaterial]);

  useEffect(() => {
    const root = document.documentElement;
    return () => {
      root.style.removeProperty("--beacon");
    };
  }, []);

  // the DOM glint restyles the whole document on every --beacon write: a desktop flourish, skipped on touch devices
  const glintDom = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const s = spin.current;
    // spins up from the reveal (behind the poster it would finish before anyone sees it)
    if (stageReveal.at > 0) s.speed = spinUp > 0 ? Math.min(1, s.speed + dt / spinUp) : 1;
    const ease = s.speed * s.speed * (3 - 2 * s.speed);
    s.angle = (s.angle + dt * (TWO_PI / MAST.period) * ease) % TWO_PI;
    const rot = rotor.current;
    if (rot) rot.rotation.y = -s.angle;

    sceneState.beaconAngle = s.angle;
    const phase = s.angle / TWO_PI;
    // --beacon lives on <html>: every write restyles the whole document. Only the glint window (0.42 … 0.58, plus the
    // --glint-x ramp 0.40 … 0.60) reads the exact value, so outside it one parked value is written per pass, and inside
    // it the value steps at ~30 Hz instead of every frame.
    const inWindow = glintDom && phase > 0.38 && phase < 0.62;
    const value = inWindow ? phase : phase <= 0.38 ? 0.3 : 0.7;
    if (glintDom && (inWindow ? Math.abs(value - s.lastPhase) > 0.004 : value !== s.lastPhase)) {
      document.documentElement.style.setProperty("--beacon", value.toFixed(3));
      s.lastPhase = value;
    }

    tmp.dir.set(Math.cos(s.angle), 0, Math.sin(s.angle));
    tmp.toCam.set(state.camera.position.x - MAST.head[0], 0, state.camera.position.z - MAST.head[2]).normalize();
    const f = Math.max(0, tmp.dir.dot(tmp.toCam));
    facing.current = f * f * f;
    // a lens cut by the frame edge reads as a glitch, not a light: near the edge the lens goes dark (not invisible, so
    // the warm-up still links its program); the light and the soft beam stay, so the red still sweeps in from off-screen
    const ndc = tmp.ndc.set(MAST.head[0], MAST.head[1], MAST.head[2]).project(state.camera);
    const edge = Math.max(Math.abs(ndc.x), Math.abs(ndc.y));
    shown.current = ndc.z < 1 ? 1 - MathUtils.smoothstep(edge, LENS_EDGE_FADE[0], LENS_EDGE_FADE[1]) : 0;
    const mat = lens.current?.material as MeshBasicMaterial | undefined;
    if (mat) mat.color.copy(lensColor).multiplyScalar((2.5 + 4 * facing.current) * shown.current);
  });

  const flareDriver = useMemo(() => () => (0.3 + 1.1 * facing.current) * shown.current, []);

  return (
    <group position={v3(MAST.head)}>
      <group ref={rotor}>
        <spotLight position={[0.12, 0, 0]} target={target} color={TOKENS.signal} intensity={420} angle={0.5} penumbra={0.9} decay={1.6} distance={34} />
        <primitive object={target} />
        <mesh ref={lens} position={[0.1, 0, 0]} material={lensMaterial}>
          <boxGeometry args={[0.1, 0.22, 0.24]} />
        </mesh>
        {cfg.cones && <VolumeCone apex={[0.16, 0, 0]} aim={BEAM_AIM} radius={CONES.beam.radius} color={TOKENS.signal} intensity={CONES.beam.intensity} noiseScale={0.5} floorFade={0.3} falloff={2.2} segments={20} />}
      </group>
      {!cfg.post && <GlowSprite position={[0, 0, 0]} size={1.1} color={TOKENS.signal} intensity={0.8} driver={flareDriver} />}
    </group>
  );
}
