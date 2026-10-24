"use client";

/**
 * The pointer state machine of DESIGN.md §4 "Grab / throw".
 * Desktop: pointerdown raycasts the registered grabbables; while held, `GrabSpring` applies a hand-spring impulse
 * at the grab point toward the pointer projected onto the camera-facing plane through that point; release keeps
 * the body's velocity (the throw). Touch: `touch-action: pan-y` on the canvas; a grab starts only on a hold
 * ≥ 180 ms with < 6 px movement or a horizontal move > 8 px with |dx| > |dy|; only then the pointer is captured
 * and a non-passive touchmove preventDefault keeps the page still; pointercancel drops it; a plain tap nudges.
 * Vertical pans are never intercepted. Writes `sceneState.grabId / pointerNdc / pointerWorld`, `markInput()`,
 * emits `heavy:grab` / `heavy:release`, sets `grab` / `grabbing` cursors and dismisses the hint.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Plane, Quaternion, Vector2, Vector3, type Object3D } from "three";
import type { Vec3 } from "@/lib/contracts";
import { emitScene, getGrabbables } from "@/lib/registry";
import { markInput, sceneState } from "@/lib/scene-state";
import { useUI } from "@/store/ui";
import { classifyTouchMove, HOLD_MS, isTap, nudgeImpulse, springImpulse } from "./grab-intent";
import type { RapierModule } from "./loader";
import { getHandle, physicsStats, poseOf, type LetterHandle } from "./rigState";

export interface ActiveGrab {
  id: string;
  pointerId: number;
  pointerType: string;
  /** grab point in the letter's local frame (world units) */
  local: Vector3;
  /** camera-facing plane through the grab point */
  plane: Plane;
  /** pointer projected onto that plane */
  target: Vector3;
  startedAt: number;
}

/** The live grab (one at a time): read by `GrabSpring`, the kinematic drag and the lab. */
export const grab: { current: ActiveGrab | null } = { current: null };

interface Hit {
  handle: LetterHandle;
  point: Vector3;
  object: Object3D;
}

interface TouchTrack {
  pointerId: number;
  x0: number;
  y0: number;
  t0: number;
  hit: Hit;
  timer: number;
}

const HERO_PLANE = new Plane(new Vector3(0, 0, 1), 0);
const _inv = new Quaternion();

function isDescendant(root: Object3D, node: Object3D): boolean {
  let n: Object3D | null = node;
  while (n) {
    if (n === root) return true;
    n = n.parent;
  }
  return false;
}

export function useGrab(): void {
  const get = useThree((s) => s.get);
  const hover = useRef({ id: null as string | null, frame: 0, fine: false });

  useEffect(() => {
    const el = get().gl.domElement;
    // vertical pans scroll and two-finger pinches zoom the page; a grab claims the pointer only after intent
    el.style.touchAction = "pan-y pinch-zoom";
    const ndc = new Vector2();
    const worldPoint = new Vector3();
    const camDir = new Vector3();
    let touch: TouchTrack | null = null;
    let last = { x: 0, y: 0 };
    const hoverState = hover.current;

    const toNdc = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      ndc.set(((clientX - r.left) / Math.max(1, r.width)) * 2 - 1, -((clientY - r.top) / Math.max(1, r.height)) * 2 + 1);
      return ndc;
    };
    const writePointer = (clientX: number, clientY: number) => {
      const { camera, raycaster } = get();
      toNdc(clientX, clientY);
      sceneState.pointerNdc[0] = ndc.x;
      sceneState.pointerNdc[1] = ndc.y;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(HERO_PLANE, worldPoint)) {
        sceneState.pointerWorld[0] = worldPoint.x;
        sceneState.pointerWorld[1] = worldPoint.y;
        sceneState.pointerWorld[2] = worldPoint.z;
      }
    };
    const pick = (clientX: number, clientY: number): Hit | null => {
      const { camera, raycaster } = get();
      raycaster.setFromCamera(toNdc(clientX, clientY), camera);
      const grabbables = getGrabbables();
      const hits = raycaster.intersectObjects(
        grabbables.map((g) => g.mesh),
        true,
      );
      for (const h of hits) {
        const g = grabbables.find((c) => c.mesh === h.object || isDescendant(c.mesh, h.object));
        if (!g) continue;
        const handle = getHandle(g.id);
        if (!handle || handle.controller?.hoisting) continue;
        return { handle, point: h.point.clone(), object: h.object };
      }
      return null;
    };
    const preventScroll = (e: TouchEvent) => {
      if (grab.current) e.preventDefault();
    };
    const startGrab = (pointerId: number, pointerType: string, hit: Hit) => {
      const { camera } = get();
      const h = hit.handle;
      const now = performance.now();
      const pose = poseOf(h.id);
      const local = hit.point.clone().sub(pose.p).applyQuaternion(_inv.copy(pose.q).invert());
      camera.getWorldDirection(camDir);
      const plane = new Plane().setFromNormalAndCoplanarPoint(camDir, hit.point);
      grab.current = { id: h.id, pointerId, pointerType, local, plane, target: hit.point.clone(), startedAt: now };
      sceneState.grabId = h.id;
      physicsStats.grabId = h.id;
      h.controller?.setGrabbed(true, now);
      h.body?.wakeUp();
      h.touch();
      try {
        el.setPointerCapture(pointerId);
      } catch {
        /* capture is best-effort */
      }
      if (pointerType === "touch") el.addEventListener("touchmove", preventScroll, { passive: false });
      el.style.cursor = "grabbing";
      useUI.getState().dismissHint();
      markInput(now);
      emitScene("grab", { id: h.id, pointerType });
    };
    const endGrab = (reason: "release" | "cancel") => {
      const g = grab.current;
      if (!g) return;
      grab.current = null;
      const now = performance.now();
      const h = getHandle(g.id);
      h?.controller?.setGrabbed(false, now);
      let speed = 0;
      if (h?.body) {
        const v = h.body.linvel();
        speed = Math.hypot(v.x, v.y, v.z);
      }
      sceneState.grabId = null;
      physicsStats.grabId = null;
      try {
        if (el.hasPointerCapture(g.pointerId)) el.releasePointerCapture(g.pointerId);
      } catch {
        /* nothing to release */
      }
      el.removeEventListener("touchmove", preventScroll);
      el.style.cursor = hoverState.id ? "grab" : "";
      markInput(now);
      emitScene("release", { id: g.id, speed, reason });
    };
    const updateTarget = (clientX: number, clientY: number) => {
      const g = grab.current;
      if (!g) return;
      const { camera, raycaster } = get();
      raycaster.setFromCamera(toNdc(clientX, clientY), camera);
      if (raycaster.ray.intersectPlane(g.plane, worldPoint)) g.target.copy(worldPoint);
    };
    const clearTouch = () => {
      if (!touch) return;
      window.clearTimeout(touch.timer);
      touch = null;
    };
    const nudge = (hit: Hit) => {
      const h = hit.handle;
      const side = hit.point.x - poseOf(h.id).p.x;
      const point: Vec3 = [hit.point.x, hit.point.y, hit.point.z];
      h.kick(nudgeImpulse(h.mass, h.scale, side), point, true);
      markInput();
    };

    const onDown = (e: PointerEvent) => {
      // a second finger means a pinch: drop any pending or live touch grab so the browser can zoom (touch-action allows it)
      if (!e.isPrimary) {
        if (touch) clearTouch();
        if (grab.current?.pointerType === "touch") endGrab("cancel");
        return;
      }
      if (grab.current) return;
      const isTouch = e.pointerType === "touch";
      if (!isTouch && e.button !== 0) return;
      hoverState.fine = !isTouch;
      markInput();
      if (!isTouch) writePointer(e.clientX, e.clientY);
      const hit = pick(e.clientX, e.clientY);
      last = { x: e.clientX, y: e.clientY };
      if (isTouch) {
        clearTouch();
        if (!hit) return; // nothing under the finger: the browser scrolls
        const pointerId = e.pointerId;
        touch = {
          pointerId,
          x0: e.clientX,
          y0: e.clientY,
          t0: performance.now(),
          hit,
          timer: window.setTimeout(() => {
            if (!touch || touch.pointerId !== pointerId || grab.current) return;
            const t = touch;
            touch = null;
            startGrab(t.pointerId, "touch", t.hit);
            writePointer(last.x, last.y);
            updateTarget(last.x, last.y);
          }, HOLD_MS),
        };
        return;
      }
      if (hit) startGrab(e.pointerId, e.pointerType, hit);
    };
    const onMove = (e: PointerEvent) => {
      const isTouch = e.pointerType === "touch";
      if (!isTouch) {
        hoverState.fine = true;
        writePointer(e.clientX, e.clientY);
        markInput();
      }
      last = { x: e.clientX, y: e.clientY };
      if (touch && !grab.current && e.pointerId === touch.pointerId) {
        const phase = classifyTouchMove(e.clientX - touch.x0, e.clientY - touch.y0, performance.now() - touch.t0);
        if (phase === "grab") {
          const t = touch;
          clearTouch();
          startGrab(t.pointerId, "touch", t.hit);
        } else if (phase === "scroll") {
          clearTouch();
        }
      }
      const g = grab.current;
      if (g && e.pointerId === g.pointerId) {
        if (isTouch) {
          writePointer(e.clientX, e.clientY);
          markInput();
        }
        updateTarget(e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (touch && !grab.current && e.pointerId === touch.pointerId) {
        const t = touch;
        clearTouch();
        if (isTap(e.clientX - t.x0, e.clientY - t.y0, performance.now() - t.t0)) nudge(t.hit);
      }
      const g = grab.current;
      if (g && e.pointerId === g.pointerId) endGrab("release");
    };
    const onCancel = (e: PointerEvent) => {
      if (touch && e.pointerId === touch.pointerId) clearTouch();
      const g = grab.current;
      if (g && e.pointerId === g.pointerId) endGrab("cancel");
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return; // still inside the window
      sceneState.pointerNdc[0] = NaN;
      sceneState.pointerNdc[1] = NaN;
      if (!grab.current) {
        hoverState.id = null;
        el.style.cursor = "";
      }
    };
    const onBlur = () => {
      clearTouch();
      endGrab("cancel");
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("pointerout", onOut);
    window.addEventListener("blur", onBlur);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerout", onOut);
      window.removeEventListener("blur", onBlur);
      clearTouch();
      endGrab("cancel");
      el.style.cursor = "";
    };
  }, [get]);

  // hover cursor (fine pointers, every other frame) and the kinematic drag
  useFrame((state, delta) => {
    const g = grab.current;
    if (g) {
      const h = getHandle(g.id);
      if (h && !h.body) h.drag?.(g.target, Math.min(delta, 1 / 30));
      return;
    }
    const hs = hover.current;
    if (!hs.fine) return;
    const [x, y] = sceneState.pointerNdc;
    if (Number.isNaN(x)) return;
    if ((hs.frame++ & 1) === 0) return;
    const grabbables = getGrabbables();
    state.raycaster.setFromCamera(new Vector2(x, y), state.camera);
    const hits = state.raycaster.intersectObjects(
      grabbables.map((c) => c.mesh),
      true,
    );
    let id: string | null = null;
    for (const h of hits) {
      const c = grabbables.find((c) => c.mesh === h.object || isDescendant(c.mesh, h.object));
      if (c && !getHandle(c.id)?.controller?.hoisting) {
        id = c.id;
        break;
      }
    }
    if (id !== hs.id) {
      hs.id = id;
      state.gl.domElement.style.cursor = id ? "grab" : "";
    }
  });
}

/** Mount once inside the Canvas (Rig does this). */
export function GrabInput(): null {
  useGrab();
  return null;
}

const _p = new Vector3();
const _q = new Quaternion();
const _point = new Vector3();
const _v = new Vector3();
const _w = new Vector3();
const _r = new Vector3();

/** The hand spring, stepped before every physics step; mount inside a live `<Physics>` (Rig does this). */
export function GrabSpring({ mod }: { mod: RapierModule }): null {
  const { useBeforePhysicsStep } = mod;
  useBeforePhysicsStep(() => {
    const g = grab.current;
    if (!g) return;
    const h = getHandle(g.id);
    if (!h?.body || h.controller?.hoisting) return;
    const body = h.body;
    const t = body.translation();
    const r = body.rotation();
    _p.set(t.x, t.y, t.z);
    _q.set(r.x, r.y, r.z, r.w);
    _point.copy(g.local).applyQuaternion(_q).add(_p);
    const lv = body.linvel();
    const av = body.angvel();
    const com = body.worldCom();
    _v.set(lv.x, lv.y, lv.z);
    _w.set(av.x, av.y, av.z);
    _r.set(_point.x - com.x, _point.y - com.y, _point.z - com.z);
    _v.add(_w.cross(_r));
    const j = springImpulse([g.target.x, g.target.y, g.target.z], [_point.x, _point.y, _point.z], [_v.x, _v.y, _v.z], h.mass, 1 / 60);
    body.applyImpulseAtPoint({ x: j[0], y: j[1], z: j[2] }, _point, true);
  });
  return null;
}
