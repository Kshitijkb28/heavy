"use client";

import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { getConsoleFunction, setConsoleFunction, type WebGLRenderer } from "three";
import { emitScene } from "@/lib/registry";
import { useUI } from "@/store/ui";
import { setStageLive } from "./Poster";

/** How many times a lost context is answered with a canvas remount before the poster stays. */
export const MAX_REMOUNTS = 1;

/* module level: survives the remount the component itself requests */
let losses = 0;
let remounts = 0;
let recovering = false;

export function getContextLossStats(): { losses: number; remounts: number } {
  return { losses, remounts };
}

/**
 * `WEBGL_lose_context` helpers for the lab, `budget.mjs` and `window.__heavy`. A lost context answers `getExtension`
 * with null, so the extension object is cached while the context is alive (`primeLoseContext`, done by `ContextLoss`
 * and `DebugProbe` on mount); the helpers return false when there is none.
 */
const loseExt = new WeakMap<WebGLRenderer, WEBGL_lose_context | null>();
export function primeLoseContext(gl: WebGLRenderer): WEBGL_lose_context | null {
  let ext = loseExt.get(gl) ?? null;
  if (!ext) {
    ext = gl.getContext().getExtension("WEBGL_lose_context");
    if (ext) loseExt.set(gl, ext);
  }
  return ext;
}
export function loseContext(gl: WebGLRenderer): boolean {
  const ext = primeLoseContext(gl);
  if (!ext) return false;
  ext.loseContext();
  return true;
}
export function restoreContext(gl: WebGLRenderer): boolean {
  const ext = primeLoseContext(gl);
  if (!ext) return false;
  try {
    ext.restoreContext();
  } catch {
    return false; // INVALID_OPERATION: not lost, or lost by the GPU rather than by loseContext()
  }
  return true;
}

const QUIET_THREE = ["Clock: This module has been deprecated", "WebGLShadowMap: PCFSoftShadowMap has been removed"];
let quiet = false;
/**
 * Routes three's console output through a filter that drops the two deprecation notices R3F 9.8 itself triggers on
 * every canvas with three 0.186 (`THREE.Clock` in its store, `PCFSoftShadowMap` for `shadows`); everything else is
 * printed exactly as three would. Call it once before the first `<Canvas>` (module scope of the Stage).
 */
export function quietThreeDeprecations(): void {
  if (quiet || typeof window === "undefined") return;
  quiet = true;
  const previous = getConsoleFunction();
  setConsoleFunction((type, message, ...params) => {
    if (type === "warn" && QUIET_THREE.some((q) => message.includes(q))) return;
    if (previous) return previous(type, message, ...params);
    const trace = params[0] as { isStackTrace?: boolean; getError?: (m: string) => Error } | undefined;
    const out = trace?.isStackTrace && trace.getError ? [trace.getError(message)] : [message, ...params];
    if (type === "error") console.error(...out);
    else if (type === "warn") console.warn(...out);
    else console.log(...out);
  });
}

export interface ContextLossProps {
  /** remount the canvas (the Stage bumps a `key`); called once at most, `retryMs` after the loss */
  onRemount?: () => void;
  retryMs?: number;
}

/**
 * Context-loss policy (DESIGN.md §6): `webglcontextlost` → preventDefault (so the browser may restore), poster on,
 * `heavy:poster`; after `retryMs` one canvas remount through `onRemount`; a second loss leaves the poster up. If the
 * browser restores the context by itself first, the remount is cancelled and the poster goes away. Mount it inside the
 * canvas. After a remount the poster drops as soon as the fresh canvas has mounted.
 */
export function ContextLoss({ onRemount, retryMs = 1000 }: ContextLossProps) {
  const gl = useThree((s) => s.gl);
  const remountRef = useRef(onRemount);
  useEffect(() => {
    remountRef.current = onRemount;
  }, [onRemount]);

  useEffect(() => {
    const canvas = gl.domElement;
    primeLoseContext(gl);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let raf = 0;

    if (recovering) {
      // this is the remounted canvas: let it paint once, then take the poster down
      recovering = false;
      raf = requestAnimationFrame(() => {
        // clear the poster flag only: the remounted stage warms its shaders up hidden, and its reveal (Scene.tsx) is what
        // sets the stage live and fades the poster
        useUI.getState().setPoster(false);
        emitScene("poster", { reason: "remounted", losses, remounts });
      });
    }

    const onLost = (e: Event) => {
      e.preventDefault();
      losses++;
      setStageLive(false);
      useUI.getState().setPoster(true);
      emitScene("poster", { reason: "context-lost", losses, remounts });
      clearTimeout(timer);
      if (remounts < MAX_REMOUNTS && remountRef.current) {
        timer = setTimeout(() => {
          remounts++;
          recovering = true;
          // the context is already gone: R3F's unmount would call forceContextLoss() and three would warn that the
          // extension is unavailable on a dead context
          (gl as { forceContextLoss: () => void }).forceContextLoss = () => {};
          remountRef.current?.();
        }, retryMs);
      }
    };
    const onRestored = () => {
      clearTimeout(timer);
      timer = undefined;
      useUI.getState().setPoster(false);
      setStageLive(true);
      emitScene("poster", { reason: "context-restored", losses, remounts });
    };

    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [gl, retryMs]);

  return null;
}
