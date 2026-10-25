"use client";

import { useEffect, type ReactNode } from "react";
import { detectTierWithReason } from "@/lib/tier";
import { sceneState } from "@/lib/scene-state";
import { useUI } from "@/store/ui";
import { SmoothScroll } from "@/components/chrome/SmoothScroll";
import { MotionGate } from "@/components/motion/MotionGate";
import { ScrollWriter } from "@/components/scene/ScrollWriter";

/**
 * Client root (integrator-owned). Resolves the device tier once after mount (never during render), mirrors it into the
 * store, the scene state and `html[data-tier]` (with the reason in `html[data-tier-reason]`), then composes the
 * unit-owned providers: SmoothScroll (U1, Lenis on fine pointers) and MotionGate (U7, GSAP + the `data-js` reveal gate).
 */
export function Providers({ children }: { children: ReactNode }) {
  const setTier = useUI((s) => s.setTier);

  useEffect(() => {
    const { tier, reason } = detectTierWithReason();
    document.documentElement.dataset.tierReason = reason;
    sceneState.tier = tier;
    sceneState.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sceneState.vw = window.innerWidth;
    sceneState.vh = window.innerHeight;
    sceneState.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    sceneState.portrait = sceneState.aspect < 1;
    document.documentElement.dataset.tier = tier;
    setTier(tier);
  }, [setTier]);

  return (
    <SmoothScroll>
      <ScrollWriter />
      <MotionGate>{children}</MotionGate>
    </SmoothScroll>
  );
}
