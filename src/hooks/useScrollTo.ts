import { markInput } from "@/lib/scene-state";
import { getLenis } from "@/components/chrome/lenis-ref";

/** ids that mean "home": the page scrolls to 0 and the URL loses its hash. */
export const HOME_IDS: ReadonlySet<string> = new Set(["hero", "content", "top"]);

export interface ScrollToOptions {
  /** how the URL hash follows: replace the entry (default), push a new one, or leave the URL alone */
  hash?: "replace" | "push" | false;
  /** jump with no animation (reduced motion forces this) */
  instant?: boolean;
  /** move focus to the target once the jump starts (default true; keyboard users land in the section) */
  focus?: boolean;
}

export type ScrollTo = (id: string, options?: ScrollToOptions) => boolean;

/** The hash a destination writes into the URL: "" for home, "#id" otherwise. */
export function hashFor(id: string): string {
  return HOME_IDS.has(id) ? "" : `#${id}`;
}

/** Document-space scroll top for a target: rect top + scrollY − scroll-margin-top, rounded and clamped to [0, max]. */
export function resolveTop(rectTop: number, scrollY: number, scrollMarginTop: number, maxScroll: number): number {
  const top = Math.round(rectTop + scrollY - scrollMarginTop);
  return Math.min(Math.max(0, top), Math.max(0, maxScroll));
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll the page to a section by id. Lenis carries the flight when it runs (fine pointer, motion on), native smooth
 * scrolling does on touch, and reduced motion jumps. Writes the hash with replaceState (home clears it), moves focus to
 * the target without a second scroll, and marks input for the stage loop. Returns false when nothing matches the id.
 */
export function scrollToSection(id: string, options: ScrollToOptions = {}): boolean {
  if (typeof document === "undefined") return false;
  const home = HOME_IDS.has(id);
  const el = document.getElementById(id);
  if (!el && !home) return false;

  let top = 0;
  if (el && !home) {
    const doc = document.scrollingElement ?? document.documentElement;
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    top = resolveTop(el.getBoundingClientRect().top, window.scrollY, margin, doc.scrollHeight - window.innerHeight);
  }

  const instant = options.instant === true || prefersReducedMotion();
  const lenis = getLenis();
  if (lenis && !lenis.isStopped && !lenis.isLocked) lenis.scrollTo(top, { immediate: instant });
  else window.scrollTo({ top, behavior: instant ? "auto" : "smooth" });

  const { hash = "replace", focus = true } = options;
  if (hash) {
    const url = `${location.pathname}${location.search}${hashFor(id)}`;
    if (hash === "push") history.pushState(null, "", url);
    else history.replaceState(null, "", url);
  }
  if (focus && el) {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  }
  markInput();
  return true;
}

/** The subset of a click event the anchor handler reads (React's synthetic event and the DOM event both fit). */
export interface AnchorClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}

/** Whether a click on an in-page link should be taken over: plain primary clicks only; modified clicks stay native. */
export function isPlainClick(e: AnchorClickLike): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** onClick for `<a href="#id">`: smooth-scrolls plain clicks (and prevents the native jump); leaves the rest alone. */
export function handleAnchorClick(e: AnchorClickLike, id: string, options?: ScrollToOptions): void {
  if (!isPlainClick(e)) return;
  if (scrollToSection(id, options)) e.preventDefault();
}

/** `const scrollTo = useScrollTo(); scrollTo("projects")` — the contract hook; stable, safe in handlers and effects. */
export function useScrollTo(): ScrollTo {
  return scrollToSection;
}
