"use client";

/**
 * Hero handoff (U7 → U6): once the iron letters have dropped and settled (`sceneState.entered`, written by the stage)
 * the DOM h1 fades out under the 3D name. The contract is one attribute, `html[data-handoff="on"]`, which U6's hero CSS
 * turns into a 300 ms opacity transition on `.hero-name` (the h1 stays in the DOM for the accessibility tree and SEO).
 * The attribute is removed when the poster replaces the scene (`useUI.poster`, the `heavy:poster` event) or the stage
 * unmounts and resets `sceneState.entered`. `setHeroHandoff()` lets the integrator start the fade earlier (as the
 * letters begin to drop); polling is edge-triggered so a manual call is not undone.
 */
import { useEffect } from "react";
import { onScene } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { useUI } from "@/store/ui";
import { handoffChange, handoffState } from "./reveal-core";

export const HANDOFF_ATTR = "data-handoff";
/** how often `sceneState.entered` is sampled (ms); a cheap boolean read */
export const HANDOFF_POLL_MS = 100;

export function setHeroHandoff(on: boolean): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (on) html.setAttribute(HANDOFF_ATTR, "on");
  else html.removeAttribute(HANDOFF_ATTR);
}

export function isHeroHandoffOn(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute(HANDOFF_ATTR) === "on";
}

/** Installs the poll and the poster subscriptions; returns the stop function (the attribute is cleared on stop). */
export function startHeroHandoff(pollMs: number = HANDOFF_POLL_MS): () => void {
  let last: boolean | null = null;
  const tick = () => {
    const change = handoffChange(last, handoffState(sceneState.entered, useUI.getState().poster));
    if (change === null) return;
    last = change;
    setHeroHandoff(change);
  };
  tick();
  const timer = setInterval(tick, pollMs);
  const unsubscribe = useUI.subscribe((state, prev) => {
    if (state.poster !== prev.poster) tick();
  });
  const offPoster = onScene("poster", (detail) => {
    // recovery notices do not bring the poster up: switching the h1 back on for a frame would only flicker
    const reason = (detail as { reason?: string } | undefined)?.reason;
    if (reason === "remounted" || reason === "context-restored") return;
    last = false;
    setHeroHandoff(false);
  });
  return () => {
    clearInterval(timer);
    unsubscribe();
    offPoster();
    setHeroHandoff(false);
  };
}

export function useHeroHandoff(): void {
  useEffect(() => startHeroHandoff(), []);
}
