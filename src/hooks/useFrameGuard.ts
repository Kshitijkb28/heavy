"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { create } from "zustand";
import type { Light, Object3D, WebGLRenderer } from "three";
import type { TierConfig } from "@/lib/contracts";
import { emitScene } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { stageReveal } from "@/lib/scene/reveal";
import { FrameGuardCore, nextStep, sameConfig, type FrameGuardOptions, type LadderStep } from "@/lib/tier";
import { useUI } from "@/store/ui";

/**
 * Runtime quality (U8). `base` is the detected tier's resolved config (`resolveTierConfig`), `config` the override the
 * ladder wrote (null until the first step). Readers take `config ?? base` (`qualityConfig()` / `useQualityConfig()`).
 * Every step also lands in `sceneState.tier`, `html[data-tier]` and, for `mid` / `poster`, `useUI.tier` (so the Stage
 * unmounts the canvas at `poster`). The ladder never promotes; `reset()` exists for the lab and tests only.
 */
export interface QualityState {
  base: TierConfig | null;
  config: TierConfig | null;
  /** rungs taken so far, oldest first */
  steps: LadderStep[];
  setBase: (base: TierConfig) => void;
  /** take the next rung; returns it, or null when the ladder is exhausted */
  demote: () => LadderStep | null;
  reset: () => void;
}

export const useQuality = create<QualityState>((set, get) => ({
  base: null,
  config: null,
  steps: [],
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
  reset: () => set({ config: null, steps: [] }),
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
 * Returns the effective config. Frames are not judged while the loop is not free-running (`frameloop !== "always"`),
 * the page is inactive, or the visitor has been idle for 7 s (U5's half-rate loop starts at 8 s).
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
  // one core per canvas mount (a Strict Mode remount gets a fresh warm-up, which is what we want)
  const coreRef = useRef<FrameGuardCore | null>(null);
  useEffect(() => {
    coreRef.current = new FrameGuardCore(performance.now(), optionsRef.current);
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

  useFrame(() => {
    const core = coreRef.current;
    if (!core) return;
    const now = performance.now();
    // nothing is judged while the warm-up hides the stage or during the first second after the reveal (the drop)
    if (get().frameloop !== "always" || !sceneState.active || sceneState.idleMs > 7000 || stageReveal.at === 0 || now - stageReveal.at < 1000) {
      core.suspend(now);
      return;
    }
    if (core.sample(now)) useQuality.getState().demote();
  });

  return config;
}

/** Component form of `useFrameGuard` for the scene graph: `<FrameGuard cfg={cfg} />`. */
export function FrameGuard({ cfg, options }: { cfg: TierConfig; options?: Partial<FrameGuardOptions> }) {
  useFrameGuard(cfg, options);
  return null;
}
