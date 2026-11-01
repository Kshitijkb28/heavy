import { PLACE_LABELS, SECTION_ORDER, type SectionId } from "@/lib/contracts";
import { withBase } from "@/lib/base";
import { links, profile, sections as resumeSections, view, type SectionMeta } from "./resume";
import type { Cta } from "./view";

export type { Cta };

/** One stop on the dolly track. Content sections carry their résumé heading; hero and footer do not. */
export interface Place {
  id: SectionId;
  /** 0 … 7, equals the integer part of the journey parameter `t` */
  index: number;
  /** two-digit label for indices ("00" … "06"); the footer has none */
  code: string;
  /** mono station label on the track (HOME … CONTACT, END) */
  label: string;
  meta?: SectionMeta;
}

const metaById = Object.fromEntries(resumeSections.map((s) => [s.id, s])) as Record<string, SectionMeta>;

export const PLACES: Place[] = SECTION_ORDER.map((id, index) => ({
  id,
  index,
  code: String(index).padStart(2, "0"),
  label: PLACE_LABELS[id],
  meta: metaById[id],
}));

/** The seven stations shown on the track and in the stage sheet (the footer is not a destination). */
export const TRACK: Place[] = PLACES.filter((p) => p.id !== "footer");

export const placeById = Object.fromEntries(PLACES.map((p) => [p.id, p])) as Record<SectionId, Place>;

export const heroCtas: Cta[] = view.hero.ctas;

/** Links listed in the phone stage sheet and the footer. */
export const sheetLinks = [
  { label: "Résumé (PDF)", href: withBase(profile.resumePdf), external: true },
  { label: "LinkedIn", href: links.linkedin.href, external: true },
  { label: "GitHub", href: links.github.href, external: true },
  { label: "Email", href: `mailto:${profile.email}`, external: false },
] as const;

/** The iron letters of the name, one body each, in hanging order. */
export const NAME_ROWS: readonly [string, string] = view.hero.nameRows;
