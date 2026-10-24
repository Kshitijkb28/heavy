"use client";

/**
 * The keyboard way in (DESIGN.md §4 "Keyboard"): a real 44 px button, "Give the letters a push", that applies
 * random impulses to every name letter (`pushAll()`); Space (native click) pushes again, the arrow keys bias the
 * direction. U6 renders `<PushButton />` in the hero; U1 styles `.push-button`. Hidden when the stage is a poster.
 */
import clsx from "clsx";
import type { KeyboardEvent } from "react";
import type { Vec3 } from "@/lib/contracts";
import { getGrabbables, pushAll } from "@/lib/registry";
import { markInput } from "@/lib/scene-state";
import { useUI } from "@/store/ui";
import { biasedImpulse } from "./breeze";
import { ensurePhysics } from "./loader";

/** N·s per letter (12 kg → ≈ 1.8 m/s): a lively swing and a few clangs, never enough to snap a chain */
export const PUSH_MAGNITUDE = 22;

const ARROWS: Record<string, Vec3> = {
  ArrowLeft: [-1, 0.25, 0],
  ArrowRight: [1, 0.25, 0],
  ArrowUp: [0, 1, 0],
  ArrowDown: [0, -0.4, 0.9],
};

/** Push every letter of `group` roughly along `dir` (keyboard arrows). */
export function pushBiased(dir: Vec3, magnitude = PUSH_MAGNITUDE, group = "name"): void {
  for (const g of getGrabbables()) {
    if (g.group !== group) continue;
    g.push(biasedImpulse(dir, magnitude, Math.random));
  }
}

export function PushButton({ className }: { className?: string }) {
  const poster = useUI((s) => s.poster);
  if (poster) return null;

  const onClick = () => {
    markInput();
    ensurePhysics().catch(() => {});
    pushAll(PUSH_MAGNITUDE);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const dir = ARROWS[e.key];
    if (!dir) return;
    e.preventDefault();
    markInput();
    pushBiased(dir);
  };

  return (
    <button type="button" className={clsx("push-button", "btn", "btn--ghost", className)} onClick={onClick} onKeyDown={onKeyDown}>
      Give the letters a push
    </button>
  );
}
