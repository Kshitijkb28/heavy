"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import type { PhysicsStatus, SectionId, Tier } from "@/lib/contracts";
import { getGrabbables } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { type LadderStep } from "@/lib/tier";
import { qualityConfig, useQuality } from "@/hooks/useFrameGuard";
import { useUI } from "@/store/ui";
import { getContextLossStats, loseContext, primeLoseContext, restoreContext } from "./ContextLoss";

/**
 * The snapshot `window.__heavy.stats()` returns and the `?debug=stats` overlay prints. Renderer numbers are the last
 * rendered frame's (`gl.info`, read before the next render), fps an exponential mean over ~1 s. `bodies` comes from a
 * registered "bodies" source (U3/I1: `registerStatsSource("bodies", () => world.bodies.len())`) and otherwise counts
 * the registered grabbables. Extra registered sources are merged in by name (e.g. "physicsMs").
 */
export interface HeavyStats {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  programs: number;
  bodies: number;
  dpr: number;
  t: number;
  tier: Tier;
  steps: LadderStep[];
  post: boolean;
  shadows: boolean;
  reflections: boolean;
  cones: boolean;
  dust: number;
  physics: PhysicsStatus;
  activeSection: SectionId;
  grabId: string | null;
  idleMs: number;
  active: boolean;
  entered: boolean;
  heroVisible: boolean;
  poster: boolean;
  contextLosses: number;
  remounts: number;
  /** true while a `DebugProbe` is mounted inside a canvas */
  probe: boolean;
  sampledAt: number;
  [extra: string]: number | string | boolean | null | LadderStep[];
}

export interface HeavyDebugApi {
  version: 1;
  stats: () => HeavyStats;
  /** take the next ladder rung by hand */
  demote: () => LadderStep | null;
  /** lose / restore the live WebGL context (false without a mounted probe or the extension) */
  loseContext: () => boolean;
  restoreContext: () => boolean;
}

declare global {
  interface Window {
    __heavy?: HeavyDebugApi;
  }
}

type StatsSource = () => number | string | boolean | null;
const sources = new Map<string, StatsSource>();

/** Lets another unit contribute a number to the overlay / `stats()` (e.g. "bodies", "physicsMs"). Returns the unsubscribe. */
export function registerStatsSource(key: string, fn: StatsSource): () => void {
  sources.set(key, fn);
  return () => {
    if (sources.get(key) === fn) sources.delete(key);
  };
}

const renderer = { fps: 0, frameMs: 0, calls: 0, triangles: 0, points: 0, lines: 0, geometries: 0, textures: 0, programs: 0, dpr: 0 };
let probeGl: WebGLRenderer | null = null;
let lastFrameAt = 0;

/** Binds the probe to a renderer: caches the lose-context extension, holds the API, takes over `gl.info` resets. */
function attachProbe(gl: WebGLRenderer): () => void {
  probeGl = gl;
  primeLoseContext(gl);
  const release = acquireApi();
  const autoReset = gl.info.autoReset;
  gl.info.autoReset = false;
  return () => {
    gl.info.autoReset = autoReset;
    if (probeGl === gl) probeGl = null;
    release();
  };
}

export function heavyStats(): HeavyStats {
  const q = useQuality.getState();
  const cfg = qualityConfig(q);
  const ui = useUI.getState();
  const loss = getContextLossStats();
  const stats: HeavyStats = {
    ...renderer,
    bodies: getGrabbables().length,
    t: sceneState.t,
    tier: cfg?.tier ?? sceneState.tier,
    steps: q.steps,
    post: cfg?.post ?? false,
    shadows: cfg?.shadows ?? false,
    reflections: cfg?.reflections ?? false,
    cones: cfg?.cones ?? false,
    dust: cfg?.dust ?? 0,
    physics: sceneState.physics,
    activeSection: sceneState.activeSection,
    grabId: sceneState.grabId,
    idleMs: sceneState.idleMs,
    active: sceneState.active,
    entered: sceneState.entered,
    heroVisible: sceneState.heroVisible,
    poster: ui.poster,
    contextLosses: loss.losses,
    remounts: loss.remounts,
    probe: probeGl !== null,
    sampledAt: lastFrameAt,
  };
  for (const [key, fn] of sources) {
    try {
      const value = fn();
      if (key === "bodies") {
        if (typeof value === "number") stats.bodies = value;
      } else stats[key] = value;
    } catch {
      /* a source that throws is simply absent */
    }
  }
  return stats;
}

/* `window.__heavy` is shared by the overlay and the probe and reference-counted: it stays while either is mounted. */
let api: HeavyDebugApi | null = null;
let apiUsers = 0;
function acquireApi(): () => void {
  apiUsers++;
  if (!api) {
    api = {
      version: 1,
      stats: heavyStats,
      demote: () => useQuality.getState().demote(),
      loseContext: () => (probeGl ? loseContext(probeGl) : false),
      restoreContext: () => (probeGl ? restoreContext(probeGl) : false),
    };
  }
  if (window.__heavy !== api) window.__heavy = api;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    apiUsers--;
    if (apiUsers > 0) return;
    apiUsers = 0;
    if (window.__heavy === api) delete window.__heavy;
    api = null;
  };
}

/**
 * Inside the canvas: samples `gl.info` and the frame time each frame (a few property reads; no allocation) and holds
 * `window.__heavy` while mounted. three resets `gl.info` at the start of every `render()` call, so with the composer
 * (several passes per frame) the counters would only ever show the last fullscreen pass; the probe therefore turns
 * `autoReset` off while mounted and resets the counters itself once per frame, after reading the whole frame's total.
 * Mount it once per canvas; renders nothing.
 */
export function DebugProbe() {
  const gl = useThree((s) => s.gl);

  useEffect(() => attachProbe(gl), [gl]);

  useFrame(() => {
    const now = performance.now();
    if (lastFrameAt) {
      const dt = now - lastFrameAt;
      if (dt > 0 && dt < 1000) {
        renderer.frameMs += (dt - renderer.frameMs) * 0.08;
        renderer.fps = renderer.frameMs > 0 ? 1000 / renderer.frameMs : 0;
      }
    }
    lastFrameAt = now;
    const info = gl.info;
    renderer.calls = info.render.calls;
    renderer.triangles = info.render.triangles;
    renderer.points = info.render.points;
    renderer.lines = info.render.lines;
    renderer.geometries = info.memory.geometries;
    renderer.textures = info.memory.textures;
    renderer.programs = info.programs?.length ?? 0;
    renderer.dpr = gl.getPixelRatio();
    info.reset();
  });

  return null;
}

const k = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const yn = (b: boolean): string => (b ? "on" : "off");

function lines(s: HeavyStats): string[] {
  const steps = s.steps.length ? ` ← ${s.steps.join(" → ")}` : "";
  const extras = Object.keys(s).filter((key) => sources.has(key) && key !== "bodies");
  return [
    `HEAVY ${s.tier}${steps}`,
    `fps ${s.fps.toFixed(0).padStart(3)}   frame ${s.frameMs.toFixed(1)} ms`,
    `calls ${s.calls}   tris ${k(s.triangles)}   pts ${k(s.points)}`,
    `geo ${s.geometries}   tex ${s.textures}   prog ${s.programs}`,
    `bodies ${s.bodies}   physics ${s.physics}`,
    `dpr ${s.dpr}   post ${yn(s.post)}   shadows ${yn(s.shadows)}`,
    `refl ${yn(s.reflections)}   cones ${yn(s.cones)}   dust ${s.dust}`,
    `t ${s.t.toFixed(2)}   ${s.activeSection}   grab ${s.grabId ?? "–"}`,
    `idle ${(s.idleMs / 1000).toFixed(1)} s   active ${yn(s.active)}   entered ${yn(s.entered)}`,
    `ctx lost ${s.contextLosses}   remounts ${s.remounts}   poster ${yn(s.poster)}`,
    ...extras.map((key) => `${key} ${String(s[key])}`),
  ];
}

const noopSubscribe = () => () => {};
const readDebugFlag = (): boolean => new URLSearchParams(window.location.search).get("debug") === "stats";
const readDebugFlagOnServer = (): boolean => false;

const overlayStyle: CSSProperties = {
  position: "fixed",
  top: "calc(var(--header-h, 64px) + 8px)",
  left: "max(8px, env(safe-area-inset-left))",
  zIndex: 80,
  margin: 0,
  padding: "8px 10px",
  maxWidth: "calc(100vw - 16px)",
  overflow: "hidden",
  pointerEvents: "none",
  font: "11px/1.5 var(--font-geist-mono), ui-monospace, Menlo, monospace",
  letterSpacing: "0.02em",
  color: "var(--text, #e8ecf2)",
  background: "rgba(5, 5, 7, 0.82)",
  border: "1px solid var(--seam, rgba(232,236,242,.08))",
  whiteSpace: "pre",
};

export interface DebugProps {
  /** show the overlay without `?debug=stats` (lab routes) */
  force?: boolean;
  /** refresh interval in ms */
  intervalMs?: number;
}

/**
 * DOM side: the `?debug=stats` overlay (fps, draw calls, triangles, bodies, dpr, t, tier + ladder steps, flags), read
 * from the probe's samples at 4 Hz. Always safe to mount: it renders nothing unless the flag (or `force`) is on, and it
 * holds `window.__heavy` even without a canvas so scripts can read `sceneState` on the low tier.
 */
export function Debug({ force = false, intervalMs = 250 }: DebugProps) {
  const flag = useSyncExternalStore(noopSubscribe, readDebugFlag, readDebugFlagOnServer);
  const on = force || flag;
  const [snapshot, setSnapshot] = useState<HeavyStats | null>(null);

  useEffect(() => {
    const release = acquireApi();
    if (!on) return release;
    const id = setInterval(() => setSnapshot(heavyStats()), intervalMs);
    return () => {
      clearInterval(id);
      release();
    };
  }, [on, intervalMs]);

  if (!on || !snapshot) return null;
  return (
    <pre style={overlayStyle} aria-hidden="true" data-debug="stats">
      {lines(snapshot).join("\n")}
    </pre>
  );
}
