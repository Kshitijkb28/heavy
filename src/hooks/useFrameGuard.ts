"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import type { Light, Object3D, WebGLRenderer } from "three";
import type { TierConfig } from "@/lib/contracts";
import { emitScene } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { stageReveal } from "@/lib/scene/reveal";
import { configAfterSteps, FRAME_GUARD_DEFAULTS, FrameGuardCore, nextStep, sameConfig, type FrameGuardOptions, type LadderStep } from "@/lib/tier";
import { useUI } from "@/store/ui";

/**
 * Runtime quality (U8). `base` is the detected tier's resolved config (`resolveTierConfig`), `config` the override the
 * ladder wrote (null until the first step). Readers take `config ?? base` (`qualityConfig()` / `useQualityConfig()`).
 * Every step also lands in `sceneState.tier`, `html[data-tier]` and, for `mid` / `poster`, `useUI.tier` (so the Stage
 * unmounts the canvas at `poster`). The ladder only ever gives one rung back: the guard's own last step, when it bought
 * no speed (`hold`); `reset()` exists for the lab and tests only.
 */
export interface QualityState {
  base: TierConfig | null;
  config: TierConfig | null;
  /** rungs taken so far, oldest first */
  steps: LadderStep[];
  /** the guard settled: frames are paced by the browser or the display, not by the stage (it steps only below ~22 fps) */
  holding: boolean;
  setBase: (base: TierConfig) => void;
  /** take the next rung; returns it, or null when the ladder is exhausted */
  demote: () => LadderStep | null;
  /** mark the guard as holding; with `giveBack` (the step count right after the guard's own last step) that step is
   *  undone when it is still the last one and can be restored as it was (see GIVE_BACK) */
  hold: (giveBack: number | null) => void;
  reset: () => void;
}

/**
 * Rungs that can be given back as they were: their programs were linked at the warm-up and nothing remounts. Not
 * `shadows` (`applyQualityToRenderer` only ever switches the shadow map off), `mid` or `poster` (they change the tier).
 */
const GIVE_BACK: ReadonlySet<LadderStep> = new Set<LadderStep>(["post", "dpr", "reflections", "cones"]);

export const useQuality = create<QualityState>((set, get) => ({
  base: null,
  config: null,
  steps: [],
  holding: false,
  setBase: (base) => {
    const current = get().base;
    if (!current || !sameConfig(current, base)) set({ base });
  },
  demote: () => {
    const state = get();
    const current = state.config ?? state.base;
    if (!current) return null;
    const next = nextStep(current);
    if (!next) return null;
    set({ config: next.config, steps: [...state.steps, next.step] });
    publish(next.config, next.step);
    return next.step;
  },
  hold: (giveBack) => {
    const { base, steps } = get();
    const last = steps.at(-1);
    if (base && giveBack !== null && giveBack === steps.length && last && GIVE_BACK.has(last)) {
      const kept = steps.slice(0, -1);
      set({ holding: true, steps: kept, config: kept.length ? configAfterSteps(base, kept.length) : null });
      return;
    }
    set({ holding: true });
  },
  reset: () => set({ config: null, steps: [], holding: false }),
}));

/** The effective config right now (null before the stage initialised the store). */
export function qualityConfig(state: QualityState = useQuality.getState()): TierConfig | null {
  return state.config ?? state.base;
}

/** Subscribes to the effective config; `base` (when given) is used until the store knows one. */
export function useQualityConfig(base?: TierConfig): TierConfig | null {
  const config = useQuality((s) => s.config);
  const storeBase = useQuality((s) => s.base);
  return config ?? base ?? storeBase;
}

function publish(config: TierConfig, step: LadderStep): void {
  sceneState.tier = config.tier;
  if (typeof document !== "undefined") document.documentElement.dataset.tier = config.tier;
  const ui = useUI.getState();
  if (step === "poster") {
    ui.setTier("low"); // also raises `poster`
    emitScene("poster", { reason: "ladder", step });
  } else if (ui.tier !== config.tier) {
    ui.setTier(config.tier);
  }
}

/**
 * Applies the parts of a config the renderer owns: the pixel ratio and the shadow map. Dropping shadows also clears
 * `castShadow` on every light so materials recompile without shadow sampling instead of reading a stale map.
 */
export function applyQualityToRenderer(ctx: { gl: WebGLRenderer; scene: Object3D; setDpr: (dpr: number) => void }, config: TierConfig): void {
  if (config.tier === "low" || config.dpr <= 0) return; // the stage is about to unmount
  if (Math.abs(ctx.gl.getPixelRatio() - config.dpr) > 1e-3) ctx.setDpr(config.dpr);
  if (!config.shadows && ctx.gl.shadowMap.enabled) {
    ctx.gl.shadowMap.enabled = false;
    ctx.scene.traverse((o) => {
      const light = o as Light;
      if (light.isLight && light.castShadow) light.castShadow = false;
    });
  }
}

/**
 * The frame guard (DESIGN.md §6): inside the canvas, samples every rendered frame, and when the 60-frame rolling mean
 * stays above 22 ms for 2 s takes the next rung of the ladder, applying it to the renderer and the quality store.
 * When a step makes frames no faster, the frame rate is the browser's or the display's (Chrome's Energy Saver and iOS
 * Low Power Mode hold pages at 30 fps), so the step is given back and the guard holds; the poster only comes below
 * ~22 fps. Returns the effective config. Frames are not judged while the loop is not free-running
 * (`frameloop !== "always"`), the page is inactive, or the visitor has been idle for 7 s (U5's half-rate loop starts at 8 s).
 */
export function useFrameGuard(base: TierConfig, options?: Partial<FrameGuardOptions>): TierConfig {
  const get = useThree((s) => s.get);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const setDpr = useThree((s) => s.setDpr);
  const setBase = useQuality((s) => s.setBase);
  const override = useQuality((s) => s.config);
  const config = override ?? base;

  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  // one core per canvas mount (a Strict Mode remount gets a fresh warm-up, which is what we want); a guard that already
  // settled for a frame cap stays settled across a remount (context loss), so it does not take that step again
  const coreRef = useRef<FrameGuardCore | null>(null);
  useEffect(() => {
    const options = optionsRef.current;
    const floorMs = options?.floorMs ?? FRAME_GUARD_DEFAULTS.floorMs;
    coreRef.current = new FrameGuardCore(performance.now(), useQuality.getState().holding ? { ...options, slowMs: floorMs } : options);
    return () => {
      coreRef.current = null;
    };
  }, []);

  useEffect(() => {
    setBase(base);
  }, [base, setBase]);

  useEffect(() => {
    applyQualityToRenderer({ gl, scene, setDpr }, config);
  }, [config, gl, scene, setDpr]);

  // whether the next rung would trade the 3D for the poster, and the step count right after the guard's own last step
  const finalRungRef = useRef(false);
  useEffect(() => {
    finalRungRef.current = nextStep(config)?.step === "poster";
  }, [config]);
  const ownStepRef = useRef<number | null>(null);

  useFrame(() => {
    const core = coreRef.current;
    if (!core) return;
    const now = performance.now();
    // nothing is judged while the warm-up hides the stage or during the first second after the reveal (the drop)
    if (get().frameloop !== "always" || !sceneState.active || sceneState.idleMs > 7000 || stageReveal.at === 0 || now - stageReveal.at < 1000) {
      core.suspend(now);
      return;
    }
    const quality = useQuality.getState();
    if (core.sample(now, finalRungRef.current)) {
      if (quality.demote()) ownStepRef.current = useQuality.getState().steps.length;
    } else if (core.holding && !quality.holding) {
      quality.hold(core.takeUndo() ? ownStepRef.current : null);
    }
  });

  return config;
}

/** Component form of `useFrameGuard` for the scene graph: `<FrameGuard cfg={cfg} />`. */
export function FrameGuard({ cfg, options }: { cfg: TierConfig; options?: Partial<FrameGuardOptions> }) {
  useFrameGuard(cfg, options);
  return null;
}
