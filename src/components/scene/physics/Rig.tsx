"use client";

/**
 * The hero rig: the fifteen iron letters of the name on chains (DESIGN.md §4). Mount inside `<PhysicsGate>`
 * in the Canvas. Before the physics chunk lands the letters sway kinematically; it also owns the pointer input
 * (`GrabInput` / `GrabSpring`), the contact flashes and the lazy-load policy for the chunk.
 */
import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { NAME_ROWS } from "@/data/derived";
import { TIER_CONFIGS } from "@/lib/contracts";
import { useUI } from "@/store/ui";
import { ContactFlash } from "./ContactFlash";
import { HangSystem } from "./HangSystem";
import { fitScale, layoutName, quantiseAspect, useGlyphWarmup } from "./letters-bridge";
import { schedulePhysics } from "./loader";
import { usePhysicsModule } from "./PhysicsGate";
import { GrabInput, GrabSpring } from "./useGrab";

export interface RigProps {
  curveSegments?: number;
  reflections?: boolean;
  anisotropy?: boolean;
  castShadow?: boolean;
  /** entrance drop on first mount (default true; skipped automatically when the visitor already scrolled) */
  entrance?: boolean;
  /** idle gusts (default true) */
  breeze?: boolean;
}

/** kg per hero letter */
export const NAME_MASS = 12;

export function Rig({ curveSegments: curveSegmentsProp, reflections, anisotropy, castShadow, entrance = true, breeze = true }: RigProps) {
  const tier = useUI((s) => s.tier) ?? "mid";
  const cfg = TIER_CONFIGS[tier];
  const curveSegments = curveSegmentsProp ?? (cfg.curveSegments || 4);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const aspect = quantiseAspect(size.width / Math.max(1, size.height));
  const ready = useGlyphWarmup(NAME_ROWS.join(""), curveSegments);
  const mod = usePhysicsModule();
  const slots = useMemo(() => (ready ? layoutName(NAME_ROWS, aspect, curveSegments) : null), [ready, aspect, curveSegments]);

  // the physics chunk is scheduled once the entrance may run (the stage reveals the rig only after its shaders compile)
  useEffect(() => (entrance ? schedulePhysics({ canvas: gl.domElement }) : undefined), [gl, entrance]);

  if (!slots) return null;
  return (
    <>
      <HangSystem
        slots={slots}
        group="name"
        scale={fitScale(aspect)}
        mass={NAME_MASS}
        entrance={entrance}
        breeze={breeze}
        curveSegments={curveSegments}
        reflections={reflections ?? cfg.reflections}
        anisotropy={anisotropy ?? cfg.anisotropy}
        castShadow={castShadow ?? cfg.shadows}
      />
      <GrabInput />
      {mod ? <GrabSpring mod={mod} /> : null}
      <ContactFlash />
    </>
  );
}
