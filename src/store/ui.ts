import { create } from "zustand";
import type { PhysicsStatus, SectionId, Tier } from "@/lib/contracts";

/** Low-frequency UI state. Anything that changes per frame lives in `lib/scene-state.ts` instead. */
export interface UIState {
  /** resolved tier; null until `detectTier()` ran on the client */
  tier: Tier | null;
  setTier: (tier: Tier) => void;
  activeSection: SectionId;
  setActiveSection: (id: SectionId) => void;
  /** the phone stage sheet (navigation dialog) */
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  /** "Hold a letter to grab it" — dismissed after the first grab */
  hintDismissed: boolean;
  dismissHint: () => void;
  toast: string | null;
  showToast: (message: string, ms?: number) => void;
  physics: PhysicsStatus;
  setPhysics: (status: PhysicsStatus) => void;
  /** scene unavailable (no WebGL2, context lost twice, low tier): the CSS poster is shown */
  poster: boolean;
  setPoster: (poster: boolean) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUI = create<UIState>((set) => ({
  tier: null,
  setTier: (tier) => set({ tier, poster: tier === "low" }),
  activeSection: "hero",
  setActiveSection: (activeSection) => set({ activeSection }),
  sheetOpen: false,
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  hintDismissed: false,
  dismissHint: () => set({ hintDismissed: true }),
  toast: null,
  showToast: (message, ms = 2200) => {
    clearTimeout(toastTimer);
    set({ toast: message });
    toastTimer = setTimeout(() => set({ toast: null }), ms);
  },
  physics: "idle",
  setPhysics: (physics) => set({ physics }),
  poster: false,
  setPoster: (poster) => set({ poster }),
}));
