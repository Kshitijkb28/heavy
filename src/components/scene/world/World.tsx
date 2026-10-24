"use client";

/**
 * The hall (docs/DESIGN.md §3): wet floor, black walls and ceiling (one merged mesh with openings for the bays and
 * the door), the hero rail at y 5.2, the beacon mast, the two Experience bays, the five Stack tubes and the far door.
 * Everything static is merged by material; the world reads `sceneState.t` in useFrame only. Pass U2's
 * `createFloorMaterial()` as `floorMaterial` to replace the default wet-concrete stand-in.
 */
import { useEffect, useMemo } from "react";
import { type Material, PlaneGeometry } from "three";
import type { TierConfig } from "@/lib/contracts";
import { box, mergeAll, plane } from "./build";
import { splitWall } from "./drives";
import { BAY, BAYS, DOOR, HALL, INITIALS, RAIL } from "./layout";
import { createConcreteMaterial, createSteelMaterial, createWallMaterial } from "./materials";
import { Bays } from "./Bays";
import { Door } from "./Door";
import { Mast } from "./Mast";
import { Tubes } from "./Tubes";

export interface WorldProps {
  cfg: TierConfig;
  /** U2's wet-concrete CSM (`createFloorMaterial()`); defaults to a MeshStandardMaterial stand-in */
  floorMaterial?: Material;
  /** mount the far set pieces (bays, tubes, door); the stage adds them a beat after the hero is on screen */
  details?: boolean;
}

const FLOOR_W = HALL.xMax - HALL.xMin;
const FLOOR_L = HALL.zNear - HALL.zFar;
const Z_MID = (HALL.zNear + HALL.zFar) / 2;

export function World({ cfg, floorMaterial, details = true }: WorldProps) {
  const glow = !cfg.post;

  const floor = useMemo(() => new PlaneGeometry(FLOOR_W, FLOOR_L), []);
  const ownFloorMaterial = useMemo(() => (floorMaterial ? null : createConcreteMaterial()), [floorMaterial]);
  const wallMaterial = useMemo(() => createWallMaterial(), []);
  const steel = useMemo(() => createSteelMaterial(), []);

  const walls = useMemo(() => {
    const parts = [
      plane(FLOOR_L, HALL.height, [HALL.xMin, HALL.height / 2, Z_MID], [0, Math.PI / 2, 0]),
      plane(FLOOR_W, FLOOR_L, [0, HALL.height, Z_MID], [Math.PI / 2, 0, 0]),
    ];
    const bayHoles = BAYS.map((b) => ({ u0: b.z - BAY.width / 2, u1: b.z + BAY.width / 2, v0: BAY.sill, v1: BAY.sill + BAY.height }));
    for (const r of splitWall(HALL.zFar, HALL.zNear, 0, HALL.height, bayHoles)) {
      parts.push(plane(r.u1 - r.u0, r.v1 - r.v0, [HALL.xMax, (r.v0 + r.v1) / 2, (r.u0 + r.u1) / 2], [0, -Math.PI / 2, 0]));
    }
    const doorHole = { u0: DOOR.x - DOOR.width / 2 - 0.14, u1: DOOR.x + DOOR.width / 2 + 0.14, v0: 0, v1: DOOR.height + 0.14 };
    for (const r of splitWall(HALL.xMin, HALL.xMax, 0, HALL.height, [doorHole])) {
      parts.push(plane(r.u1 - r.u0, r.v1 - r.v0, [(r.u0 + r.u1) / 2, (r.v0 + r.v1) / 2, DOOR.z]));
    }
    return mergeAll(parts);
  }, []);

  const rail = useMemo(
    () =>
      mergeAll([
        box(RAIL.halfWidth * 2, RAIL.section, RAIL.depth, [0, RAIL.y, RAIL.z]),
        box(RAIL.halfWidth * 2 + 0.1, 0.03, RAIL.depth + 0.12, [0, RAIL.y + RAIL.section / 2, RAIL.z]),
        box(RAIL.halfWidth * 2 + 0.1, 0.03, RAIL.depth + 0.12, [0, RAIL.y - RAIL.section / 2, RAIL.z]),
        box(0.06, HALL.height - RAIL.y, 0.06, [-RAIL.hangerX, (HALL.height + RAIL.y) / 2, RAIL.z]),
        box(0.06, HALL.height - RAIL.y, 0.06, [RAIL.hangerX, (HALL.height + RAIL.y) / 2, RAIL.z]),
        // short beams the project initials hang from (U3 Initials at x 2.6, z −24 / −30 / −36), each on one hanger
        ...INITIALS.zs.flatMap((z) => [
          box(1.8, RAIL.section, 0.5, [INITIALS.x, RAIL.y, z]),
          box(0.06, HALL.height - RAIL.y, 0.06, [INITIALS.x, (HALL.height + RAIL.y) / 2, z]),
        ]),
      ]),
    [],
  );

  useEffect(() => () => floor.dispose(), [floor]);
  useEffect(() => () => walls.dispose(), [walls]);
  useEffect(() => () => rail.dispose(), [rail]);
  useEffect(() => () => wallMaterial.dispose(), [wallMaterial]);
  useEffect(() => () => steel.dispose(), [steel]);
  useEffect(() => () => ownFloorMaterial?.dispose(), [ownFloorMaterial]);

  return (
    <group>
      <mesh geometry={floor} material={floorMaterial ?? ownFloorMaterial ?? undefined} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, Z_MID]} receiveShadow />
      <mesh geometry={walls} material={wallMaterial} />
      <mesh geometry={rail} material={steel} />
      <Mast />
      {details && (
        <>
          <Bays cfg={cfg} glow={glow} />
          <Tubes cfg={cfg} glow={glow} />
          <Door cfg={cfg} glow={glow} />
        </>
      )}
    </group>
  );
}
