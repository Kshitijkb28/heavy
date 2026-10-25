"use client";

/**
 * The fixed stage behind the page (docs/DESIGN.md §6, §11). Server-rendered as an empty `.stage` host plus
 * the CSS poster, so the hero paints at 0 ms with its key-light pool. Once the tier is known (Providers) and it is not
 * `low`, the scene chunk (three, R3F, the hall, the rig) is requested at idle and mounted inside the host; the poster
 * fades out on the scene's first frame. Any failure to load or create the scene (chunk error, no WebGL2) raises the
 * poster instead of breaking the page.
 */
import dynamic from "next/dynamic";
import { Component, startTransition, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { Tier } from "@/lib/contracts";
import { emitScene, onScene } from "@/lib/registry";
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

const noopSubscribe = () => () => {};
const readDebugFlag = (): boolean => new URLSearchParams(window.location.search).get("debug") === "stats";
const readDebugFlagOnServer = (): boolean => false;
const posterDebugStyle: CSSProperties = {
  position: "fixed",
  top: "calc(var(--header-h, 64px) + 8px)",
  left: "max(8px, env(safe-area-inset-left))",
  zIndex: 80,
  margin: 0,
  padding: "8px 10px",
  pointerEvents: "none",
  font: "11px/1.5 var(--font-geist-mono), ui-monospace, monospace",
  color: "var(--text, #e8ecf2)",
  background: "rgba(5, 5, 7, 0.82)",
  whiteSpace: "pre-wrap",
};

/**
 * `?debug=stats` when there is no scene to carry the overlay (poster tier, or a scene that fell back): the tier, why it
 * was chosen and why the poster came up, so a visitor who only gets the poster can say why. No three.js in this chunk.
 */
function PosterDebug({ tier }: { tier: Tier | null }) {
  const on = useSyncExternalStore(noopSubscribe, readDebugFlag, readDebugFlagOnServer);
  const poster = useUI((s) => s.poster);
  const [fallback, setFallback] = useState<string | null>(null);
  useEffect(() => onScene("poster", (detail) => setFallback(String((detail as { reason?: string } | undefined)?.reason ?? "unknown"))), []);
  if (!on || !tier || (isSceneTier(tier) && !poster)) return null;
  const reason = document.documentElement.dataset.tierReason ?? "?";
  return (
    <pre style={posterDebugStyle} aria-hidden="true" data-debug="tier">
      {`HEAVY ${tier} (${reason})${fallback ? `   poster: ${fallback}` : ""}`}
    </pre>
  );
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
      <PosterDebug tier={tier} />
    </>
  );
}
