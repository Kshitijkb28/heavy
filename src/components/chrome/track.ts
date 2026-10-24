/** Stations on the track: HOME (t 0) … CONTACT (t 6). The footer (t 7) holds at the end. */
export const TRACK_SPAN = 6;

/** Rail progress 0 … 1 from the journey parameter `t` (`sceneState.t / 6`, clamped; NaN or ±∞ read as 0). */
export function markerProgress(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.min(1, Math.max(0, t / TRACK_SPAN));
}
