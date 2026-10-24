import { SECTION_ORDER, type SectionId } from "@/lib/contracts";
import type { SectionRect } from "@/lib/registry";
import { placeById, type Place } from "@/data/derived";
import { useUI } from "@/store/ui";

/**
 * The section whose measured rect holds the viewport centre (`scrollY + vh / 2`): the last rect whose top is at or above
 * the centre. Before the first rect → the first section; no rects → "hero". Pure; U5's scroll writer may use it too.
 */
export function activeSectionAt(rects: readonly SectionRect[], scrollY: number, vh: number): SectionId {
  if (rects.length === 0) return SECTION_ORDER[0];
  const sorted = [...rects].sort((a, b) => a.top - b.top);
  const centre = scrollY + vh / 2;
  let current: SectionId = sorted[0].id;
  for (const r of sorted) {
    if (centre < r.top) break;
    current = r.id;
  }
  return current;
}

/** The track station a section lights. The footer is not a destination: the camera holds at CONTACT, so does the track. */
export function stationFor(id: SectionId): Place {
  return id === "footer" ? placeById.contact : placeById[id];
}

/** The active section as mirrored into the store by U5's scroll writer (debounced). */
export function useActiveSection(): SectionId {
  return useUI((s) => s.activeSection);
}

/** The active station on the dolly track (HOME … CONTACT): the active section, with the footer mapped to CONTACT. */
export function useActiveStation(): Place {
  return stationFor(useActiveSection());
}
