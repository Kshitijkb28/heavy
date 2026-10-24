"use client";

import { useEffect, type RefObject } from "react";
import { sceneState } from "@/lib/scene-state";
import { markerProgress } from "./track";

/**
 * Writes `--rail-p` (0 … 1 from `sceneState.t`, see `markerProgress`) on the element in a rAF loop while `enabled`.
 * The DOM is touched only when the value moves, so an idle page costs one comparison per frame; a hidden tab gets no
 * frames at all. Consumers: the rail marker, the counter ring.
 */
export function useTrackProgress(ref: RefObject<HTMLElement | null>, enabled: boolean): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let raf = 0;
    let last = -1;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const p = markerProgress(sceneState.t);
      if (Math.abs(p - last) < 0.0005) return;
      last = p;
      el.style.setProperty("--rail-p", p.toFixed(4));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, enabled]);
}
