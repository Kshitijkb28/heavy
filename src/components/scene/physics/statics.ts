/**
 * One fixed Rapier body per world shared by everything static (rope anchors, the floor, the walls), so the
 * body budget stays at 15 letters + one initial per project (≤ 6) + 1 static ≤ 22 (`TierConfig.maxBodies`). Ref-counted: the
 * last releaser removes it (Rapier removes its colliders and joints with it).
 */
import type { Collider, ColliderDesc, RigidBody as RapierRigidBody, World } from "@dimforge/rapier3d-compat";
import type { RapierContext } from "@react-three/rapier";

type RapierApi = RapierContext["rapier"];

interface Entry {
  body: RapierRigidBody;
  refs: number;
}

const entries = new WeakMap<World, Entry>();

/** Get (creating on first use) the shared fixed body of `world`; pair every call with `releaseStaticBody`. */
export function retainStaticBody(world: World, rapier: RapierApi): RapierRigidBody {
  let entry = entries.get(world);
  if (!entry || !world.getRigidBody(entry.body.handle)) {
    entry = { body: world.createRigidBody(rapier.RigidBodyDesc.fixed()), refs: 0 };
    entries.set(world, entry);
  }
  entry.refs++;
  return entry.body;
}

export function releaseStaticBody(world: World): void {
  const entry = entries.get(world);
  if (!entry) return;
  entry.refs--;
  if (entry.refs > 0) return;
  entries.delete(world);
  if (world.getRigidBody(entry.body.handle)) world.removeRigidBody(entry.body);
}

/** Attach colliders to the shared body; returns them for `removeStaticColliders`. */
export function addStaticColliders(world: World, body: RapierRigidBody, descs: ColliderDesc[]): Collider[] {
  return descs.map((d) => world.createCollider(d, body));
}

export function removeStaticColliders(world: World, colliders: Collider[]): void {
  for (const c of colliders) if (world.getCollider(c.handle)) world.removeCollider(c, false);
}

/** How many references the shared body currently has (lab diagnostics). */
export function staticBodyRefs(world: World): number {
  return entries.get(world)?.refs ?? 0;
}
