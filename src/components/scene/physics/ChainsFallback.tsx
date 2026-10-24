"use client";

/**
 * Fallback for U2's `Chains` (same API): one InstancedMesh of torus links laid from each slot's anchor to the
 * letter's attachment point every frame (150 instances for the name = one draw call). Links are elongated along
 * the chain so they touch; alternate links turn 90°. A broken chain (short stub from the rail) bunches up.
 */
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { Vec3 } from "@/lib/contracts";

export interface ChainsProps {
  slots: readonly { id: string; anchor: Vec3 }[];
  /** world position of the chain's lower end (the letter's attachment point); null hides the chain */
  getBodyPosition: (id: string) => Vector3 | null;
  linksPerChain?: number;
  /** scales the link size (hero letters in portrait are smaller) */
  linkScale?: number;
}

const UP = new Vector3(0, 1, 0);
const HALF_TURN = new Quaternion().setFromAxisAngle(UP, Math.PI / 2);
const LINK_RADIUS = 0.05;
const LINK_TUBE = 0.016;
const _a = new Vector3();
const _b = new Vector3();
const _dir = new Vector3();
const _pos = new Vector3();
const _q = new Quaternion();
const _alt = new Quaternion();
const _s = new Vector3();
const _m = new Matrix4();

export function Chains({ slots, getBodyPosition, linksPerChain = 10, linkScale = 1 }: ChainsProps) {
  const ref = useRef<InstancedMesh>(null);
  const count = slots.length * linksPerChain;

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    let i = 0;
    const nominal = 2 * (LINK_RADIUS + LINK_TUBE) * linkScale;
    for (const slot of slots) {
      _a.set(slot.anchor[0], slot.anchor[1], slot.anchor[2]);
      const end = getBodyPosition(slot.id);
      _b.copy(end ?? _a);
      _dir.copy(_b).sub(_a);
      const len = _dir.length();
      if (len < 1e-4) _dir.set(0, -1, 0);
      else _dir.multiplyScalar(1 / len);
      _q.setFromUnitVectors(UP, _dir);
      const segment = len / linksPerChain;
      const stretch = Math.min(2.2, Math.max(0.9, segment / nominal));
      for (let k = 0; k < linksPerChain; k++) {
        _pos.copy(_a).addScaledVector(_dir, (k + 0.5) * segment);
        _alt.copy(_q);
        if (k % 2) _alt.multiply(HALF_TURN);
        _s.set(linkScale, linkScale * stretch, linkScale);
        _m.compose(_pos, _alt, _s);
        mesh.setMatrixAt(i++, _m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh key={count} ref={ref} args={[undefined, undefined, count]} frustumCulled={false} castShadow receiveShadow>
      <torusGeometry args={[LINK_RADIUS, LINK_TUBE, 6, 12]} />
      <meshStandardMaterial color="#1a1d23" metalness={1} roughness={0.35} />
    </instancedMesh>
  );
}
