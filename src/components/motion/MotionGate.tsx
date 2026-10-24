"use client";

/**
 * The motion gate (U7). Mounted once by Providers around the page. It loads GSAP lazily and flips `html[data-js]` from
 * "pending" (set before first paint by the layout) to "ready" as soon as the chunk lands, or after 1.8 s regardless;
 * under `html[data-motion="calm"]` it opens at once. It also runs the weight-drop reveals on `main` (every hold is
 * released immediately in calm mode or if GSAP never arrives) and the hero handoff attribute. Renders its children as is.
 */
import { useEffect, type ReactNode } from "react";
import { GSAP_GATE_TIMEOUT_MS, loadGsap } from "@/lib/gsap";
import { useHeroHandoff } from "./heroHandoff";
import { readMotionMode } from "./reveal-core";
import { useReveal } from "./useReveal";

export function MotionGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    let disposed = false;
    const open = () => {
      if (!disposed) html.dataset.js = "ready";
    };
    const mode = readMotionMode(html.dataset.motion, window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (mode === "calm") {
      open();
      return;
    }
    const timer = setTimeout(open, GSAP_GATE_TIMEOUT_MS);
    loadGsap().then(open, open);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, []);

  useReveal();
  useHeroHandoff();

  return <>{children}</>;
}
