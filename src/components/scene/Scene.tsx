"use client";

/**
 * The 3D stage (lazy chunk; docs/DESIGN.md §6, §11). Composition, in render order:
 * frame guard + debug probe + context loss → lights → the hall (with U2's wet floor) → lamp → beacon → hand light →
 * volumes → haze → physics gate (rig, initials, walls) → camera dolly → post (high only). Everything 60 Hz reads
 * `sceneState`; React only re-renders this tree when the quality config or the loop mode changes.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, type Camera, HalfFloatType, type Light, type Scene as ThreeScene, type WebGLRenderer, WebGLRenderTarget } from "three";
import type { Tier, TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { LOOP, useStageLoop } from "@/lib/scene/loop";
import { markStageHidden, markStageRevealed, stageReveal } from "@/lib/scene/reveal";
import { readTierEnv, resolveTierConfig } from "@/lib/tier";
import { useFrameGuard, useQualityConfig } from "@/hooks/useFrameGuard";
import { setHeroHandoff } from "@/components/motion/heroHandoff";
import { CameraRig } from "./CameraRig";
import { ContextLoss, quietThreeDeprecations } from "./ContextLoss";
import { Debug, DebugProbe, registerStatsSource } from "./Debug";
import { Effects } from "./Effects";
import { setStageLive } from "./Poster";
import { createFloorMaterial, syncFloorMaterial, TOKENS } from "./letters/materials";
import { Initials } from "./physics/Initials";
import { PhysicsGate } from "./physics/PhysicsGate";
import { Rig } from "./physics/Rig";
import { allHandles, entrance, physicsStats } from "./physics/rigState";
import { Walls } from "./physics/Walls";
import { Beacon, HandLight, Haze, Lamp, Lights, Volumes, World } from "./world";

// R3F 9.8 constructs THREE.Clock (deprecated in three 0.186) on every canvas; drop exactly those notices.
quietThreeDeprecations();

/** Fog density inside the hall (U4 `Haze` thins it past the door). */
const FOG_DENSITY = 0.045;

/** Layer nothing lives on: the camera looks at it while the shaders compile, so no frame triggers a blocking compile. */
const HIDDEN_LAYER = 31;
/** Give up waiting for the rig and the environment after this long (a failed typeface must not keep the poster up). */
const WARMUP_WAIT_MS = 4000;

/**
 * Links every program the stage will draw with, in the background (`compileAsync`, KHR_parallel_shader_compile). With
 * post on, the scene renders into the composer's half-float target; the frame guard's first rungs drop post (screen path,
 * ACES in the renderer) and then the shadow maps, so those variants are linked too and a demotion only swaps programs.
 */
function compileStageVariants(gl: WebGLRenderer, scene: ThreeScene, camera: Camera, post: boolean): Promise<unknown> {
  const compileCamera = camera.clone();
  compileCamera.layers.set(0);
  const previous = gl.getRenderTarget();
  const target = post ? new WebGLRenderTarget(4, 4, { type: HalfFloatType }) : null;
  const jobs: Promise<unknown>[] = [];
  const compileInto = (rt: WebGLRenderTarget | null) => {
    gl.setRenderTarget(rt);
    try {
      jobs.push(gl.compileAsync(scene, compileCamera, scene));
    } catch (err) {
      jobs.push(Promise.reject(err));
    } finally {
      gl.setRenderTarget(previous);
    }
  };
  compileInto(target);
  if (post) {
    const toneMapping = gl.toneMapping;
    gl.toneMapping = ACESFilmicToneMapping;
    compileInto(null);
    if (gl.shadowMap.enabled) {
      const casters: Light[] = [];
      scene.traverse((o) => {
        const light = o as Light;
        if (light.isLight && light.castShadow) {
          casters.push(light);
          light.castShadow = false;
        }
      });
      gl.shadowMap.enabled = false;
      try {
        compileInto(null);
      } finally {
        gl.shadowMap.enabled = true;
        casters.forEach((light) => (light.castShadow = true));
      }
    }
    gl.toneMapping = toneMapping;
  }
  return Promise.all(jobs).finally(() => target?.dispose());
}

/**
 * Shader warm-up (keeps the load free of long tasks). Profiling showed the load cost is almost all GPU program linking
 * that three waits on synchronously at the first draw of each material. So the whole scene mounts at once (the light
 * set never changes afterwards, which would recompile every lit material), the camera looks at an empty layer, and
 * once the rig's letters and the environment map exist `compileAsync` links every program in the background
 * (KHR_parallel_shader_compile). With post on, the composer mounts first (hidden) and the scene only ever renders into its
 * half-float target, so it is compiled against one.
 * Resolves → the entrance starts, and on its first frame the camera sees the scene and the poster fades.
 */
function useShaderWarmup(post: boolean, composerReady: boolean): boolean {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const [ready, setReady] = useState(false);
  const phase = useRef<"wait" | "compiling" | "reveal" | "done">("wait");
  const waitStart = useRef(0);
  const revealAt = useRef(0);

  useLayoutEffect(() => {
    camera.layers.set(HIDDEN_LAYER);
    markStageHidden();
    return () => {
      camera.layers.set(0);
      markStageHidden();
    };
  }, [camera]);

  useFrame(() => {
    const now = performance.now();
    // reveal on the frame the entrance has begun (letters at the rail), not one frame earlier with them at rest
    if (phase.current === "reveal") {
      if (entrance.started || now - revealAt.current > 600) {
        phase.current = "done";
        camera.layers.set(0);
        markStageRevealed(now);
        setStageLive(true);
      }
      return;
    }
    if (phase.current !== "wait") return;
    if (!waitStart.current) waitStart.current = now;
    const names = allHandles().filter((h) => h.group === "name");
    const rigReady = names.length >= 15 && names.every((h) => h.mesh);
    if (!(rigReady && scene.environment && composerReady) && now - waitStart.current < WARMUP_WAIT_MS) return;
    phase.current = "compiling";
    const job = compileStageVariants(gl, scene, camera, post);
    const finish = () => {
      phase.current = "reveal";
      revealAt.current = performance.now();
      setReady(true);
    };
    job.then(finish, finish);
  });

  return ready;
}

/** True when no rigid body needs simulating (kinematic letters before the physics chunk count as asleep). */
function bodiesAsleep(): boolean {
  // only consulted for the half-rate decision, which needs 8 s of idle first: skip the wasm calls until then
  if (sceneState.idleMs < LOOP.halfAfterMs) return false;
  if (sceneState.physics !== "ready") return true;
  for (const h of allHandles()) {
    try {
      if (h.body && !h.body.isSleeping()) return false;
    } catch {
      // a body removed by a remount in this very frame: ignore it
    }
  }
  return true;
}

function SceneContents({ base, onRemount }: { base: TierConfig; onRemount: () => void }) {
  const cfg = useFrameGuard(base);
  const loop = useStageLoop({ bodiesAsleep });
  const floor = useMemo(() => createFloorMaterial(), []);
  const [composerReady, setComposerReady] = useState(false);
  const onComposerReady = useCallback(() => setComposerReady(true), []);
  const ready = useShaderWarmup(cfg.post, !cfg.post || composerReady);
  const handoffRef = useRef(false);

  useEffect(() => () => floor.dispose(), [floor]);

  useEffect(() => {
    const offs = [registerStatsSource("bodies", () => physicsStats.bodies), registerStatsSource("physicsMs", () => Math.round(physicsStats.stepMs * 100) / 100)];
    return () => {
      offs.forEach((off) => off());
      setStageLive(false);
    };
  }, []);

  useFrame((state) => {
    syncFloorMaterial(floor, state.clock.elapsedTime);
    // the DOM h1 fades while the iron letters drop into its place (DESIGN.md §4 "Entrance"); a skipped entrance hands
    // over through `sceneState.entered`, which U7's poll picks up
    if (!handoffRef.current && stageReveal.at > 0 && entrance.started && !entrance.skipped) {
      handoffRef.current = true;
      setHeroHandoff(true);
    }
  });

  return (
    <>
      <DebugProbe />
      <ContextLoss onRemount={onRemount} />
      <Lights cfg={cfg} />
      <World cfg={cfg} floorMaterial={floor} />
      <Lamp cones={cfg.cones} />
      <Beacon cfg={cfg} />
      <HandLight />
      <Volumes cfg={cfg} />
      <Haze />
      <PhysicsGate paused={!loop.active || loop.mode === "demand"}>
        {/* the drop and the physics chunk wait for the compiled scene, so the visitor sees the entrance */}
        <Rig entrance={ready} curveSegments={cfg.curveSegments} reflections={cfg.reflections} anisotropy={cfg.anisotropy} castShadow={cfg.shadows} />
        <Initials curveSegments={cfg.curveSegments} reflections={cfg.reflections} anisotropy={cfg.anisotropy} castShadow={cfg.shadows} />
        {ready && <Walls />}
      </PhysicsGate>
      <CameraRig />
      <Effects cfg={base} onReady={onComposerReady} />
    </>
  );
}

export default function Scene({ tier }: { tier: Tier }) {
  // the tier is resolved on the client before this chunk is requested, so reading the device here is safe
  const base = useMemo(() => resolveTierConfig(tier, readTierEnv()), [tier]);
  const cfg = useQualityConfig(base) ?? base;
  const [canvasKey, setCanvasKey] = useState(0);

  return (
    <>
      <Canvas
        key={canvasKey}
        dpr={cfg.dpr}
        gl={{ antialias: cfg.antialias, powerPreference: "high-performance", stencil: false, alpha: false }}
        camera={{ fov: 32, near: 0.1, far: 140, position: [0, 1, 8] }}
        shadows={cfg.shadows ? "percentage" : false}
        style={{ touchAction: "pan-y pinch-zoom" }}
      >
        <color attach="background" args={[TOKENS.void]} />
        <fogExp2 attach="fog" args={[TOKENS.void, FOG_DENSITY]} />
        <SceneContents base={base} onRemount={() => setCanvasKey((k) => k + 1)} />
      </Canvas>
      <Debug />
    </>
  );
}
