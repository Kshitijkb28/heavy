"use client";

import { create } from "zustand";
import { useUI } from "@/store/ui";
import styles from "./poster.module.css";

/**
 * Whether the WebGL stage has painted and owns the picture. The Stage (I1) calls `setStageLive(true)` from the canvas's
 * `onCreated` (or its first frame) and `setStageLive(false)` when it unmounts; `ContextLoss` flips it on a lost context.
 * Low-frequency, so a tiny store rather than `sceneState`.
 */
interface StageLiveState {
  live: boolean;
  setLive: (live: boolean) => void;
}
const useStageLiveStore = create<StageLiveState>((set) => ({ live: false, setLive: (live) => set({ live }) }));

export function setStageLive(live: boolean): void {
  useStageLiveStore.getState().setLive(live);
}
export function useStageLive(): boolean {
  return useStageLiveStore((s) => s.live);
}

export interface PosterProps {
  /** force the state; by default on while `useUI.poster`, before the tier is known (SSR), on low, or until the stage is live */
  visible?: boolean;
}

/**
 * The CSS poster (DESIGN.md §6 / §8): the Night Rig without WebGL. Server-rendered so the key-light pool is under the h1
 * at 0 ms; it stays for the low tier, for lost contexts and while the ladder's last rung is the poster, and fades in
 * 600 ms once the stage is live. Layers: wet floor with a horizon hairline and the pool's reflection, the key-light cone
 * from the rail, the mercury pool where the name hangs, the red beacon with its slow sweep (full motion only), grain.
 * Fixed, `z-index: 0`: mount it after the canvas (same z-index, later in DOM order) so it covers a dead context, and
 * under `.page` (z 1) so text stays on top. Never receives pointer events.
 */
export function Poster({ visible }: PosterProps) {
  const poster = useUI((s) => s.poster);
  const tier = useUI((s) => s.tier);
  const live = useStageLive();
  const on = visible ?? (poster || tier === null || tier === "low" || !live);
  return (
    <div className={styles.poster} data-poster="" data-state={on ? "on" : "off"} aria-hidden="true">
      <div className={styles.floor} />
      <div className={styles.cone} />
      <div className={styles.pool} />
      <div className={styles.beacon}>
        <span className={styles.sweep} />
      </div>
      <div className={styles.grain} />
    </div>
  );
}
