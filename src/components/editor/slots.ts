import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";

/** The page's sections, each wrapped in an `EditSlot`. */
export type SlotId = "hero" | "about" | "experience" | "projects" | "stack" | "education" | "contact" | "footer";

/** Renders one section from a view (a plain function returning elements: it calls no hooks itself). */
export type PreviewRenderer = (id: SlotId, view: SiteView) => ReactNode;

let preview: PreviewRenderer | null = null;

/** The editor chunk registers its section renderer before it switches edit mode on, so a slot never renders empty. */
export function setPreview(render: PreviewRenderer): void {
  preview = render;
}

export function getPreview(): PreviewRenderer | null {
  return preview;
}

/** The editor's draft in browser storage (the token has its own module, `token.ts`); every access is guarded. */
export const STORAGE = { draft: "heavy:draft:v1" } as const;

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // storage unavailable: the editor still works, it just cannot remember
  }
}
