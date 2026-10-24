/**
 * Lazy physics chunk (DESIGN.md §4 "Physics"). `@react-three/rapier` statically imports the ≈ 1 MB (brotli)
 * `@dimforge/rapier3d-compat`, so nothing in the static graph may import it: every physics component gets the
 * module through `getRapierModule()` / `PhysicsGate` after `ensurePhysics()` resolved.
 *
 * Policy: desktop → at idle after mount (≤ 1.5 s); phones → at idle when `effectiveType === "4g"` and not
 * saveData, otherwise on the first canvas `pointerdown`. Until it lands the letters sway kinematically.
 */
import type { PhysicsStatus } from "@/lib/contracts";
import { emitScene } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { useUI } from "@/store/ui";

export type RapierModule = typeof import("@react-three/rapier");
export type PhysicsPolicy = "idle" | "pointerdown";

export interface PolicyInput {
  /** coarse pointer only (phones, tablets) */
  coarsePointer: boolean;
  /** `navigator.connection.effectiveType`, undefined where the API is missing (Safari) */
  effectiveType?: string | null;
  saveData?: boolean;
}

/** idle-callback deadline for the eager load */
export const IDLE_TIMEOUT_MS = 1500;

/** Pure policy decision (unit tested). */
export function decidePhysicsPolicy(input: PolicyInput): PhysicsPolicy {
  if (!input.coarsePointer) return "idle";
  if (input.effectiveType === "4g" && !input.saveData) return "idle";
  return "pointerdown";
}

let rapierModule: RapierModule | null = null;
let pending: Promise<void> | null = null;
const readyListeners = new Set<(mod: RapierModule) => void>();

function setStatus(status: PhysicsStatus): void {
  sceneState.physics = status;
  useUI.getState().setPhysics(status);
}

/** The loaded module, or null until `ensurePhysics()` resolved. */
export function getRapierModule(): RapierModule | null {
  return rapierModule;
}

export function physicsStatus(): PhysicsStatus {
  return sceneState.physics;
}

/** Load `@react-three/rapier` and initialise the wasm once; safe to call many times. */
export function ensurePhysics(): Promise<void> {
  if (rapierModule) return Promise.resolve();
  if (pending) return pending;
  setStatus("loading");
  pending = (async () => {
    const [mod, core] = await Promise.all([import("@react-three/rapier"), import("@dimforge/rapier3d-compat")]);
    // pre-warm the wasm so <Physics> suspends for a microtask only (init() early-returns once initialised)
    // rapier3d-compat 0.19 hands wasm-bindgen its bytes positionally, which logs a deprecation notice on every load;
    // drop exactly that notice while the init runs and forward everything else
    const warn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("using deprecated parameters for the initialization function")) return;
      warn.apply(console, args);
    };
    try {
      await core.init();
    } finally {
      console.warn = warn;
    }
    rapierModule = mod;
    setStatus("ready");
    emitScene("physics-ready");
    readyListeners.forEach((fn) => fn(mod));
  })().catch((err: unknown) => {
    pending = null;
    setStatus("failed");
    throw err;
  });
  return pending;
}

/** Subscribe to the module becoming available; fires immediately when it already is. */
export function onPhysicsReady(fn: (mod: RapierModule) => void): () => void {
  if (rapierModule) {
    fn(rapierModule);
    return () => {};
  }
  readyListeners.add(fn);
  return () => {
    readyListeners.delete(fn);
  };
}

function readPolicyInput(): PolicyInput {
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } };
  const coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
  return { coarsePointer: coarse, effectiveType: nav.connection?.effectiveType ?? null, saveData: nav.connection?.saveData ?? false };
}

/**
 * Apply the load policy. Returns a cancel function (effects call it on cleanup). `canvas` receives the
 * first-pointerdown listener when the policy defers; it falls back to `window`.
 */
export function schedulePhysics(opts: { canvas?: HTMLElement | null; policy?: PhysicsPolicy } = {}): () => void {
  if (typeof window === "undefined" || rapierModule || pending) return () => {};
  const policy = opts.policy ?? decidePhysicsPolicy(readPolicyInput());
  const load = () => {
    ensurePhysics().catch(() => {});
  };
  if (policy === "idle") {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS });
      return () => w.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(load, 250);
    return () => window.clearTimeout(id);
  }
  const target: EventTarget = opts.canvas ?? window;
  target.addEventListener("pointerdown", load, { once: true, passive: true });
  return () => target.removeEventListener("pointerdown", load);
}

/** Test helper. */
export function resetPhysicsLoaderForTests(): void {
  rapierModule = null;
  pending = null;
  readyListeners.clear();
}
