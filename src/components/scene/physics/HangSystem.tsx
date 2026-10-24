"use client";

/**
 * A set of iron letters hanging from the rail on chains — the hero name (`Rig`) and the project initials
 * (`Initials`) share it. Two modes behind one interface:
 *  - kinematic (before the physics chunk is in): scripted pendulums (`sway.ts`), the entrance drop, the hover
 *    spring, breeze gusts and pointer nudges, all driven from useFrame;
 *  - live (inside `<Physics>`): one dynamic RigidBody + convex hull per letter, the shared static anchor body,
 *    a `HangController` per letter (soft rope + hard rope joint, snap, hoist), contact reports, breeze.
 * Poses are written to `rigState` every frame so the live mode starts exactly where the kinematic one stopped.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, Mesh, Quaternion, Vector3 } from "three";
import type { ContactForcePayload, RapierCollider, RapierRigidBody } from "@react-three/rapier";
import type { Vec3 } from "@/lib/contracts";
import { emitScene, registerGrabbable } from "@/lib/registry";
import { sceneState } from "@/lib/scene-state";
import { CONTACT_HEAT_FACTOR, ENTRANCE_GRACE_MS, G, HangController } from "./breakHoist";
import { BREEZE_MS, breezeActive, gustAt, gustImpulse, hash01 } from "./breeze";
import { scaleHull } from "@/components/scene/letters/glyphs";
import { ATTACH_Y, Chains, getGlyph, LetterMesh, type LetterSlot } from "./letters-bridge";
import type { RapierModule } from "./loader";
import { usePhysicsModule } from "./PhysicsGate";
import { beginEntrance, deleteHandle, entrance, finishEntrance, getHandle, hasPose, physicsStats, poseOf, reportContact, setHandle, swayOf, type LetterHandle } from "./rigState";
import { releaseStaticBody, retainStaticBody } from "./statics";
import { DROP_START_M, DROP_STAGGER_MS, dropExtension, dropSettled, hoverPush, kickSway, stepSway, swayOffset } from "./sway";
import { grab } from "./useGrab";

export interface HangSystemProps {
  slots: readonly LetterSlot[];
  /** registry group: "name" or a project id */
  group: string;
  /** uniform letter scale (portrait hero rows shrink; initials grow) */
  scale?: number;
  /** kg per letter */
  mass?: number;
  /** run the entrance drop choreography (hero only) */
  entrance?: boolean;
  /** idle gusts every 4 s (hero only) */
  breeze?: boolean;
  curveSegments?: number;
  reflections?: boolean;
  anisotropy?: boolean;
  castShadow?: boolean;
  linksPerChain?: number;
}

interface MeshProps {
  curveSegments: number;
  reflections: boolean;
  anisotropy: boolean;
  castShadow: boolean;
}

/** hover spring reach (m at scale 1) and strength (N·s per kg per second) */
const HOVER_RADIUS = 0.9;
const HOVER_STRENGTH = 2.4;
/** kinematic drag: pull per metre of offset, N·s per kg per second */
const DRAG_GAIN = 7;
/** breeze clock survives the kinematic → live remount */
const breezeClock = { next: 2600, k: 0 };

const DOWN = new Vector3(0, -1, 0);
const _off = new Vector3();
const _dir = new Vector3();
const _pos = new Vector3();
const _q = new Quaternion();
const _stub = new Vector3();
const _cp = new Vector3();

function shouldSkipEntrance(): boolean {
  return sceneState.scrollY > 4 || sceneState.t > 0.05;
}

/** Shared by both modes: the chain's lower end for `Chains` (a short swinging stub while a chain is broken). */
function useChainEnd(scale: number) {
  return useCallback(
    (id: string): Vector3 | null => {
      const h = getHandle(id);
      const c = h?.controller;
      if (h && c && !c.attached && !c.hoisting) {
        const t = performance.now();
        const amp = Math.exp(-(t - c.snappedAt) / 2500);
        const a = h.anchor;
        _stub.set(a[0] + 0.12 * amp * Math.sin(t / 320), a[1] - 0.42 * scale, a[2] + 0.07 * amp * Math.cos(t / 410));
        return _stub;
      }
      return hasPose(id) ? poseOf(id).attach : null;
    },
    [scale],
  );
}

/** Shared by both modes: a coherent gust every 4 s while the hero is in view and the visitor is not idle. */
function useBreeze(slots: readonly LetterSlot[], enabled: boolean) {
  useFrame((_, delta) => {
    if (!enabled) return;
    breezeClock.next -= delta * 1000;
    if (breezeClock.next > 0) return;
    breezeClock.next = BREEZE_MS;
    if (!breezeActive(sceneState.heroVisible, sceneState.idleMs)) return;
    const gust = gustAt(breezeClock.k++);
    slots.forEach((slot, i) => {
      const h = getHandle(slot.id);
      if (!h || (h.controller && !h.controller.attached)) return;
      h.kick(gustImpulse(gust, h.mass, h.scale, hash01(breezeClock.k * 31 + i)), undefined, false);
    });
  });
}

export function HangSystem({
  slots,
  group,
  scale = 1,
  mass = 12,
  entrance: entranceEnabled = false,
  breeze = false,
  curveSegments = 4,
  reflections = false,
  anisotropy = false,
  castShadow = true,
  linksPerChain = 10,
}: HangSystemProps) {
  const mod = usePhysicsModule();
  const meshProps = useMemo<MeshProps>(() => ({ curveSegments, reflections, anisotropy, castShadow }), [curveSegments, reflections, anisotropy, castShadow]);
  const common = { slots, group, scale, mass, entranceEnabled, breeze, meshProps, linksPerChain };
  return mod ? <LiveHang {...common} mod={mod} /> : <KinematicHang {...common} />;
}

interface ModeProps {
  slots: readonly LetterSlot[];
  group: string;
  scale: number;
  mass: number;
  entranceEnabled: boolean;
  breeze: boolean;
  meshProps: MeshProps;
  linksPerChain: number;
}

/* ------------------------------------------------------------------ kinematic ------------------------------------------------------------------ */

function KinematicHang({ slots, group, scale, mass, entranceEnabled, breeze, meshProps, linksPerChain }: ModeProps) {
  const chainEnd = useChainEnd(scale);
  useBreeze(slots, breeze);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const now = performance.now();
    if (entranceEnabled && !entrance.started) beginEntrance(now, shouldSkipEntrance());
    const dropping = entranceEnabled && entrance.started && !entrance.skipped;
    const pointer = !Number.isNaN(sceneState.pointerNdc[0]);
    slots.forEach((slot, i) => {
      const h = getHandle(slot.id);
      const obj = h?.object;
      if (!h || !obj) return;
      const sway = swayOf(slot.id);
      const L = slot.ropeLength;
      sway.r = dropping ? dropExtension(now - entrance.startedAt - i * DROP_STAGGER_MS, L) : 1;
      const pose = poseOf(slot.id);
      if (pointer && !grab.current && pose.at > 0) {
        const [ix, iz] = hoverPush(pose.p.x - sceneState.pointerWorld[0], pose.p.z - sceneState.pointerWorld[2], HOVER_RADIUS * scale + 0.25, HOVER_STRENGTH * mass * scale, dt);
        if (ix !== 0 || iz !== 0) kickSway(sway, [ix, 0, iz], mass, L);
      }
      stepSway(sway, dt, L);
      swayOffset(sway, L, _off);
      if (_off.lengthSq() < 1e-8) _dir.set(0, -1, 0);
      else _dir.copy(_off).normalize();
      _pos.set(slot.anchor[0], slot.anchor[1], slot.anchor[2]).add(_off).addScaledVector(_dir, ATTACH_Y * scale);
      _q.setFromUnitVectors(DOWN, _dir);
      if (pose.at > 0) {
        const secs = Math.max(1e-3, (now - pose.at) / 1000);
        pose.v.copy(_pos).sub(pose.p).multiplyScalar(1 / secs);
        if (pose.v.lengthSq() > 64) pose.v.setLength(8);
      }
      obj.position.copy(_pos);
      obj.quaternion.copy(_q);
      pose.p.copy(_pos);
      pose.q.copy(_q);
      pose.w.set(0, 0, 0);
      pose.attach.set(slot.anchor[0], slot.anchor[1], slot.anchor[2]).add(_off);
      pose.at = now;
      poseScale.set(slot.id, scale);
    });
    if (entranceEnabled && entrance.started && !entrance.done && dropSettled(now - entrance.startedAt, slots.length)) finishEntrance(now);
  });

  return (
    <group>
      {slots.map((slot) => (
        <KinematicLetter key={slot.id} slot={slot} group={group} scale={scale} mass={mass} meshProps={meshProps} />
      ))}
      <Chains slots={slots} getBodyPosition={chainEnd} linksPerChain={linksPerChain} linkScale={scale} />
    </group>
  );
}

function KinematicLetter({ slot, group, scale, mass, meshProps }: { slot: LetterSlot; group: string; scale: number; mass: number; meshProps: MeshProps }) {
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);

  useEffect(() => {
    const obj = groupRef.current;
    const mesh = meshRef.current;
    if (!obj) return;
    const sway = swayOf(slot.id);
    const L = slot.ropeLength;
    // first frame: hang at rest (or at the rail when the entrance drop is about to run)
    const pose = poseOf(slot.id);
    if (pose.at === 0) {
      obj.position.set(slot.anchor[0], slot.anchor[1] - DROP_START_M - ATTACH_Y * scale, slot.anchor[2]);
      pose.p.copy(obj.position);
    }
    const handle: LetterHandle = {
      id: slot.id,
      group,
      char: slot.char,
      mass,
      scale,
      ropeLength: L,
      anchor: slot.anchor,
      home: [slot.x, slot.y, slot.z],
      mesh,
      object: obj,
      body: null,
      controller: null,
      kick: (impulse) => kickSway(sway, impulse, mass, L),
      drag: (target, dt) => {
        const p = poseOf(slot.id).p;
        kickSway(sway, [(target.x - p.x) * DRAG_GAIN * mass * dt, 0, (target.z - p.z) * DRAG_GAIN * mass * dt], mass, L);
      },
      touch: () => {},
    };
    setHandle(handle);
    const unregister = registerGrabbable({ id: slot.id, group, mesh: mesh ?? obj, home: handle.home, push: (impulse) => handle.kick(impulse, undefined, true) });
    return () => {
      unregister();
      deleteHandle(slot.id);
    };
  }, [slot, group, scale, mass]);

  return (
    <group ref={groupRef} scale={scale}>
      <LetterMesh ref={meshRef} char={slot.char} {...meshProps} />
    </group>
  );
}

/* --------------------------------------------------------------------- live --------------------------------------------------------------------- */

interface InitialPose {
  p: Vec3;
  q: [number, number, number, number];
  v: Vec3;
}

/** layout scale each stored pose was written at: a pose from another layout (phone rotation) is not carried over */
const poseScale = new Map<string, number>();

function initialPoseFor(slot: LetterSlot, scale: number, entranceEnabled: boolean): InitialPose {
  if (hasPose(slot.id) && poseOf(slot.id).at > 0 && poseScale.get(slot.id) === scale) {
    const pose = poseOf(slot.id);
    return { p: [pose.p.x, pose.p.y, pose.p.z], q: [pose.q.x, pose.q.y, pose.q.z, pose.q.w], v: [pose.v.x, pose.v.y, pose.v.z] };
  }
  const drop = entranceEnabled && !entrance.done && (entrance.started ? !entrance.skipped : !shouldSkipEntrance());
  if (drop) return { p: [slot.anchor[0], slot.anchor[1] - DROP_START_M - ATTACH_Y * scale, slot.anchor[2]], q: [0, 0, 0, 1], v: [0, 0, 0] };
  return { p: [slot.x, slot.y, slot.z], q: [0, 0, 0, 1], v: [0, 0, 0] };
}

function LiveHang({ slots, group, scale, mass, entranceEnabled, breeze, meshProps, linksPerChain, mod }: ModeProps & { mod: RapierModule }) {
  const { useRapier, useBeforePhysicsStep, useAfterPhysicsStep } = mod;
  const { world } = useRapier();
  const chainEnd = useChainEnd(scale);
  const stepStart = useRef(0);
  useBreeze(slots, breeze);

  const initial = useMemo(() => slots.map((s) => initialPoseFor(s, scale, entranceEnabled)), [slots, scale, entranceEnabled]);

  useEffect(() => {
    if (entranceEnabled && !entrance.started) beginEntrance(performance.now(), shouldSkipEntrance());
  }, [entranceEnabled]);

  useBeforePhysicsStep(() => {
    const now = performance.now();
    stepStart.current = now;
    const snapOK = !entranceEnabled || (entrance.done && now > entrance.doneAt + ENTRANCE_GRACE_MS);
    let allSlow = true;
    let snapped = 0;
    let hoisting = 0;
    for (const slot of slots) {
      const h = getHandle(slot.id);
      const c = h?.controller;
      if (!h?.body || !c) continue;
      c.snapEnabled = snapOK;
      c.step(now, 1 / 60);
      if (!c.attached) snapped++;
      if (c.hoisting) hoisting++;
      if (entranceEnabled && !entrance.done) {
        const v = h.body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z > 0.16) allSlow = false;
      }
    }
    if (group === "name") {
      physicsStats.snapped = snapped;
      physicsStats.hoisting = hoisting;
    }
    if (entranceEnabled && entrance.started && !entrance.done) {
      const elapsed = now - entrance.startedAt;
      if ((elapsed > 1200 && allSlow) || elapsed > 2800) finishEntrance(now);
    }
  });

  useAfterPhysicsStep((w) => {
    const ms = performance.now() - stepStart.current;
    physicsStats.stepMs += (ms - physicsStats.stepMs) * 0.1;
    physicsStats.bodies = w.bodies.len();
  });

  const onContactForce = useCallback(
    (payload: ContactForcePayload) => {
      const id = (payload.target.rigidBodyObject?.userData as { letterId?: string } | undefined)?.letterId;
      if (!id) return;
      const h = getHandle(id);
      if (!h?.controller) return;
      const now = performance.now();
      const kind = h.controller.contact(payload.totalForceMagnitude, now);
      if (kind === "none") return;
      const otherId = (payload.other.rigidBodyObject?.userData as { letterId?: string } | undefined)?.letterId;
      if (otherId) getHandle(otherId)?.controller?.touch(now);
      _cp.copy(poseOf(id).p);
      world.contactPair(payload.target.collider, payload.other.collider, (manifold) => {
        if (manifold.numSolverContacts() > 0) {
          const p = manifold.solverContactPoint(0);
          if (p) _cp.set(p.x, p.y, p.z);
        }
      });
      reportContact({ id, mesh: h.mesh, point: _cp.clone(), force: payload.totalForceMagnitude, kind });
    },
    [world],
  );

  return (
    <group>
      {slots.map((slot, i) => (
        <LiveLetter key={`${slot.id}@${scale.toFixed(3)}`} slot={slot} initial={initial[i]} group={group} scale={scale} mass={mass} meshProps={meshProps} mod={mod} onContactForce={onContactForce} />
      ))}
      <Chains slots={slots} getBodyPosition={chainEnd} linksPerChain={linksPerChain} linkScale={scale} />
    </group>
  );
}

interface LiveLetterProps {
  slot: LetterSlot;
  initial: InitialPose;
  group: string;
  scale: number;
  mass: number;
  meshProps: MeshProps;
  mod: RapierModule;
  onContactForce: (payload: ContactForcePayload) => void;
}

function LiveLetter({ slot, initial, group, scale, mass, meshProps, mod, onContactForce }: LiveLetterProps) {
  const { RigidBody, ConvexHullCollider, useRapier } = mod;
  const { world, rapier } = useRapier();
  const bodyRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const meshRef = useRef<Mesh>(null);
  // the layout scale is baked into the hull (a RigidBody `scale` is read only when the collider is created)
  const hull = useMemo(() => scaleHull(getGlyph(slot.char, meshProps.curveSegments).hull, scale), [slot.char, meshProps.curveSegments, scale]);
  const userData = useMemo(() => ({ letterId: slot.id }), [slot.id]);

  useEffect(() => {
    const body = bodyRef.current;
    const mesh = meshRef.current;
    const collider = colliderRef.current;
    if (!body || !mesh) return;
    const now = performance.now();
    // the collider's mass reaches the body only at the next world step; the rope controller must see 12 kg from step one
    body.recomputeMassPropertiesFromColliders();
    collider?.setContactForceEventThreshold(CONTACT_HEAT_FACTOR * mass * G);
    const anchorBody = retainStaticBody(world, rapier);
    const controller = new HangController(
      {
        id: slot.id,
        body,
        anchorBody,
        anchorWorld: slot.anchor,
        attachLocal: [0, ATTACH_Y * scale, 0],
        ropeLength: slot.ropeLength,
        mass,
        home: [slot.x, slot.y, slot.z],
        world,
        rapier,
        onSnap: (id) => emitScene("snap", { id }),
        onHoist: (id, phase) => {
          if (phase === "start") emitScene("hoist", { id });
        },
      },
      now,
    );
    controller.attach();
    const handle: LetterHandle = {
      id: slot.id,
      group,
      char: slot.char,
      mass,
      scale,
      ropeLength: slot.ropeLength,
      anchor: slot.anchor,
      home: [slot.x, slot.y, slot.z],
      mesh,
      object: mesh?.parent ?? null,
      body,
      controller,
      kick: (impulse, point, touch) => {
        if (controller.hoisting || !world.getRigidBody(body.handle)) return;
        const imp = { x: impulse[0] * scale, y: impulse[1] * scale, z: impulse[2] * scale };
        if (point) body.applyImpulseAtPoint(imp, { x: point[0], y: point[1], z: point[2] }, true);
        else body.applyImpulse(imp, true);
        if (touch) controller.touch(performance.now());
      },
      touch: () => controller.touch(performance.now()),
    };
    setHandle(handle);
    const unregister = registerGrabbable({ id: slot.id, group, mesh, home: handle.home, push: (impulse, point) => handle.kick(impulse, point, true) });
    return () => {
      unregister();
      controller.dispose();
      deleteHandle(slot.id);
      releaseStaticBody(world);
    };
  }, [slot, group, scale, mass, world, rapier]);

  // interpolated world pose for the chains, the grab and the hand-off store
  useFrame(() => {
    const mesh = meshRef.current;
    const body = bodyRef.current;
    if (!mesh || !body) return;
    const pose = poseOf(slot.id);
    mesh.getWorldPosition(pose.p);
    mesh.getWorldQuaternion(pose.q);
    const lv = body.linvel();
    const av = body.angvel();
    pose.v.set(lv.x, lv.y, lv.z);
    pose.w.set(av.x, av.y, av.z);
    pose.attach.set(0, ATTACH_Y * scale, 0).applyQuaternion(pose.q).add(pose.p);
    pose.at = performance.now();
    poseScale.set(slot.id, scale);
  });

  return (
    <RigidBody
      ref={bodyRef}
      type="dynamic"
      colliders={false}
      position={initial.p as [number, number, number]}
      quaternion={initial.q}
      linearVelocity={initial.v as [number, number, number]}
      canSleep
      linearDamping={0.25}
      angularDamping={0.4}
      userData={userData}
      onContactForce={onContactForce}
    >
      <ConvexHullCollider ref={colliderRef} args={[hull]} mass={mass} restitution={0.15} friction={0.6} />
      <LetterMesh ref={meshRef} char={slot.char} {...meshProps} scale={scale} />
    </RigidBody>
  );
}
