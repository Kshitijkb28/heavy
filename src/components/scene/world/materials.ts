/**
 * Materials for the hall. The wet floor defaults to a tuned MeshStandardMaterial with a procedural roughness map
 * (puddles + grain); I1 passes U2's `createFloorMaterial()` (CSM: wetness, beacon rake) to `<World floorMaterial>` once
 * it lands. Everything is dark on purpose: two colours of light do the work (docs/DESIGN.md §1).
 */
import {
  Color,
  DataTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type ColorRepresentation,
} from "three";
import { noiseField } from "./drives";

/** Night Rig tokens (globals.css); the scene cannot read CSS custom properties, so they are mirrored here. */
export const TOKENS = {
  void: "#050507",
  floor: "#0b0c10",
  iron: "#2a2d34",
  steel: "#596270",
  mercury: "#d7e6ff",
  signal: "#ff3355",
  signalDeep: "#7a0f23",
  coldTube: "#cfe3ff",
} as const;

/** Tiling grey noise texture; `lo`/`hi` remap the 0–1 noise so a roughnessMap can carry an affine range. */
export function createNoiseTexture(size = 256, seed = 7, repeat: readonly [number, number] = [1, 1], lo = 0, hi = 1): DataTexture {
  const field = noiseField(size, seed, 3);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((lo + (hi - lo) * (field[i] / 255)) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Wet polished concrete stand-in: dark, glossy in the puddles (roughness .28) and matte in the grain (.62). */
export function createConcreteMaterial(): MeshStandardMaterial {
  const roughnessMap = createNoiseTexture(256, 11, [6, 20], 0.45, 1);
  return new MeshStandardMaterial({
    color: new Color(TOKENS.floor),
    roughness: 0.62,
    roughnessMap,
    metalness: 0.12,
    envMapIntensity: 0.5,
  });
}

/** Black soundstage walls and ceiling: matte, faintly mottled so the beacon has something to reveal. Double-sided so the far wall reads from behind the door. */
export function createWallMaterial(): MeshStandardMaterial {
  const map = createNoiseTexture(128, 23, [10, 3], 0.55, 1);
  return new MeshStandardMaterial({
    color: new Color("#101218"),
    map,
    roughness: 0.94,
    metalness: 0,
    envMapIntensity: 0.25,
    side: DoubleSide,
  });
}

/** Black steel for the rail, mast, bays, fixtures and the door. */
export function createSteelMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color("#353a44"), metalness: 0.88, roughness: 0.42, envMapIntensity: 1.1 });
}

/** Cast iron for the bay plates — the same preset U2's `IronMaterial` uses for the letters. */
export function createIronPlateMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: new Color(TOKENS.iron), metalness: 0.9, roughness: 0.45, envMapIntensity: 1 });
}

/** Unlit emitter (tubes, lens, door light): colour × intensity, not tone mapped so Bloom's .8 threshold catches it. */
export function createEmissiveMaterial(color: ColorRepresentation, intensity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color(color).multiplyScalar(intensity), toneMapped: false });
}
