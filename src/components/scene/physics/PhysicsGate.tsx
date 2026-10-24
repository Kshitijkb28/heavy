"use client";

/**
 * Mounts `@react-three/rapier`'s `<Physics>` around its children once the lazily loaded chunk is in
 * (`loader.ts`), and renders the children plainly (kinematic letters) before that. The switch happens inside a
 * transition on an already-mounted Suspense boundary, so React keeps the kinematic letters on screen while
 * `<Physics>` suspends on its wasm init: no blink, and `HangSystem` carries the poses across the remount.
 *
 * Integration (I1): `<PhysicsGate paused={!active}><Rig /><Initials /><Walls /></PhysicsGate>` inside the Canvas.
 * The stepper is held paused for two frames after mount and after every unpause so rapier's independent
 * rAF loop never bursts a 0.5 s catch-up (its first delta is measured from time 0 / the hidden-tab gap).
 */
import { createContext, startTransition, Suspense, useContext, useEffect, useState, type ReactNode } from "react";
import { getRapierModule, onPhysicsReady, type RapierModule } from "./loader";

const PhysicsModuleContext = createContext<RapierModule | null>(null);

/** The rapier module when rendered inside a live `<Physics>`; null in kinematic mode. */
export function usePhysicsModule(): RapierModule | null {
  return useContext(PhysicsModuleContext);
}

export interface PhysicsGateProps {
  children: ReactNode;
  /** pause stepping (hidden tab, demand mode) */
  paused?: boolean;
  gravity?: [number, number, number];
}

const GRAVITY: [number, number, number] = [0, -9.81, 0];

export function PhysicsGate({ children, paused = false, gravity = GRAVITY }: PhysicsGateProps) {
  const [mod, setMod] = useState<RapierModule | null>(getRapierModule);
  const [stepping, setStepping] = useState(false);

  useEffect(
    () =>
      onPhysicsReady((m) => {
        startTransition(() => setMod(m));
      }),
    [],
  );

  // warm-up: (re)start stepping two frames after the loop is allowed to run
  useEffect(() => {
    if (!mod) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      frames++;
      if (paused) setStepping(false);
      else if (frames >= 2) setStepping(true);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, mod]);

  const Physics = mod?.Physics;
  return (
    <Suspense fallback={null}>
      {mod && Physics ? (
        <Physics timeStep={1 / 60} updateLoop="independent" interpolate paused={paused || !stepping} colliders={false} gravity={gravity}>
          <PhysicsModuleContext.Provider value={mod}>{children}</PhysicsModuleContext.Provider>
        </Physics>
      ) : (
        <PhysicsModuleContext.Provider value={null}>{children}</PhysicsModuleContext.Provider>
      )}
    </Suspense>
  );
}
