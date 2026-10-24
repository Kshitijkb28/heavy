"use client";

import { Suspense, lazy, useEffect, type ComponentType } from "react";
import { HalfFloatType } from "three";
import type { TierConfig } from "@/lib/contracts";
import { useQuality, useQualityConfig } from "@/hooks/useFrameGuard";

/**
 * Post chain (DESIGN.md §6, high tier only): EffectComposer (no MSAA; the scene renders to a half-float buffer) →
 * Bloom (mipmap blur, threshold .8, intensity .6) → SMAA → Vignette (.2 / .55) → ChromaticAberration (.0008, radial)
 * → ACES tone mapping (three applies none when it renders into a target, so this is the only tone-mapping stage).
 * `postprocessing` and its bindings are split into their own chunk and fetched only when `post` is on, so mid-tier
 * phones never download them. The composer disappears the moment the ladder drops `post`.
 */
/** Stands in when the post chunk fails to download: report ready (the warm-up must not wait) and drop post via the ladder. */
function NoComposer({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    onReady?.();
    useQuality.getState().demote();
  }, [onReady]);
  return null;
}

const Composer = lazy<ComponentType<{ onReady?: () => void }>>(async () => {
  let mods: [typeof import("@react-three/postprocessing"), typeof import("postprocessing")];
  try {
    mods = await Promise.all([import("@react-three/postprocessing"), import("postprocessing")]);
  } catch {
    return { default: NoComposer };
  }
  const [{ EffectComposer, Bloom, SMAA, Vignette, ChromaticAberration, ToneMapping }, { ToneMappingMode }] = mods;
  const aberration: [number, number] = [0.0008, 0.0008];
  function ComposerPass({ onReady }: { onReady?: () => void }) {
    // the composer exists (and owns the render loop) from its first commit: tell the stage, which waits for it before
    // compiling the scene's render-target programs, so the scene is never drawn to the screen path first
    useEffect(() => {
      onReady?.();
    }, [onReady]);
    return (
      <EffectComposer multisampling={0} frameBufferType={HalfFloatType}>
        <Bloom mipmapBlur luminanceThreshold={0.8} luminanceSmoothing={0.25} intensity={0.6} radius={0.72} levels={6} />
        <SMAA />
        <Vignette offset={0.2} darkness={0.55} />
        <ChromaticAberration offset={aberration} radialModulation modulationOffset={0.35} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    );
  }
  return { default: ComposerPass };
});

export interface EffectsProps {
  /** the stage's resolved config; the quality store's override wins once the ladder has stepped */
  cfg?: TierConfig;
  /** called once the composer is mounted (the stage's shader warm-up waits for it on the high tier) */
  onReady?: () => void;
}

export function Effects({ cfg, onReady }: EffectsProps) {
  const config = useQualityConfig(cfg);
  if (!config?.post) return null;
  return (
    <Suspense fallback={null}>
      <Composer onReady={onReady} />
    </Suspense>
  );
}
