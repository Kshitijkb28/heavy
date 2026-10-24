"use client";

/**
 * The fixed stage behind the page (docs/DESIGN.md §6, §11). Server-rendered as an empty `.stage` host plus
 * the CSS poster, so the hero paints at 0 ms with its key-light pool. Once the tier is known (Providers) and it is not
 * `low`, the scene chunk (three, R3F, the hall, the rig) is requested at idle and mounted inside the host; the poster
 * fades out on the scene's first frame. Any failure to load or create the scene (chunk error, no WebGL2) raises the
 * poster instead of breaking the page.
 */
import dynamic from "next/dynamic";
import { Component, startTransition, useEffect, useState, type ReactNode } from "react";
import type { Tier } from "@/lib/contracts";
import { emitScene } from "@/lib/registry";
import { useUI } from "@/store/ui";
import { Poster } from "./Poster";

const Scene = dynamic(() => import("./Scene"), { ssr: false, loading: () => null });

/** idle deadline for requesting the scene chunk (the page and its fonts come first) */
export const SCENE_IDLE_TIMEOUT_MS = 1200;

function whenIdle(cb: () => void, timeout: number): () => void {
  const w = window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, Math.min(600, timeout));
  return () => window.clearTimeout(id);
}

/** Anything thrown while loading or creating the scene leaves the page on the poster. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: unknown): void {
    useUI.getState().setPoster(true);
    emitScene("poster", { reason: "scene-error", message: error instanceof Error ? error.message : String(error) });
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

function isSceneTier(tier: Tier | null): tier is "high" | "mid" {
  return tier === "high" || tier === "mid";
}

export function Stage() {
  const tier = useUI((s) => s.tier);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!isSceneTier(tier) || requested) return;
    // the page, its CSS and its fonts come first (the scene chunk must never compete with the first paint); then an idle
    // slot, and the mount runs in a transition so React yields while it builds the scene subtree
    let dead = false;
    let cancelIdle = () => {};
    const loaded = document.readyState === "complete" ? Promise.resolve() : new Promise<void>((resolve) => window.addEventListener("load", () => resolve(), { once: true }));
    Promise.all([loaded, document.fonts?.ready ?? Promise.resolve()]).then(() => {
      if (dead) return;
      cancelIdle = whenIdle(() => startTransition(() => setRequested(true)), SCENE_IDLE_TIMEOUT_MS);
    });
    return () => {
      dead = true;
      cancelIdle();
    };
  }, [tier, requested]);

  return (
    <>
      <div className="stage" aria-hidden="true">
        {requested && isSceneTier(tier) ? (
          <SceneBoundary>
            <Scene tier={tier} />
          </SceneBoundary>
        ) : null}
      </div>
      <Poster />
    </>
  );
}
