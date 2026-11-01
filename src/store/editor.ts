import { create } from "zustand";
import type { Content } from "@/data/contract";
import { deriveView, type SiteView } from "@/data/view";
import type { PanelId } from "@/lib/content-diff";

/** "demo": a local draft that cannot publish (dev and demo builds); "github": edits the repo's content.json and commits it. */
export type EditMode = "demo" | "github";

/**
 * The in-page editor's state. Tiny on purpose: the section slots (`EditSlot`) read it on every visit, the editor itself
 * (forms, validation, GitHub) is a separate chunk that loads only when you open edit mode.
 */
export interface EditorState {
  /** the page renders the draft instead of the published content */
  active: boolean;
  mode: EditMode;
  /** what the draft started from: the repo's content.json at `baseSha` (the built content in demo mode) */
  base: Content | null;
  baseSha: string | null;
  draft: Content | null;
  /** `deriveView(draft)`: what the preview shows */
  view: SiteView | null;
  panel: PanelId | null;
  /** a replacement résumé PDF picked in the Contact panel, committed with the content */
  resumeFile: File | null;
  open: (base: Content, opts: { mode: EditMode; baseSha?: string | null; draft?: Content }) => void;
  setDraft: (draft: Content) => void;
  setPanel: (panel: PanelId | null) => void;
  setResumeFile: (file: File | null) => void;
  /** after a publish: the published content becomes the new base, the draft stays as it is */
  rebase: (base: Content, baseSha: string | null) => void;
  discard: () => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  active: false,
  mode: "demo",
  base: null,
  baseSha: null,
  draft: null,
  view: null,
  panel: null,
  resumeFile: null,
  open: (base, { mode, baseSha = null, draft = base }) => set({ active: true, mode, base, baseSha, draft, view: deriveView(draft) }),
  setDraft: (draft) => set({ draft, view: deriveView(draft) }),
  setPanel: (panel) => set({ panel }),
  setResumeFile: (resumeFile) => set({ resumeFile }),
  rebase: (base, baseSha) => set({ base, baseSha, resumeFile: null }),
  discard: () => {
    const { base } = get();
    if (base) set({ draft: base, view: deriveView(base), resumeFile: null });
  },
}));
