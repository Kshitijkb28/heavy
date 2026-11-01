"use client";

/**
 * Experience: two recessed steel bays in the right wall (z −10 / −16), each with a cold tube along its lintel and an
 * iron plate naming one of the two latest companies as merged glyphs (U2 `getGlyph`, laid out from `GlyphData.advance`,
 * shrunk to fit the bay when the name is long). The bay nearest the viewport centre lights (`bayLevels(t)`): one moving
 * point light, per-instance tube emission, glow on mid.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { type BufferGeometry, Color, CylinderGeometry, type InstancedMesh, Matrix4, MeshBasicMaterial, type PointLight } from "three";
import type { TierConfig } from "@/lib/contracts";
import { sceneState } from "@/lib/scene-state";
import { getGlyph, loadTypeface } from "@/components/scene/letters/glyphs";
import { box, mergeAll, placed } from "./build";
import { bayLevels, layoutPlate } from "./drives";
import { BAY, BAYS, HALL, plateScaleFor } from "./layout";
import { createIronPlateMaterial, createSteelMaterial, TOKENS } from "./materials";
import { GlowSprite } from "./GlowSprite";

export interface BaysProps {
  cfg: TierConfig;
  glow: boolean;
}

const X = HALL.xMax;
const TUBE_LEN = BAY.width - 0.5;
const TUBE_Y = BAY.sill + BAY.height - 0.18;
const TUBE_X = X + 0.16;

const finite = (v: number) => (Number.isFinite(v) ? v : 0);
/** a bay lights only when it carries a plate (with one company so far the second stays dark) */
const LIT: [boolean, boolean] = [!!BAYS[0].word, !!BAYS[1].word];

/** One merged geometry for both plates: each word centred on its bay's back panel, reading toward +z, facing the hall. */
function buildPlates(curveSegments: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  for (const bay of BAYS) {
    const chars = bay.word.split("");
    if (!chars.length) continue;
    const glyphs = chars.map((c) => getGlyph(c, curveSegments));
    const { xs, width } = layoutPlate(glyphs.map((g) => ({ w: finite(g.size.w), advance: finite(g.advance) })));
    const s = plateScaleFor(width);
    const depth = glyphs.reduce((m, g) => Math.max(m, g.size.d), 0);
    const cx = X + BAY.depth - (depth * s) / 2 - 0.02;
    chars.forEach((ch, i) => {
      if (ch === " ") return;
      const g = glyphs[i].geometry.clone();
      placed(g, [xs[i], 0, 0]);
      placed(g, [cx, BAY.sill + BAY.plateY, bay.z], [0, -Math.PI / 2, 0], [s, s, s]);
      parts.push(g);
    });
  }
  return mergeAll(parts);
}

export function Bays({ cfg, glow }: BaysProps) {
  const inst = useRef<InstancedMesh>(null);
  const light = useRef<PointLight>(null);
  const levels = useRef<[number, number]>([0, 0]);
  const shown = useRef<[number, number]>([-1, -1]);
  const [typefaceReady, setTypefaceReady] = useState(false);

  useEffect(() => {
    let alive = true;
    loadTypeface().then(() => {
      if (alive) setTypefaceReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const shell = useMemo(
    () =>
      mergeAll(
        BAYS.flatMap((b) => {
          const yMid = BAY.sill + BAY.height / 2;
          const xMid = X + BAY.depth / 2;
          return [
            box(0.06, BAY.height, BAY.width, [X + BAY.depth, yMid, b.z]),
            box(BAY.depth, BAY.height, 0.06, [xMid, yMid, b.z - BAY.width / 2]),
            box(BAY.depth, BAY.height, 0.06, [xMid, yMid, b.z + BAY.width / 2]),
            box(BAY.depth, 0.06, BAY.width, [xMid, BAY.sill + BAY.height, b.z]),
            box(BAY.depth, 0.06, BAY.width, [xMid, BAY.sill, b.z]),
            box(0.1, 0.1, BAY.width + 0.2, [X - 0.02, BAY.sill + BAY.height + 0.05, b.z]),
            box(0.1, 0.1, BAY.width + 0.2, [X - 0.02, BAY.sill - 0.05, b.z]),
            box(0.1, BAY.height + 0.2, 0.1, [X - 0.02, yMid, b.z - BAY.width / 2 - 0.05]),
            box(0.1, BAY.height + 0.2, 0.1, [X - 0.02, yMid, b.z + BAY.width / 2 + 0.05]),
          ];
        }),
      ),
    [],
  );
  const steel = useMemo(() => createSteelMaterial(), []);
  const iron = useMemo(() => createIronPlateMaterial(), []);
  const plates = useMemo(() => (typefaceReady ? buildPlates(cfg.curveSegments) : null), [typefaceReady, cfg.curveSegments]);
  const tube = useMemo(() => new CylinderGeometry(0.03, 0.03, TUBE_LEN, 10, 1).rotateX(Math.PI / 2), []);
  const emissive = useMemo(() => new MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), []);
  const cold = useMemo(() => new Color(TOKENS.coldTube), []);
  const tmp = useMemo(() => ({ m: new Matrix4(), c: new Color() }), []);

  useEffect(() => () => shell.dispose(), [shell]);
  useEffect(() => () => steel.dispose(), [steel]);
  useEffect(() => () => iron.dispose(), [iron]);
  useEffect(() => () => plates?.dispose(), [plates]);
  useEffect(() => () => tube.dispose(), [tube]);
  useEffect(() => () => emissive.dispose(), [emissive]);

  useEffect(() => {
    const mesh = inst.current;
    if (!mesh) return;
    BAYS.forEach((b, i) => {
      tmp.m.makeTranslation(TUBE_X, TUBE_Y, b.z);
      mesh.setMatrixAt(i, tmp.m);
      mesh.setColorAt(i, tmp.c.setScalar(0.04));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    shown.current = [-1, -1];
  }, [tmp]);

  useFrame((state) => {
    const mesh = inst.current;
    if (!mesh) return;
    const [l0, l1] = bayLevels(sceneState.t, LIT);
    levels.current[0] = l0;
    levels.current[1] = l1;
    const e = state.clock.elapsedTime;
    let dirty = false;
    for (let i = 0; i < 2; i++) {
      const level = levels.current[i];
      const hum = 1 - 0.03 * (0.5 + 0.5 * Math.sin(e * 37 + i * 2.3));
      const v = 0.04 + 2.1 * level * hum;
      if (Math.abs(v - shown.current[i]) > 0.004) {
        mesh.setColorAt(i, tmp.c.copy(cold).multiplyScalar(v));
        shown.current[i] = v;
        dirty = true;
      }
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    const pl = light.current;
    if (pl) {
      const sum = l0 + l1;
      pl.intensity = 64 * sum;
      pl.position.z = sum > 1e-4 ? (l0 * BAYS[0].z + l1 * BAYS[1].z) / sum : BAYS[0].z;
    }
  });

  const drivers = useMemo(() => [() => levels.current[0], () => levels.current[1]], []);

  return (
    <group>
      <mesh geometry={shell} material={steel} />
      {plates && <mesh geometry={plates} material={iron} />}
      <instancedMesh ref={inst} args={[tube, emissive, 2]} frustumCulled={false} />
      <pointLight ref={light} position={[X - 0.35, TUBE_Y - 0.5, BAYS[0].z]} color={TOKENS.coldTube} intensity={0} distance={16} decay={2} />
      {glow && BAYS.map((b, i) => <GlowSprite key={b.id} position={[X + 0.3, TUBE_Y - 0.1, b.z]} size={2.8} color={TOKENS.coldTube} intensity={0.7} driver={drivers[i]} />)}
    </group>
  );
}
