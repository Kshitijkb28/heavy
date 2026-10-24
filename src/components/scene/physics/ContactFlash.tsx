"use client";

/**
 * Heat (DESIGN.md §1 signature effect 3): a contact above threshold flashes a 120 ms additive sprite at the
 * contact point and pulses the letter's signal-red emissive, decaying over 400 ms. A pool of `max` sprites
 * (one draw call each, no bloom needed on mid). Fed by `reportContact()` from the hang system; emits
 * `heavy:contact` (throttled per letter). Mounted by `Rig`.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DataTexture, Group, RGBAFormat, type Mesh, type Sprite, type SpriteMaterial } from "three";
import { emitScene } from "@/lib/registry";
import { setHeat } from "./letters-bridge";
import { onContactHit } from "./rigState";

export const FLASH_MS = 120;
export const HEAT_MS = 400;

/** Soft radial disc, built from numbers (no DOM) so it is SSR-safe and pure. */
function makeRadialTexture(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const a = Math.max(0, 1 - d);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 200;
      data[i + 2] = 210;
      data[i + 3] = Math.round(255 * a * a);
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

interface Slot {
  life: number;
  strength: number;
}

export function ContactFlash({ max = 8 }: { max?: number }) {
  const groupRef = useRef<Group>(null);
  const texture = useMemo(() => makeRadialTexture(64), []);
  const pool = useMemo<Slot[]>(() => Array.from({ length: max }, () => ({ life: 0, strength: 1 })), [max]);
  const heats = useRef(new Map<string, { mesh: Mesh; heat: number }>());
  const last = useRef({ at: 0, x: 0, y: 0, z: 0, emit: new Map<string, number>() });

  useEffect(() => () => texture.dispose(), [texture]);

  useEffect(() => {
    const heatMap = heats.current;
    const off = onContactHit((hit) => {
      const now = performance.now();
      const L = last.current;
      const duplicate = now - L.at < 60 && Math.hypot(hit.point.x - L.x, hit.point.y - L.y, hit.point.z - L.z) < 0.15;
      if (!duplicate) {
        L.at = now;
        L.x = hit.point.x;
        L.y = hit.point.y;
        L.z = hit.point.z;
        const g = groupRef.current;
        if (g) {
          let best = 0;
          for (let i = 1; i < pool.length; i++) if (pool[i].life < pool[best].life) best = i;
          const s = g.children[best] as Sprite | undefined;
          if (s) {
            s.position.copy(hit.point);
            s.visible = true;
            pool[best].life = 1;
            pool[best].strength = Math.min(2.2, 0.7 + hit.force / 1200);
          }
        }
      }
      if (hit.mesh) heatMap.set(hit.id, { mesh: hit.mesh as Mesh, heat: 1 });
      if (now - (L.emit.get(hit.id) ?? 0) > 100) {
        L.emit.set(hit.id, now);
        emitScene("contact", { id: hit.id, force: hit.force, kind: hit.kind });
      }
    });
    return () => {
      off();
      heatMap.forEach((h) => setHeat(h.mesh, 0));
      heatMap.clear();
    };
  }, [pool]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const dt = Math.min(delta, 0.1);
    pool.forEach((p, i) => {
      if (p.life <= 0) return;
      p.life -= dt / (FLASH_MS / 1000);
      const s = g.children[i] as Sprite | undefined;
      if (!s) return;
      if (p.life <= 0) {
        p.life = 0;
        s.visible = false;
        return;
      }
      const k = 1 - p.life;
      const size = 0.32 * p.strength * (0.6 + 0.9 * k);
      s.scale.set(size, size, 1);
      (s.material as SpriteMaterial).opacity = p.life;
    });
    heats.current.forEach((h, id) => {
      h.heat -= dt / (HEAT_MS / 1000);
      if (h.heat <= 0) {
        setHeat(h.mesh, 0);
        heats.current.delete(id);
      } else {
        setHeat(h.mesh, h.heat);
      }
    });
  });

  return (
    <group ref={groupRef}>
      {pool.map((_, i) => (
        <sprite key={i} visible={false} renderOrder={10}>
          <spriteMaterial map={texture} color="#ff8fa3" transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </sprite>
      ))}
    </group>
  );
}
