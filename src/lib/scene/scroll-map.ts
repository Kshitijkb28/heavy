/**
 * Scroll ↔ journey mapping (U5). The pure part (`buildScrollMap`, `scrollToT`, `tToScrollY`, `activeSectionAt`) is unit
 * tested; the DOM part (`measureSections`) runs in `ScrollWriter`.
 *
 * t = index + progress, where progress runs 0 → 1 between a section's *anchor* (its top minus `scroll-margin-top`,
 * i.e. where the browser puts it for `#id`) and the next section's anchor. So `/#projects` lands on t = 3 exactly, and
 * the mapping stays continuous even when sections have gaps between them. The last section holds its index.
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
}

export interface SectionSpan extends MeasuredSection {
  /** position in SECTION_ORDER */
  index: number;
  /** scroll position at which this section is "arrived at" (t = index) */
  anchor: number;
  /** scroll distance from this anchor to the next section's anchor (the section's own height for the last one) */
  span: number;
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
    .map((s) => ({ ...s, index: sectionIndex(s.id), anchor: Math.max(0, s.top - (s.scrollMargin || 0)), span: 1 }))
    .sort((a, b) => a.index - b.index);
  for (let i = 0; i < ordered.length; i++) {
    const next = ordered[i + 1];
    ordered[i].span = Math.max(1, next ? next.anchor - ordered[i].anchor : ordered[i].height);
  }
  return { spans: ordered };
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
  const u = clamp01((scrollY - s.anchor) / s.span);
  return s.index + u * (spans[i + 1].index - s.index);
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
    if (t < b.index) return a.anchor + ((t - a.index) / (b.index - a.index)) * a.span;
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

/** Measures every `[data-section]` under `root` (document offsets; forces one layout). Browser only. */
export function measureSections(root: ParentNode = document): MeasuredSection[] {
  const out: MeasuredSection[] = [];
  const scrollY = window.scrollY;
  for (const el of root.querySelectorAll<HTMLElement>("[data-section]")) {
    const id = el.dataset.section ?? "";
    if (!isSectionId(id)) continue;
    const rect = el.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    out.push({ id, top: rect.top + scrollY, height: rect.height, scrollMargin: margin });
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
