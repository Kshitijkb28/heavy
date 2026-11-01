"use client";

/**
 * The iron project initials, one per project, hanging beside their cards at `INITIALS.zs` (z −24 / −30 / −36 for three,
 * DESIGN.md §3), the same hang system as the name; each is its own registry group (the project id) so
 * `pushAll(m, projectId)` works.
 */
import { useMemo } from "react";
import { projects } from "@/data/resume";
import { TIER_CONFIGS } from "@/lib/contracts";
import { INITIALS } from "@/components/scene/world/layout";
import { useUI } from "@/store/ui";
import { HangSystem } from "./HangSystem";
import { layoutWord, useGlyphWarmup, type LetterSlot } from "./letters-bridge";

export const INITIAL_X = 2.6;
export const INITIAL_Y = 2.5;
export const INITIAL_Z: readonly number[] = INITIALS.zs;
export const INITIAL_SCALE = 2.2;
export const INITIAL_MASS = 18;

export function initialId(projectId: string): string {
  return `initial-${projectId}`;
}

export interface InitialsProps {
  curveSegments?: number;
  reflections?: boolean;
  anisotropy?: boolean;
  castShadow?: boolean;
}

export function Initials({ curveSegments: curveSegmentsProp, reflections, anisotropy, castShadow }: InitialsProps) {
  const tier = useUI((s) => s.tier) ?? "mid";
  const cfg = TIER_CONFIGS[tier];
  const curveSegments = curveSegmentsProp ?? (cfg.curveSegments || 4);
  const ready = useGlyphWarmup(projects.map((p) => p.initial).join(""), curveSegments);
  const perProject = useMemo(
    () =>
      ready
        ? projects.map((p, i): LetterSlot[] => {
            const slot = layoutWord(p.initial, [INITIAL_X, INITIAL_Y, INITIAL_Z[i] ?? -24 - 6 * i], INITIAL_SCALE, curveSegments)[0];
            return [{ ...slot, id: initialId(p.id) }];
          })
        : null,
    [ready, curveSegments],
  );

  if (!perProject) return null;
  return (
    <>
      {projects.map((p, i) => (
        <HangSystem
          key={p.id}
          slots={perProject[i]}
          group={p.id}
          scale={INITIAL_SCALE}
          mass={INITIAL_MASS}
          curveSegments={curveSegments}
          reflections={reflections ?? cfg.reflections}
          anisotropy={anisotropy ?? cfg.anisotropy}
          castShadow={castShadow ?? cfg.shadows}
        />
      ))}
    </>
  );
}
