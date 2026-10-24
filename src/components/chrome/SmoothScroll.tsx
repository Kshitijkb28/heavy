"use client";

import { useEffect, type ReactNode } from "react";
import type { LenisOptions } from "lenis";
import { ReactLenis, useLenis } from "lenis/react";
import type { SectionId } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { useUI } from "@/store/ui";
import { FINE_POINTER, REDUCED_MOTION, useMediaQuery } from "@/hooks/useMediaQuery";
import { handleAnchorClick } from "@/hooks/useScrollTo";
import { setLenis } from "./lenis-ref";

/** Dolly feel: a lazy lerp, wheel only (touch stays native), Lenis drives its own rAF. Anchors are ours (see below). */
const LENIS_OPTIONS: LenisOptions = { lerp: 0.09, smoothWheel: true, syncTouch: false, autoRaf: true, anchors: false, autoResize: true };

/** Publishes the root instance for non-React callers (`getLenis()` → `useScrollTo`, U7's ScrollTrigger sync). */
function LenisBridge() {
  const lenis = useLenis();
  useEffect(() => {
    setLenis(lenis);
    return () => setLenis(undefined);
  }, [lenis]);
  return null;
}

/**
 * Anchor delegate: any same-document `<a href="#id">` on the page (hero CTAs, Back to top, the top bar) flies there
 * through `scrollToSection` with the hash replaced. Links that opted out (`data-native`, the skip link), links another
 * handler already took (`defaultPrevented`, e.g. next/link or our own onClick) and modified clicks stay native.
 */
function onDocumentClick(e: MouseEvent): void {
  const a = (e.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement) || a.hasAttribute("data-native") || a.target === "_blank") return;
  const href = a.getAttribute("href") ?? "";
  if (!href.startsWith("#") || href.length < 2) return;
  let id: string;
  try {
    id = decodeURIComponent(href.slice(1));
  } catch {
    return;
  }
  handleAnchorClick(e, id);
}

declare global {
  interface Window {
    /** Dev-only test bridge (stripped from production): drives the chrome without the scene or U5's scroll writer. */
    __heavyChrome?: { setT: (t: number) => void; setActive: (id: SectionId) => void; toast: (message: string) => void };
  }
}

/**
 * Scroll provider (U1). Lenis runs as the root scroller only on fine pointers with motion on; touch devices and reduced
 * motion keep native scrolling. The children are never re-parented: ReactLenis mounts beside them, so toggling it (a
 * media-query change) never remounts the page. Also owns the anchor delegate.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const fine = useMediaQuery(FINE_POINTER);
  const reduced = useMediaQuery(REDUCED_MOTION);
  const smooth = fine && !reduced;

  useEffect(() => {
    document.addEventListener("click", onDocumentClick);
    return () => document.removeEventListener("click", onDocumentClick);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__heavyChrome = {
      setT: (t) => {
        sceneState.t = t;
      },
      setActive: (id) => useUI.getState().setActiveSection(id),
      toast: (message) => useUI.getState().showToast(message),
    };
    return () => {
      delete window.__heavyChrome;
    };
  }, []);

  return (
    <>
      {smooth && (
        <ReactLenis root options={LENIS_OPTIONS}>
          <LenisBridge />
        </ReactLenis>
      )}
      {children}
    </>
  );
}
