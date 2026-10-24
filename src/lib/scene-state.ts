import type { PhysicsStatus, SectionId, Tier } from "./contracts";

/**
 * The 60 Hz state of the stage: a plain mutable singleton. Writers: the scroll writer (U5 `scroll-map.ts`), the input
 * layer (U3 `useGrab.ts`), the beacon (U4), the loop (U5 `loop.ts`), tier init (U8). Readers: `useFrame` callbacks only.
 * React components never subscribe to this object; what the UI needs at low frequency is mirrored into `store/ui.ts`.
 */
export interface SceneState {
  /** journey parameter 0 (hero) … 7 (footer), continuous; = section index + local progress */
  t: number;
  /** document scroll position (px) and velocity (px/s) */
  scrollY: number;
  scrollV: number;
  /** viewport metrics (CSS px); `portrait` selects the keyframe table */
  vw: number;
  vh: number;
  aspect: number;
  portrait: boolean;
  /** beacon rotation in radians (U4 writes it each frame and mirrors it to the `--beacon` CSS custom property) */
  beaconAngle: number;
  /** normalised device coordinates of the fine pointer, NaN when there is none */
  pointerNdc: [number, number];
  /** last pointer position projected onto the hero plane (z = 0), for the hand light and grab springs */
  pointerWorld: [number, number, number];
  /** current grab: id of the held body or null */
  grabId: string | null;
  physics: PhysicsStatus;
  /** page visible and the frame loop running */
  active: boolean;
  /** ms since the last pointer/scroll/key input */
  idleMs: number;
  lastInputAt: number;
  tier: Tier;
  activeSection: SectionId;
  reducedMotion: boolean;
  /** hero rig is within the viewport (physics interactive, drop/hoist allowed) */
  heroVisible: boolean;
  /** entrance choreography finished (letters dropped and settled once) */
  entered: boolean;
  /**
   * the room for the iron name with the page at the top — the DOM h1's box, down to the grab hint where there is a gap —
   * as fractions [left, top, right, bottom] of the canvas viewport (null until measured): the hero camera fits the
   * hanging name into this box, so the DOM layout and the 3D name never collide
   */
  heroBox: [number, number, number, number] | null;
  /** increments whenever `heroBox` changes (the camera rig rebuilds its track) */
  heroBoxSerial: number;
}

export const sceneState: SceneState = {
  t: 0,
  scrollY: 0,
  scrollV: 0,
  vw: 1440,
  vh: 900,
  aspect: 1.6,
  portrait: false,
  beaconAngle: 0,
  pointerNdc: [NaN, NaN],
  pointerWorld: [0, 2.4, 0],
  grabId: null,
  physics: "idle",
  active: true,
  idleMs: 0,
  lastInputAt: 0,
  tier: "mid",
  activeSection: "hero",
  reducedMotion: false,
  heroVisible: true,
  entered: false,
  heroBox: null,
  heroBoxSerial: 0,
};

/** Call from any input handler so idle timers and the loop know the visitor is here. */
export function markInput(now: number = performance.now()): void {
  sceneState.lastInputAt = now;
  sceneState.idleMs = 0;
}
