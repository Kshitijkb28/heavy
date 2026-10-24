/** Static geometry helpers: place primitives in world space and merge them into one draw call. */
import { BoxGeometry, BufferAttribute, type BufferGeometry, CylinderGeometry, Euler, Matrix4, PlaneGeometry, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "@/lib/contracts";

export const v3 = (v: Vec3): [number, number, number] => [v[0], v[1], v[2]];

/** Bake a position / rotation (Euler XYZ) / scale into the geometry itself. */
export function placed(g: BufferGeometry, position: Vec3, rotation: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]): BufferGeometry {
  const m = new Matrix4().compose(new Vector3(...position), new Quaternion().setFromEuler(new Euler(...rotation)), new Vector3(...scale));
  g.applyMatrix4(m);
  return g;
}

export const box = (w: number, h: number, d: number, position: Vec3, rotation?: Vec3): BufferGeometry => placed(new BoxGeometry(w, h, d), position, rotation);

export const cylinder = (rTop: number, rBottom: number, h: number, segments: number, position: Vec3, rotation?: Vec3, openEnded = false): BufferGeometry =>
  placed(new CylinderGeometry(rTop, rBottom, h, segments, 1, openEnded), position, rotation);

export const plane = (w: number, h: number, position: Vec3, rotation?: Vec3): BufferGeometry => placed(new PlaneGeometry(w, h), position, rotation);

/** Merge into one non-indexed geometry with position/normal/uv only; the inputs are disposed. */
export function mergeAll(parts: BufferGeometry[]): BufferGeometry {
  const prepared = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute("uv", new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.clearGroups();
    return g;
  });
  const merged = mergeGeometries(prepared, false);
  if (!merged) throw new Error("mergeAll: incompatible geometries");
  for (const g of prepared) g.dispose();
  for (const p of parts) p.dispose();
  merged.computeBoundingSphere();
  return merged;
}
