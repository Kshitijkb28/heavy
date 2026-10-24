/**
 * The stage loop (U5): idle accounting, half rate, demand mode, visibility (DESIGN.md §4 "Idle", §6 "Stepping and
 * pausing"). `useStageLoop()` runs inside the Canvas; the state machine (`createLoopController`, `nextLoopMode`) is plain
 * code with injectable timers, unit tested.
 *
 * Modes: "always" (every frame) → after 8 s without input and all bodies asleep "half" (R3F in demand mode, invalidated
 * every other animation frame) → after 60 s "demand" (nothing renders until input) · "never" while the tab is hidden or
 * `setActive(false)`. Any pointer / key / wheel / touch / scroll input wakes the loop.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { markInput, sceneState } from "@/lib/scene-state";

export type LoopMode = "always" | "half" | "demand" | "never";

export const LOOP = {
  halfAfterMs: 8_000,
  demandAfterMs: 60_000,
  /** render one frame in every `halfRateDivisor` animation frames while in half mode */
  halfRateDivisor: 2,
  /** frame delta clamp (s) for anything integrating time after a hidden tab */
  maxDelta: 1 / 30,
} as const;

/** Next loop mode for the current idle time (pure). Demand needs no sleeping bodies: the whole scene rests. */
export function nextLoopMode(idleMs: number, bodiesAsleep: boolean, active: boolean): LoopMode {
  if (!active) return "never";
  if (idleMs >= LOOP.demandAfterMs) return "demand";
  if (idleMs >= LOOP.halfAfterMs && bodiesAsleep) return "half";
  return "always";
}

/** Clamps a frame delta (seconds) so a tab that was hidden does not integrate a huge step; NaN/negative → the clamp. */
export function clampDelta(delta: number, max: number = LOOP.maxDelta): number {
  return delta >= 0 && delta <= max ? delta : max;
}

/**
 * Default "bodies asleep" guess when the integrator wires no Rapier check: while physics is live and the hero rig is on
 * screen the breeze keeps letters swinging, so never drop the rate there; elsewhere the bodies settle.
 */
export function defaultBodiesAsleep(): boolean {
  return sceneState.physics !== "ready" || !sceneState.heroVisible;
}

export interface LoopDeps {
  setFrameloop: (frameloop: "always" | "demand" | "never") => void;
  invalidate: () => void;
  raf: (cb: (now: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  /** called after every mode change */
  onMode?: (mode: LoopMode, active: boolean) => void;
}

export interface LoopController {
  readonly mode: LoopMode;
  /** visible and enabled */
  isActive(): boolean;
  /** any visitor input: resets the idle clock and wakes the loop */
  input(): void;
  /** tab visibility */
  setVisible(visible: boolean): void;
  /** manual switch (context loss, poster) */
  setEnabled(enabled: boolean): void;
  /** call once per rendered frame: idle accounting and the always → half/demand transitions */
  frame(bodiesAsleep: () => boolean): void;
  /** stops timers; the controller is inert afterwards */
  dispose(): void;
}

/** The loop state machine with injectable timers (the hook wires it to R3F and the DOM). */
export function createLoopController(deps: LoopDeps): LoopController {
  let mode: LoopMode = "always";
  let visible = true;
  let enabled = true;
  let raf = 0;
  let frame = 0;
  let disposed = false;
  const isActive = () => visible && enabled;

  const stopTicker = () => {
    if (raf) {
      deps.caf(raf);
      raf = 0;
    }
  };

  const tick = (now: number) => {
    raf = 0;
    if (mode !== "half") return;
    frame++;
    const idle = now - sceneState.lastInputAt;
    sceneState.idleMs = idle;
    if (idle >= LOOP.demandAfterMs) {
      apply("demand");
      return;
    }
    if (frame % LOOP.halfRateDivisor === 0) deps.invalidate();
    raf = deps.raf(tick);
  };

  const apply = (next: LoopMode) => {
    if (disposed || mode === next) return;
    stopTicker();
    mode = next;
    sceneState.active = next !== "never";
    switch (next) {
      case "always":
        deps.setFrameloop("always");
        break;
      case "half":
        deps.setFrameloop("demand");
        frame = 0;
        raf = deps.raf(tick);
        break;
      case "demand":
        deps.setFrameloop("demand");
        deps.invalidate();
        break;
      case "never":
        deps.setFrameloop("never");
        break;
    }
    deps.onMode?.(next, isActive());
  };

  const resume = () => {
    if (!isActive()) return;
    markInput(deps.now());
    apply("always");
  };

  return {
    get mode() {
      return mode;
    },
    isActive,
    input() {
      markInput(deps.now());
      if (mode !== "always") resume();
    },
    setVisible(v) {
      visible = v;
      if (v) resume();
      else apply("never");
    },
    setEnabled(v) {
      enabled = v;
      if (v) resume();
      else apply("never");
    },
    frame(bodiesAsleep) {
      const idle = deps.now() - sceneState.lastInputAt;
      sceneState.idleMs = idle;
      if (mode !== "always") return;
      const next = nextLoopMode(idle, bodiesAsleep(), isActive());
      if (next !== "always") apply(next);
    },
    dispose() {
      stopTicker();
      disposed = true;
    },
  };
}

let loopMode: LoopMode = "always";

/** Current mode, for the debug overlay (U8) and labs. */
export function getLoopMode(): LoopMode {
  return loopMode;
}

export interface StageLoopOptions {
  /** true when every rigid body sleeps (I1 wires `world.bodies` from Rapier); default `defaultBodiesAsleep` */
  bodiesAsleep?: () => boolean;
}

export interface StageLoop {
  /** page visible and not switched off: pass `paused={!active}` to `<Physics>` */
  active: boolean;
  /** current mode; pause physics in "demand" too so bodies do not move while nothing renders */
  mode: LoopMode;
  /** manual switch (context loss, poster): false parks the loop, true resumes it */
  setActive: (active: boolean) => void;
}

const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

export function useStageLoop(options: StageLoopOptions = {}): StageLoop {
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);
  const [mode, setMode] = useState<LoopMode>("always");
  const [active, setActiveState] = useState(true);
  const asleepRef = useRef<(() => boolean) | undefined>(undefined);
  const controller = useRef<LoopController | null>(null);

  useEffect(() => {
    asleepRef.current = options.bodiesAsleep;
  });

  useEffect(() => {
    const ctrl = createLoopController({
      setFrameloop,
      invalidate: () => invalidate(),
      raf: (cb) => window.requestAnimationFrame(cb),
      caf: (id) => window.cancelAnimationFrame(id),
      now: () => performance.now(),
      onMode: (m, isActive) => {
        loopMode = m;
        setMode(m);
        setActiveState(isActive);
      },
    });
    controller.current = ctrl;
    markInput();
    ctrl.setVisible(!document.hidden);

    const onInput = () => ctrl.input();
    const onVisibility = () => ctrl.setVisible(!document.hidden);
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput);
      document.removeEventListener("visibilitychange", onVisibility);
      ctrl.dispose();
      controller.current = null;
      loopMode = "always";
      sceneState.active = true;
      setFrameloop("always");
    };
  }, [invalidate, setFrameloop]);

  useFrame(() => {
    controller.current?.frame(asleepRef.current ?? defaultBodiesAsleep);
  });

  const setActive = useCallback((on: boolean) => {
    controller.current?.setEnabled(on);
  }, []);

  return { active, mode, setActive };
}
