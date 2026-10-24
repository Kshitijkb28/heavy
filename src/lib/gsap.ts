/**
 * Lazy GSAP for HEAVY (U7). The core, ScrollTrigger and SplitText arrive in one async chunk and are registered once;
 * ScrollTrigger is configured for phones (`ignoreMobileResize`: a collapsing browser toolbar must not re-measure the
 * page) and refreshed when the web fonts settle. Other units get the same instances through `getGsap()` /
 * `onGsapReady()` (U5 can listen to `ScrollTrigger.addEventListener("refresh", …)`), and `refreshScrollTriggers()`
 * coalesces refresh requests after layout changes.
 */
import type { gsap as GsapCore } from "gsap";
import type { ScrollTrigger as ScrollTriggerClass } from "gsap/ScrollTrigger";
import type { SplitText as SplitTextClass } from "gsap/SplitText";

export interface GsapBundle {
  gsap: typeof GsapCore;
  ScrollTrigger: typeof ScrollTriggerClass;
  SplitText: typeof SplitTextClass;
}

/** The motion gate flips `html[data-js]` to "ready" at the latest after this long, even if the chunk never lands. */
export const GSAP_GATE_TIMEOUT_MS = 1800;

let bundle: GsapBundle | null = null;
let pending: Promise<GsapBundle> | null = null;
const waiting = new Set<(b: GsapBundle) => void>();

/** The loaded bundle, or null until `loadGsap()` resolved (never on the server). */
export function getGsap(): GsapBundle | null {
  return bundle;
}

/** Idempotent: one import for the whole page; repeated calls share the promise, a failed load can be retried. */
export function loadGsap(): Promise<GsapBundle> {
  if (bundle) return Promise.resolve(bundle);
  if (pending) return pending;
  if (typeof window === "undefined") return Promise.reject(new Error("loadGsap() runs in the browser only"));
  pending = Promise.all([import("gsap"), import("gsap/ScrollTrigger"), import("gsap/SplitText")])
    .then(([core, st, split]) => {
      const { gsap } = core;
      const { ScrollTrigger } = st;
      const { SplitText } = split;
      gsap.registerPlugin(ScrollTrigger, SplitText);
      ScrollTrigger.config({ ignoreMobileResize: true });
      bundle = { gsap, ScrollTrigger, SplitText };
      document.fonts.ready.then(() => refreshScrollTriggers()).catch(() => {});
      for (const cb of waiting) cb(bundle);
      waiting.clear();
      return bundle;
    })
    .catch((err: unknown) => {
      pending = null;
      throw err;
    });
  return pending;
}

/** Runs `cb` with the bundle: synchronously when it is already loaded, otherwise once it lands. Returns an unsubscribe. */
export function onGsapReady(cb: (b: GsapBundle) => void): () => void {
  if (bundle) {
    cb(bundle);
    return () => {};
  }
  waiting.add(cb);
  return () => {
    waiting.delete(cb);
  };
}

let refreshQueued = false;
/** Coalesces `ScrollTrigger.refresh()` into one call per animation frame; a no-op until GSAP is loaded. */
export function refreshScrollTriggers(): void {
  if (!bundle || refreshQueued || typeof window === "undefined") return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    bundle?.ScrollTrigger.refresh();
  });
}
