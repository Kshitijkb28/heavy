/**
 * Scroll ↔ journey mapping (U5). The pure part (`buildScrollMap`, `scrollToT`, `tToScrollY`, `activeSectionAt`) is unit
 * tested; the DOM part (`measureSections`) runs in `ScrollWriter`.
 *
 * t = index + progress, where progress runs 0 → 1 between a section's *anchor* (its top minus `scroll-margin-top`,
 * i.e. where the browser puts it for `#id`) and the next section's anchor. So `/#projects` lands on t = 3 exactly, and
 * the mapping stays continuous even when sections have gaps between them. The last section holds its index. A section
 * with sub-stops (the project cards, `[data-project-stop]`) is split at each one: card i of n reaches the anchor at
 * t = index + i/n exactly, however uneven the cards are, so the camera frames initial i while card i is read.
 */
import { SECTION_ORDER, type SectionId } from "@/lib/contracts";

export const T_MAX = SECTION_ORDER.length - 1;

/** The hero rig counts as on screen (physics interactive, breeze on) up to this t; the camera has left it by then. */
export const HERO_VISIBLE_UNTIL = 1.1;

export interface MeasuredSection {
  id: SectionId;
  /** document offset of the element's top (px) */
  top: number;
  height: number;
  /** computed `scroll-margin-top` (px) */
  scrollMargin: number;
  /** document tops of the section's sub-stop blocks, in order (the project cards) */
  stops?: number[];
}

export interface SectionSpan extends MeasuredSection {
  /** position in SECTION_ORDER */
  index: number;
  /** scroll position at which this section is "arrived at" (t = index) */
  anchor: number;
  /** scroll distance from this anchor to the next section's anchor (the section's own height for the last one) */
  span: number;
  /** scroll positions of the sub-stops, increasing, the first equal to `anchor`; absent for fewer than two */
  subAnchors?: number[];
}

export interface ScrollMap {
  readonly spans: readonly SectionSpan[];
}

const indexById = new Map<string, number>(SECTION_ORDER.map((id, i) => [id, i]));

export function sectionIndex(id: string): number {
  return indexById.get(id) ?? -1;
}

export function isSectionId(id: string): id is SectionId {
  return indexById.has(id);
}

export function buildScrollMap(sections: readonly MeasuredSection[]): ScrollMap {
  const seen = new Set<string>();
  const ordered = sections
    .filter((s) => {
      if (!isSectionId(s.id) || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .map((s): SectionSpan => ({ ...s, index: sectionIndex(s.id), anchor: Math.max(0, s.top - (s.scrollMargin || 0)), span: 1 }))
    .sort((a, b) => a.index - b.index);
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const next = ordered[i + 1];
    s.span = Math.max(1, next ? next.anchor - s.anchor : s.height);
    if (next && s.stops && s.stops.length > 1) {
      // card i's anchor, kept strictly inside the section so every piece has a positive length
      const n = s.stops.length;
      const sub = [s.anchor];
      for (let k = 1; k < n; k++) {
        const room = s.anchor + s.span - (n - k) * 0.5;
        sub.push(Math.min(room, Math.max(sub[k - 1] + 0.5, s.stops[k] - (s.scrollMargin || 0))));
      }
      s.subAnchors = sub;
    }
  }
  return { spans: ordered };
}

/** Progress 0 … 1 through span `s` at `scrollY` (piecewise over its sub-stops when it has them). */
function progressIn(s: SectionSpan, scrollY: number): number {
  const sub = s.subAnchors;
  if (!sub) return clamp01((scrollY - s.anchor) / s.span);
  const n = sub.length;
  const end = s.anchor + s.span;
  let k = 0;
  while (k + 1 < n && sub[k + 1] <= scrollY) k++;
  const to = k + 1 < n ? sub[k + 1] : end;
  return clamp01((k + clamp01((scrollY - sub[k]) / Math.max(1e-9, to - sub[k]))) / n);
}

/** Scroll position at progress `u` (0 … 1) through span `s` (inverse of `progressIn`). */
function scrollAt(s: SectionSpan, u: number): number {
  const sub = s.subAnchors;
  if (!sub) return s.anchor + u * s.span;
  const n = sub.length;
  const x = Math.min(Math.max(u * n, 0), n);
  const k = Math.min(n - 1, Math.floor(x));
  const to = k + 1 < n ? sub[k + 1] : s.anchor + s.span;
  return sub[k] + (x - k) * (to - sub[k]);
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Journey parameter for a scroll position. */
export function scrollToT(map: ScrollMap, scrollY: number): number {
  const spans = map.spans;
  const n = spans.length;
  if (n === 0) return 0;
  let i = 0;
  while (i + 1 < n && spans[i + 1].anchor <= scrollY) i++;
  const s = spans[i];
  if (i === n - 1) return s.index;
  return s.index + progressIn(s, scrollY) * (spans[i + 1].index - s.index);
}

/** Scroll position for a journey parameter (inverse of `scrollToT`; t beyond the last section → its anchor). */
export function tToScrollY(map: ScrollMap, t: number): number {
  const spans = map.spans;
  const n = spans.length;
  if (n === 0) return 0;
  if (t <= spans[0].index) return spans[0].anchor;
  for (let i = 0; i < n - 1; i++) {
    const a = spans[i];
    const b = spans[i + 1];
    if (t < b.index) return scrollAt(a, (t - a.index) / (b.index - a.index));
  }
  return spans[n - 1].anchor;
}

/** The section containing the viewport centre (DESIGN.md §3: the active station). */
export function activeSectionAt(map: ScrollMap, scrollY: number, viewportHeight: number): SectionId {
  const spans = map.spans;
  if (spans.length === 0) return SECTION_ORDER[0];
  const centre = scrollY + viewportHeight / 2;
  let active = spans[0];
  for (const s of spans) if (s.top <= centre) active = s;
  return active.id;
}

export function heroVisibleAt(t: number): boolean {
  return t < HERO_VISIBLE_UNTIL;
}

/** Scroll velocity (px/s) smoothed over successive scroll events. */
export function nextVelocity(previous: number, deltaPx: number, deltaMs: number): number {
  if (!(deltaMs > 0)) return previous;
  const instant = (deltaPx / deltaMs) * 1000;
  return previous * 0.4 + instant * 0.6;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* DOM                                                                                                                */

/** Measures every `[data-section]` under `root` and its `[data-project-stop]` blocks (document offsets; forces one layout). Browser only. */
export function measureSections(root: ParentNode = document): MeasuredSection[] {
  const out: MeasuredSection[] = [];
  const scrollY = window.scrollY;
  for (const el of root.querySelectorAll<HTMLElement>("[data-section]")) {
    const id = el.dataset.section ?? "";
    if (!isSectionId(id)) continue;
    const rect = el.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    const stops = [...el.querySelectorAll<HTMLElement>("[data-project-stop]")].map((b) => b.getBoundingClientRect().top + scrollY);
    out.push({ id, top: rect.top + scrollY, height: rect.height, scrollMargin: margin, ...(stops.length ? { stops } : {}) });
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------------------------- */
/* Writer ↔ camera signalling                                                                                        */

let snapSerial = 0;

/** Ask the camera to cut to the current t instead of flying there (deep links, scroll restoration). */
export function requestCameraSnap(): void {
  snapSerial++;
}

/** Changes whenever a snap was requested; `CameraRig` compares it each frame. */
export function cameraSnapSerial(): number {
  return snapSerial;
}

const refreshers = new Set<() => void>();

/** Re-measure the section map now (U7 calls this after `ScrollTrigger.refresh`; anything that changes layout may). */
export function refreshScrollMap(): void {
  for (const fn of refreshers) fn();
}

export function onScrollMapRefresh(fn: () => void): () => void {
  refreshers.add(fn);
  return () => {
    refreshers.delete(fn);
  };
}
