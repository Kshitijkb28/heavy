/**
 * When the stage became visible (performance.now()), or 0 while the shader warm-up keeps it hidden (Scene.tsx). Effects
 * with their own timing — the key-cone fade, the beacon spin-up, the frame guard's warm-up, the hero hand-off — start
 * from the reveal, so a slow warm-up never spends them behind the poster.
 */
export const stageReveal = { at: 0 };

export function markStageRevealed(now: number = performance.now()): void {
  stageReveal.at = now;
}

export function markStageHidden(): void {
  stageReveal.at = 0;
}

/** ms since the reveal, or -1 while the stage is hidden. */
export function sinceReveal(now: number = performance.now()): number {
  return stageReveal.at > 0 ? now - stageReveal.at : -1;
}
