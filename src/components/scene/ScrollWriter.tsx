"use client";

/**
 * The scroll writer (U5): the only writer of `sceneState.t / scrollY / scrollV / activeSection / heroVisible` and of the
 * viewport metrics after mount (DESIGN.md §9). DOM-level, mounted once by Providers; it measures every `[data-section]`
 * rect into the registry, maps scroll → journey parameter and mirrors the active section into the UI store (debounced).
 *
 * Refreshes on resize / orientation / `fonts.ready` / `load` / body size changes (ResizeObserver) / `refreshScrollMap()`.
 * A `/#id` deep link is honoured on mount with an instant jump and a camera snap (no fly-through); so is a restored
 * scroll position.
 */
import { useEffect } from "react";
import type { SectionId } from "@/lib/contracts";
import { setSectionRects } from "@/lib/registry";
import { markInput, sceneState } from "@/lib/scene-state";
import {
  activeSectionAt,
  buildScrollMap,
  heroVisibleAt,
  isSectionId,
  measureSections,
  nextVelocity,
  onScrollMapRefresh,
  requestCameraSnap,
  scrollToT,
  type ScrollMap,
  tToScrollY,
} from "@/lib/scene/scroll-map";
import { useUI } from "@/store/ui";

/** the active station reaches the UI store this long after it settles */
export const ACTIVE_DEBOUNCE_MS = 120;
/** scroll velocity decays with this time constant once scroll events stop */
const VELOCITY_TAU_MS = 90;
/** the iron name stops this far above the grab hint */
const HINT_CLEARANCE_PX = 12;

export function ScrollWriter() {
  const setActiveSection = useUI((s) => s.setActiveSection);

  useEffect(() => {
    let map: ScrollMap = buildScrollMap([]);
    let lastY = window.scrollY;
    let lastEventAt = performance.now();
    let lastTickAt = lastEventAt;
    let decayRaf = 0;
    let refreshRaf = 0;
    let mirrorTimer: ReturnType<typeof setTimeout> | undefined;
    let mirrored: SectionId | null = null;

    const viewport = () => {
      // the canvas host is 100lvh and never resizes with the phone toolbar; the aspect that frames the scene is its own
      const stage = document.querySelector<HTMLElement>(".stage");
      const vw = window.innerWidth;
      const vh = (stage && stage.clientHeight) || window.innerHeight;
      sceneState.vw = vw;
      sceneState.vh = vh;
      sceneState.aspect = vw / Math.max(1, vh);
      sceneState.portrait = sceneState.aspect < 1;
    };

    const mirror = (id: SectionId) => {
      clearTimeout(mirrorTimer);
      if (id === mirrored) return;
      mirrorTimer = setTimeout(() => {
        mirrored = id;
        setActiveSection(id);
      }, ACTIVE_DEBOUNCE_MS);
    };

    const decay = (now: number) => {
      decayRaf = 0;
      const dt = now - lastTickAt;
      lastTickAt = now;
      if (now - lastEventAt > 40) sceneState.scrollV *= Math.exp(-dt / VELOCITY_TAU_MS);
      if (Math.abs(sceneState.scrollV) < 1) {
        sceneState.scrollV = 0;
        return;
      }
      decayRaf = requestAnimationFrame(decay);
    };

    const write = (y: number, now: number, fromScroll: boolean) => {
      if (fromScroll) {
        sceneState.scrollV = nextVelocity(sceneState.scrollV, y - lastY, now - lastEventAt);
        lastEventAt = now;
        lastTickAt = now;
        if (!decayRaf) decayRaf = requestAnimationFrame(decay);
      }
      lastY = y;
      sceneState.scrollY = y;
      const t = scrollToT(map, y);
      sceneState.t = t;
      sceneState.heroVisible = heroVisibleAt(t);
      const id = activeSectionAt(map, y, window.innerHeight);
      sceneState.activeSection = id;
      mirror(id);
    };

    // the room for the iron name with the page at the top (the hero starts at y 0): the h1's box, down to just above the
    // grab hint where the layout leaves a gap under the h1 (phones); the hero camera frames the hanging name into it
    const measureHero = () => {
      const el = document.getElementById("hero-title");
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const hint = document.querySelector(".hero-hint")?.getBoundingClientRect();
      const bottom = hint && hint.height > 0 ? Math.max(r.bottom, hint.top - HINT_CLEARANCE_PX) : r.bottom;
      const y = window.scrollY;
      const vw = Math.max(1, sceneState.vw);
      const vh = Math.max(1, sceneState.vh);
      const box: [number, number, number, number] = [r.left / vw, (r.top + y) / vh, r.right / vw, (bottom + y) / vh];
      const prev = sceneState.heroBox;
      if (!prev || box.some((v, i) => Math.abs(v - prev[i]) > 0.002)) {
        sceneState.heroBox = box;
        sceneState.heroBoxSerial++;
      }
    };

    let lastWidth = -1;
    const refresh = () => {
      const tBefore = sceneState.t;
      viewport();
      const measured = measureSections();
      map = buildScrollMap(measured);
      setSectionRects(measured.map(({ id, top, height }) => ({ id, top, height })));
      measureHero();
      // a width change (rotation, window resize) reflows every section: keep the reader at the same place on the track
      const widthChanged = lastWidth > 0 && Math.abs(sceneState.vw - lastWidth) > 1;
      lastWidth = sceneState.vw;
      if (widthChanged && tBefore > 0.05) {
        window.scrollTo({ top: tToScrollY(map, tBefore), behavior: "instant" });
        requestCameraSnap();
      }
      write(window.scrollY, performance.now(), false);
    };
    const scheduleRefresh = () => {
      if (refreshRaf) return;
      refreshRaf = requestAnimationFrame(() => {
        refreshRaf = 0;
        refresh();
      });
    };
    const onScroll = () => {
      markInput();
      write(window.scrollY, performance.now(), true);
    };

    // mount: measure, honour a deep link with an instant jump, cut the camera to wherever the page starts
    refresh();
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash && isSectionId(hash)) {
      const el = document.getElementById(hash) ?? document.querySelector<HTMLElement>(`[data-section="${hash}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "instant", block: "start" });
        refresh();
      }
    }
    requestCameraSnap();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("orientationchange", scheduleRefresh);
    window.addEventListener("load", scheduleRefresh);
    if ("fonts" in document) document.fonts.ready.then(scheduleRefresh, () => {});
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(scheduleRefresh) : null;
    observer?.observe(document.body);
    const offRefresh = onScrollMapRefresh(refresh);

    return () => {
      offRefresh();
      observer?.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleRefresh);
      window.removeEventListener("orientationchange", scheduleRefresh);
      window.removeEventListener("load", scheduleRefresh);
      if (decayRaf) cancelAnimationFrame(decayRaf);
      if (refreshRaf) cancelAnimationFrame(refreshRaf);
      clearTimeout(mirrorTimer);
    };
  }, [setActiveSection]);

  return null;
}
