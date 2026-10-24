"use client";

/** The beacon mast: a black steel pole at (−6, 0, −3) with a caged head at y 4.5 where `<Beacon>` turns. One draw call. */
import { useEffect, useMemo } from "react";
import { box, cylinder, mergeAll } from "./build";
import { MAST } from "./layout";
import { createSteelMaterial } from "./materials";

export function Mast() {
  const [bx, , bz] = MAST.base;
  const [, hy] = MAST.head;
  const geometry = useMemo(() => {
    const r = MAST.capRadius;
    const parts = [
      cylinder(0.045, 0.06, hy - 0.17, 12, [bx, (hy - 0.17) / 2, bz]),
      cylinder(0.34, 0.38, 0.06, 24, [bx, 0.03, bz]),
      cylinder(r + 0.02, r + 0.02, 0.03, 24, [bx, hy - 0.17, bz]),
      cylinder(r + 0.02, r + 0.02, 0.03, 24, [bx, hy + 0.19, bz]),
      cylinder(0.05, 0.05, 0.05, 12, [bx, hy + 0.23, bz]),
    ];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      parts.push(box(0.018, 0.36, 0.018, [bx + Math.cos(a) * r, hy + 0.01, bz + Math.sin(a) * r]));
    }
    return mergeAll(parts);
  }, [bx, bz, hy]);
  const material = useMemo(() => createSteelMaterial(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <mesh geometry={geometry} material={material} />;
}
