"use client";

/**
 * The seam between U3 (physics) and U2 (letters): U2's glyph extrusion, `LetterMesh` and heat are used as shipped; the
 * hanging layout and the chain links are U3's own (`layout-fallback.ts`, `ChainsFallback.tsx`), which the physics,
 * the walls and the camera table (`src/lib/scene/places.ts` WORLD.name) are tuned to.
 */
import { useEffect, useState } from "react";
import { getGlyph, isGlyphCached, isTypefaceReady, loadTypeface, type GlyphData } from "@/components/scene/letters/glyphs";
import { LetterMesh, type LetterMeshProps } from "@/components/scene/letters/LetterMesh";
import type { Vec3 } from "@/lib/contracts";
import * as fallback from "./layout-fallback";

export { getGlyph, loadTypeface, LetterMesh };
export type { GlyphData, LetterMeshProps };
export type { LetterSlot, HeroFit } from "./layout-fallback";
export { fitScale, quantiseAspect, ATTACH_Y, RAIL_Y } from "./layout-fallback";
export { Chains } from "./ChainsFallback";

const advanceAt = (curveSegments: number) => (char: string) => getGlyph(char, curveSegments).advance;

/** The two hero rows laid out on the rail (U2 contract: `layoutName(rows, aspect)`); call after the glyphs are warm. */
export function layoutName(rows: readonly [string, string], aspect: number, curveSegments = 4): fallback.LetterSlot[] {
  return fallback.layoutName(rows, aspect, advanceAt(curveSegments));
}

/** A word hung from the rail centred at `origin` (U2 contract: `layoutWord(word, origin, scale?)`). */
export function layoutWord(word: string, origin: Vec3, scale = 1, curveSegments = 4): fallback.LetterSlot[] {
  return fallback.layoutWord(word, origin, scale, advanceAt(curveSegments));
}

/** Camera distance / visible half-width at the rig plane for these slots (U5 `fitDistance` stand-in). */
export function heroFitForSlots(slots: readonly fallback.LetterSlot[], aspect: number, curveSegments = 4): fallback.HeroFit {
  const scale = fallback.fitScale(aspect);
  return fallback.heroFit(aspect, fallback.blockWidth(slots, scale, advanceAt(curveSegments)));
}

/** Heat pulse: U2's signal-red emissive concentrated on the bevels (also drives the floor reflection), v 0–1. */
export { setHeat } from "@/components/scene/letters/materials";

/**
 * Load the typeface and extrude the glyphs of `chars` three per frame so nothing blocks (DESIGN.md §4).
 * Returns true once every glyph is cached; `layoutName`/`getGlyph` are then synchronous.
 */
export function useGlyphWarmup(chars: string, curveSegments: number): boolean {
  // already extruded (a remount, e.g. the kinematic → physics hand-off): ready in the same render, so the letters never blink
  const [ready, setReady] = useState(() => isTypefaceReady() && [...new Set([...chars].filter((c) => c !== " "))].every((c) => isGlyphCached(c, curveSegments)));
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const unique = [...new Set([...chars].filter((c) => c !== " "))];
    loadTypeface()
      .then(() => {
        if (cancelled) return;
        let i = 0;
        const tick = () => {
          if (cancelled) return;
          for (let n = 0; n < 3 && i < unique.length; n++, i++) getGlyph(unique[i], curveSegments);
          if (i < unique.length) raf = requestAnimationFrame(tick);
          else setReady(true);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [chars, curveSegments]);
  return ready;
}
