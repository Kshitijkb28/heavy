/**
 * U2 — materials of the rig (docs/DESIGN.md §1 "Materials"): cast iron, black steel chain, wet polished concrete and the
 * floor reflection. Iron and the reflection are CustomShaderMaterial over MeshPhysicalMaterial (procedural cast grain,
 * worn bevel edges, signal-red heat on the bevels); the floor is CSM over MeshStandardMaterial (puddle noise roughness,
 * wetness darkening, beacon rake). All colours mirror the `globals.css` tokens; `cssToken()` reads the live value.
 */
import { BackSide, Color, Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, ShaderChunk, Vector3 } from "three";
import CustomShaderMaterial from "three-custom-shader-material/vanilla";
import { sceneState } from "@/lib/scene-state";

/** Hex mirrors of the frozen `:root` tokens (the canvas cannot read CSS at module time). */
export const TOKENS = {
  void: "#050507",
  floor: "#0b0c10",
  iron: "#2a2d34",
  steel: "#596270",
  mercury: "#d7e6ff",
  signal: "#ff3355",
  signalDeep: "#7a0f23",
} as const;
export type TokenName = keyof typeof TOKENS;

const TOKEN_VARS: Record<TokenName, string> = {
  void: "--void",
  floor: "--floor",
  iron: "--iron",
  steel: "--steel",
  mercury: "--mercury",
  signal: "--signal",
  signalDeep: "--signal-deep",
};

/** The live `--token` value from `:root` in a browser, else the hex mirror. Call from effects, never during render. */
export function cssToken(name: TokenName): string {
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(TOKEN_VARS[name]).trim();
    if (v) return v;
  }
  return TOKENS[name];
}

export const IRON = { metalness: 0.9, roughness: 0.45, anisotropy: 0.6 } as const;
export const CHAIN = { color: "#15171c", metalness: 1, roughness: 0.35 } as const;
/** emissive multiplier at heat 1 (above the bloom threshold on high so the bevels bloom) */
export const HEAT_INTENSITY = 2.6;
/** default beacon mast position (DESIGN.md §4) */
export const BEACON_POSITION: readonly [number, number, number] = [-6, 4.5, -3];

export interface HeatUniforms {
  uHeat: { value: number };
  uHeatColor: { value: Color };
}
export type IronMaterial = MeshPhysicalMaterial & { uniforms: HeatUniforms };
export type ReflectionMaterial = MeshPhysicalMaterial & {
  uniforms: HeatUniforms & { uFade: { value: number }; uStrength: { value: number }; uNormalSign: { value: number } };
};
export type FloorMaterial = MeshStandardMaterial & {
  uniforms: {
    uTime: { value: number };
    /** beacon yaw in radians; the beam points along (cos a, 0, −sin a) (an Object3D rotated by `a` about +y) */
    uBeacon: { value: number };
    uBeaconPos: { value: Vector3 };
    uBeaconColor: { value: Color };
    uBeaconStrength: { value: number };
    /** 0 dry … 1 fully wet */
    uWet: { value: number };
  };
};

// ---------- GLSL ----------

const NOISE_GLSL = /* glsl */ `
float hv_h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hv_vn2(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hv_h21(i), b = hv_h21(i + vec2(1.0, 0.0)), c = hv_h21(i + vec2(0.0, 1.0)), d = hv_h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float hv_h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hv_vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hv_h31(i), hv_h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hv_h31(i + vec3(0.0, 1.0, 0.0)), hv_h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hv_h31(i + vec3(0.0, 0.0, 1.0)), hv_h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hv_h31(i + vec3(0.0, 1.0, 1.0)), hv_h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

/** cast-iron surface shared by the letter and its reflection: sand-cast grain, mottle, worn (smoother, brighter) bevels */
const IRON_SURFACE_GLSL = /* glsl */ `
  float grain = hv_vn3(vHvObj * 42.0) * 0.6 + hv_vn3(vHvObj * 130.0 + 7.0) * 0.4;
  float mottle = hv_vn3(vHvObj * 5.5 + 3.0);
  float rough = csm_Roughness + (grain - 0.5) * 0.18 + (mottle - 0.5) * 0.08 - vHvBevel * 0.16;
  csm_Roughness = clamp(rough, 0.06, 1.0);
  vec3 ironCol = csm_DiffuseColor.rgb * (0.88 + 0.24 * mottle) * (1.0 + 0.45 * vHvBevel);
  float heatT = uHeat * uHeat;
  vec3 heatCol = mix(uHeatColor, vec3(1.0, 0.78, 0.6), heatT * 0.45);
  vec3 heatEmissive = heatCol * heatT * (0.07 + 0.93 * vHvBevel) * ${HEAT_INTENSITY.toFixed(2)};
`;

const IRON_VERT = /* glsl */ `
attribute float aBevel;
varying float vHvBevel;
varying vec3 vHvObj;
void main() {
  vHvBevel = aBevel;
  vHvObj = position;
}
`;

const IRON_FRAG = /* glsl */ `
uniform float uHeat;
uniform vec3 uHeatColor;
varying float vHvBevel;
varying vec3 vHvObj;
${NOISE_GLSL}
void main() {
${IRON_SURFACE_GLSL}
  csm_DiffuseColor.rgb = ironCol;
  csm_Emissive = heatEmissive;
}
`;

/**
 * Reflection: the mesh is a child of the letter, so `modelMatrix` is the body's world matrix. Each vertex is mirrored
 * about the world floor (y = 0) and brought back to object space so three's lighting, fog and depth all see the mirrored
 * point. Mirroring flips the winding, so the material renders BackSide and the normal is pre-negated (three negates it
 * again for FLIP_SIDED).
 */
const REFLECTION_VERT = /* glsl */ `
attribute float aBevel;
uniform float uNormalSign;
varying float vHvBevel;
varying vec3 vHvObj;
varying float vHvMirrorY;
void main() {
  vHvBevel = aBevel;
  vHvObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y = -w.y;
  vHvMirrorY = w.y;
  csm_Position = (inverse(modelMatrix) * w).xyz;
  mat3 m3 = mat3(modelMatrix);
  vec3 nW = normalize(m3 * normal);
  nW.y = -nW.y;
  csm_Normal = uNormalSign * normalize(transpose(m3) * nW);
}
`;

const REFLECTION_FRAG = /* glsl */ `
uniform float uHeat;
uniform vec3 uHeatColor;
uniform float uFade;
uniform float uStrength;
varying float vHvBevel;
varying vec3 vHvObj;
varying float vHvMirrorY;
${NOISE_GLSL}
void main() {
  if (vHvMirrorY > 0.0) discard;
  float fade = 1.0 - smoothstep(0.0, uFade, -vHvMirrorY);
  fade *= fade;
${IRON_SURFACE_GLSL}
  csm_DiffuseColor.rgb = ironCol * 0.92;
  csm_DiffuseColor.a = uStrength * fade;
  csm_Emissive = heatEmissive * fade;
}
`;

const FLOOR_VERT = /* glsl */ `
varying vec3 vHvWorld;
void main() {
  vHvWorld = (modelMatrix * vec4(position, 1.0)).xyz;
}
`;

const FLOOR_FRAG = /* glsl */ `
uniform float uTime;
uniform float uBeacon;
uniform vec3 uBeaconPos;
uniform vec3 uBeaconColor;
uniform float uBeaconStrength;
uniform float uWet;
varying vec3 vHvWorld;
${NOISE_GLSL}
void main() {
  vec2 p = vHvWorld.xz;
  float puddle = hv_vn2(p * 0.33) * 0.7 + hv_vn2(p * 0.9 + 13.1) * 0.3;
  float mid = hv_vn2(p * 2.1 + 5.0);
  float fine = hv_vn2(p * 11.0);
  float wet = smoothstep(0.38, 0.72, puddle) * uWet;
  float rough = mix(0.84, 0.2, wet) + (fine - 0.5) * 0.14 + (mid - 0.5) * 0.1;
  csm_Roughness = clamp(rough, 0.08, 1.0);
  vec3 base = csm_DiffuseColor.rgb * (0.82 + 0.36 * mid) * mix(1.0, 0.5, wet);
  csm_DiffuseColor.rgb = base;
  vec3 toP = vHvWorld - uBeaconPos;
  float dist = length(toP.xz);
  vec2 dir = toP.xz / max(dist, 1e-3);
  vec2 beam = vec2(cos(uBeacon), -sin(uBeacon));
  float lobe = pow(max(dot(dir, beam), 0.0), 40.0);
  float falloff = 1.0 / (1.0 + dist * dist * 0.05);
  float gloss = mix(0.3, 1.0, wet);
  csm_Emissive += uBeaconColor * lobe * falloff * gloss * uBeaconStrength;
}
`;

/**
 * A mirror image shows the real letter reflecting the real (upper) environment, but three lights the mirrored geometry
 * with the environment as seen from below the floor. Flipping the y of the IBL lookup directions restores the sheen of
 * the lightformers on the mirrored faces. Guarded: if the chunk text ever changes, the stock chunk is used.
 */
const MIRRORED_IBL_CHUNK: string | null = (() => {
  const src = ShaderChunk.envmap_physical_pars_fragment;
  const irradiance = "vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );";
  const radiance = "reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );";
  if (typeof src !== "string" || !src.includes(irradiance) || !src.includes(radiance)) return null;
  return src
    .replace(irradiance, `${irradiance}\n\t\t\tworldNormal.y = -worldNormal.y;`)
    .replace(radiance, `${radiance}\n\t\t\treflectVec.y = -reflectVec.y;`);
})();

// ---------- factories ----------

export interface IronOptions {
  anisotropy?: boolean;
  color?: string;
}

/** Cast iron (one instance per letter: `uHeat` is per mesh). Same shader for every instance, so one program. */
export function createIronMaterial({ anisotropy = false, color = TOKENS.iron }: IronOptions = {}): IronMaterial {
  const mat = new CustomShaderMaterial<typeof MeshPhysicalMaterial>({
    baseMaterial: MeshPhysicalMaterial,
    color: new Color(color),
    metalness: IRON.metalness,
    roughness: IRON.roughness,
    ...(anisotropy ? { anisotropy: IRON.anisotropy, anisotropyRotation: Math.PI / 4 } : {}),
    envMapIntensity: 1.4,
    vertexShader: IRON_VERT,
    fragmentShader: IRON_FRAG,
    uniforms: { uHeat: { value: 0 }, uHeatColor: { value: new Color(TOKENS.signal) } },
  }) as unknown as IronMaterial;
  mat.name = "iron";
  return mat;
}

export interface ReflectionOptions extends IronOptions {
  /** metres below the floor at which the reflection has faded out (default 5) */
  fade?: number;
  /** alpha at the floor line (default 0.55) */
  strength?: number;
}

/** Floor reflection of an iron letter: mirrored in the vertex shader, alpha fades with depth below y = 0. */
export function createReflectionMaterial({ anisotropy = false, color = TOKENS.iron, fade = 5, strength = 0.55 }: ReflectionOptions = {}): ReflectionMaterial {
  const mat = new CustomShaderMaterial<typeof MeshPhysicalMaterial>({
    baseMaterial: MeshPhysicalMaterial,
    color: new Color(color),
    metalness: IRON.metalness,
    roughness: IRON.roughness + 0.1,
    ...(anisotropy ? { anisotropy: IRON.anisotropy, anisotropyRotation: Math.PI / 4 } : {}),
    envMapIntensity: 1.1,
    transparent: true,
    side: BackSide,
    vertexShader: REFLECTION_VERT,
    fragmentShader: REFLECTION_FRAG,
    ...(MIRRORED_IBL_CHUNK ? { patchMap: { "*": { "#include <envmap_physical_pars_fragment>": MIRRORED_IBL_CHUNK } } } : {}),
    uniforms: {
      uHeat: { value: 0 },
      uHeatColor: { value: new Color(TOKENS.signal) },
      uFade: { value: fade },
      uStrength: { value: strength },
      /** −1 pre-negates for BackSide (three negates again under FLIP_SIDED); exposed for the lab */
      uNormalSign: { value: -1 },
    },
  }) as unknown as ReflectionMaterial;
  mat.name = "iron-reflection";
  return mat;
}

/** Black steel for the chain links and the rail. */
export function createChainMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: new Color(CHAIN.color), metalness: CHAIN.metalness, roughness: CHAIN.roughness, envMapIntensity: 1.2 });
  mat.name = "chain";
  return mat;
}

export interface FloorOptions {
  color?: string;
  wetness?: number;
  beaconPosition?: readonly [number, number, number];
  beaconColor?: string;
  beaconStrength?: number;
}

/**
 * Wet polished concrete. `depthWrite` is off so the letter reflections (rendered below y = 0) show through; nothing else
 * in the hall lives below the floor, so depth stays correct for everything above it. Drive `uBeacon` each frame with
 * `syncFloorMaterial()` (or set `uniforms.uBeacon.value` yourself).
 */
export function createFloorMaterial({
  color = TOKENS.floor,
  wetness = 0.7,
  beaconPosition = BEACON_POSITION,
  beaconColor = TOKENS.signal,
  beaconStrength = 0.45,
}: FloorOptions = {}): FloorMaterial {
  const mat = new CustomShaderMaterial<typeof MeshStandardMaterial>({
    baseMaterial: MeshStandardMaterial,
    color: new Color(color),
    metalness: 0.05,
    roughness: 0.8,
    envMapIntensity: 0.7,
    depthWrite: false,
    vertexShader: FLOOR_VERT,
    fragmentShader: FLOOR_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uBeacon: { value: 0 },
      uBeaconPos: { value: new Vector3(...beaconPosition) },
      uBeaconColor: { value: new Color(beaconColor) },
      uBeaconStrength: { value: beaconStrength },
      uWet: { value: wetness },
    },
  }) as unknown as FloorMaterial;
  mat.name = "floor";
  return mat;
}

/** Per-frame sync of the floor uniforms from `sceneState.beaconAngle` (U4 writes it) and the clock. */
export function syncFloorMaterial(mat: FloorMaterial, elapsed?: number): void {
  mat.uniforms.uBeacon.value = sceneState.beaconAngle;
  if (elapsed !== undefined) mat.uniforms.uTime.value = elapsed;
}

// ---------- heat ----------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

function applyHeat(material: Material | Material[], heat: number): void {
  const list = Array.isArray(material) ? material : [material];
  for (const m of list) {
    const u = (m as Partial<IronMaterial>).uniforms;
    if (u && u.uHeat) {
      u.uHeat.value = heat;
    } else if ((m as MeshStandardMaterial).isMeshStandardMaterial) {
      const s = m as MeshStandardMaterial;
      s.emissive.set(TOKENS.signal);
      s.emissiveIntensity = heat * HEAT_INTENSITY;
    }
  }
}

/** Heat pulse 0–1 on a letter mesh (and its reflection, when `LetterMesh` attached one in `userData.reflection`). */
export function setHeat(mesh: Mesh, value: number): void {
  const heat = clamp01(value);
  mesh.userData.heat = heat;
  applyHeat(mesh.material, heat);
  const reflection = mesh.userData.reflection as Mesh | undefined;
  if (reflection) applyHeat(reflection.material, heat);
}

export function getHeat(mesh: Mesh): number {
  const h = mesh.userData.heat;
  return typeof h === "number" ? h : 0;
}
