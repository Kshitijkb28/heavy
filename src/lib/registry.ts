import type { Grabbable, SceneEventName, SectionId, Vec3 } from "./contracts";

/** Grabbable iron bodies (letters, initials). U3 registers; U3/U4/I1 read; the keyboard push button calls `pushAll`. */
const grabbables = new Map<string, Grabbable>();

export function registerGrabbable(g: Grabbable): () => void {
  grabbables.set(g.id, g);
  return () => {
    grabbables.delete(g.id);
  };
}
export function getGrabbables(): Grabbable[] {
  return [...grabbables.values()];
}
export function getGrabbable(id: string): Grabbable | undefined {
  return grabbables.get(id);
}
/** Random impulse on every hanging letter of a group (default: the name). Magnitude in N·s, horizontal-biased. */
export function pushAll(magnitude = 40, group: Grabbable["group"] = "name"): void {
  for (const g of grabbables.values()) {
    if (g.group !== group) continue;
    const a = Math.random() * Math.PI * 2;
    g.push([Math.cos(a) * magnitude, Math.random() * magnitude * 0.4, Math.sin(a) * magnitude * 0.3]);
  }
}

/** Section geometry measured from the DOM (`[data-section]`), refreshed by U5 on resize / fonts.ready / ScrollTrigger refresh. */
export interface SectionRect {
  id: SectionId;
  top: number;
  height: number;
}
let sectionRects: SectionRect[] = [];
export function setSectionRects(rects: SectionRect[]): void {
  sectionRects = rects;
}
export function getSectionRects(): SectionRect[] {
  return sectionRects;
}

/** Scene → DOM events (toasts, hints, debug). */
export function emitScene(name: SceneEventName, detail?: unknown): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(`heavy:${name}`, { detail }));
}
export function onScene(name: SceneEventName, handler: (detail: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(`heavy:${name}`, fn);
  return () => window.removeEventListener(`heavy:${name}`, fn);
}

export type { Vec3 };
