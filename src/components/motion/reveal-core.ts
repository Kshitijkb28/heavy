/**
 * Pure logic behind the weight-drop reveals, the motion gate and the hero handoff (U7). No DOM here, so it is unit
 * tested in node; `useReveal.ts` does the DOM and GSAP work on top of it.
 *
 * DOM contract for U6 (no imports needed):
 *   <p class="hold" data-reveal>…</p>                 lines fall 12 px into place, 500 ms, 40 ms stagger (default)
 *   data-reveal="lines" | "words" | "chars"            SplitText granularity (chars: 15 ms stagger, for the giant email)
 *   data-reveal="children"                             each direct child drops (chip lists, bullet lists, CTA rows)
 *   data-reveal="block"                                the whole element drops as one (cards, images, live text)
 *   data-reveal-delay="120"                            ms before the drop starts once triggered
 *   data-reveal-stagger="60"  data-reveal-distance="20" ms between pieces / px of fall (overrides)
 * The element must carry `.hold` (the CSS hides it until its drop); the controller writes `data-reveal-state`
 * ("idle" → "armed" → "revealing" → "done") for CSS hooks and tests. Split modes rewrite the element's children while
 * the drop plays and restore the original markup after it, so keep their content static (use "block" or "children"
 * for anything React updates on the client, such as the local time). Never put `.hold` on the hero h1 (it is the LCP).
 */
export type RevealMode = "lines" | "words" | "chars" | "children" | "block";
export const REVEAL_MODES: readonly RevealMode[] = ["lines", "words", "chars", "children", "block"];

export const REVEAL = {
  /** seconds a piece takes to land */
  duration: 0.5,
  /** seconds between lines / words / children */
  stagger: 0.04,
  /** seconds between characters */
  charStagger: 0.015,
  /** px a piece falls into place */
  distance: 12,
  ease: "power3.out",
  /** the drop starts when the block's top crosses this fraction of the viewport height */
  start: 0.85,
  /** the whole stagger never takes longer than this (seconds) so long lists do not crawl */
  maxStaggerTotal: 0.9,
  /** blocks are prepared (split, hidden, triggered) this many viewport heights before they can be seen */
  armMargin: 0.6,
  /** a prepared block that sits past the reveal line this long without its trigger firing is revealed anyway (ms) */
  watchdogMs: 600,
  /** blocks triggered in the same frame land one after another, this far apart (seconds), for at most `cascadeMax` steps */
  cascade: 0.07,
  cascadeMax: 6,
  /** lines keep their clip mask only when the line box leaves room for ascenders and descenders */
  maskMinLineHeight: 1.25,
  /** the first split waits for the web fonts at most this long (ms) so line breaks are final */
  fontsWaitMs: 1200,
} as const;

export interface RevealConfig {
  mode: RevealMode;
  /** seconds before the drop starts once the block is triggered */
  delay: number;
  /** seconds between pieces */
  stagger: number;
  /** px the pieces fall */
  distance: number;
  /** seconds a piece takes to land */
  duration: number;
}

/** The `data-reveal*` attributes as `element.dataset` exposes them. */
export interface RevealDataset {
  reveal?: string;
  revealDelay?: string;
  revealStagger?: string;
  revealDistance?: string;
}

export type RevealState = "idle" | "armed" | "revealing" | "done";
export type RectPosition = "above" | "visible" | "below";
export type MotionMode = "full" | "calm";

export const REVEAL_SELECTOR = "[data-reveal]";
export const HOLD_SELECTOR = ".hold, [data-reveal]";

export function parseRevealMode(value: string | null | undefined): RevealMode {
  const v = (value ?? "").trim().toLowerCase();
  return (REVEAL_MODES as readonly string[]).includes(v) ? (v as RevealMode) : "lines";
}

function parseNonNegative(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Resolves an element's `data-reveal*` attributes into timings (seconds / px). Bad values fall back to the defaults. */
export function parseRevealConfig(data: RevealDataset): RevealConfig {
  const mode = parseRevealMode(data.reveal);
  const baseStagger = mode === "chars" ? REVEAL.charStagger : REVEAL.stagger;
  return {
    mode,
    delay: parseNonNegative(data.revealDelay, 0) / 1000,
    stagger: parseNonNegative(data.revealStagger, baseStagger * 1000) / 1000,
    distance: parseNonNegative(data.revealDistance, REVEAL.distance),
    duration: REVEAL.duration,
  };
}

/** Where a block sits relative to the reveal line: scrolled past already, on screen (or straddling it), or still to come. */
export function classifyRect(top: number, bottom: number, viewportHeight: number, start: number = REVEAL.start): RectPosition {
  if (bottom <= 0) return "above";
  if (top < viewportHeight * start) return "visible";
  return "below";
}

/** Per-piece stagger, capped so a long list never takes more than `maxTotal` seconds to start its last piece. */
export function staggerFor(count: number, base: number, maxTotal: number = REVEAL.maxStaggerTotal): number {
  if (count <= 1 || base <= 0) return 0;
  return Math.min(base, maxTotal / (count - 1));
}

/** Extra delay for the n-th block revealed in one frame, so a section's index, heading, copy and lists land in order. */
export function cascadeDelay(indexInFrame: number, step: number = REVEAL.cascade, max: number = REVEAL.cascadeMax): number {
  return Math.min(Math.max(0, Math.floor(indexInFrame)), max) * step;
}

/** Blocks already scrolled past, and anything on screen that the 3 s safety timer has shown, are released without a drop. */
export function instantRelease(pos: RectPosition, onScreen: boolean, shown: boolean): boolean {
  return pos === "above" || (onScreen && shown);
}

/** Clip masks suit body text; tight display line-heights (Anton at .92) would clip ascenders and descenders. */
export function wantsMask(lineHeightPx: number, fontSizePx: number): boolean {
  if (!Number.isFinite(lineHeightPx) || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return false;
  return lineHeightPx >= fontSizePx * REVEAL.maskMinLineHeight;
}

/** `html[data-motion]` is set before first paint by the layout; the media query is the fallback and the live source. */
export function readMotionMode(attr: string | null | undefined, prefersReducedMotion: boolean): MotionMode {
  return attr === "calm" || prefersReducedMotion ? "calm" : "full";
}

/** The gate opens (html[data-js="ready"]) when motion is calm, when GSAP landed or failed, or when the timeout passed. */
export function gateIsOpen(args: { mode: MotionMode; loaded: boolean; failed: boolean; elapsedMs: number; timeoutMs: number }): boolean {
  return args.mode === "calm" || args.loaded || args.failed || args.elapsedMs >= args.timeoutMs;
}

/** The DOM h1 hands off to the iron letters once the entrance settled and only while the scene is live. */
export function handoffState(entered: boolean, poster: boolean): boolean {
  return entered && !poster;
}

/** Edge-triggered: the value to apply, or null when nothing changed, so a manual `setHeroHandoff()` survives polling. */
export function handoffChange(last: boolean | null, next: boolean): boolean | null {
  return last === next ? null : next;
}
