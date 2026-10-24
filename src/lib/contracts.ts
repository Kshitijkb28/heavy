/**
 * Frozen contracts for HEAVY (docs/DESIGN.md). Every unit codes against these types; only the integrator
 * changes this file. Runtime values that change at 60 Hz live in `scene-state.ts` (plain mutable singleton, read in
 * useFrame); low-frequency UI state lives in `store/ui.ts` (zustand).
 */

export type Tier = "high" | "mid" | "low";

/** What a tier is allowed to spend. Resolved once by `detectTier()`; the runtime ladder (U8) can only step down. */
export interface TierConfig {
  tier: Tier;
  /** device-pixel-ratio cap for the canvas (0 = no canvas: poster). */
  dpr: number;
  /** EffectComposer (Bloom + SMAA + Vignette + ChromaticAberration + ToneMapping). */
  post: boolean;
  /** real-time shadow map on the key spotlight. */
  shadows: boolean;
  /** mirrored letters in the wet floor. */
  reflections: boolean;
  /** volumetric light cones (additive shader quads). */
  cones: boolean;
  /** dust particle count (0 = none). */
  dust: number;
  /** TextGeometry curveSegments for the iron glyphs. */
  curveSegments: number;
  /** total rigid bodies allowed (15 letters + 3 initials + lamp). */
  maxBodies: number;
  /** MeshPhysicalMaterial anisotropy on the iron. */
  anisotropy: boolean;
  /** MSAA on the canvas (mid); high uses SMAA in post instead. */
  antialias: boolean;
}

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  high: { tier: "high", dpr: 2, post: true, shadows: true, reflections: true, cones: true, dust: 400, curveSegments: 4, maxBodies: 19, anisotropy: true, antialias: false },
  mid: { tier: "mid", dpr: 1.5, post: false, shadows: false, reflections: true, cones: true, dust: 400, curveSegments: 3, maxBodies: 18, anisotropy: false, antialias: true },
  low: { tier: "low", dpr: 0, post: false, shadows: false, reflections: false, cones: false, dust: 0, curveSegments: 0, maxBodies: 0, anisotropy: false, antialias: false },
};

/** Page sections in scroll order; the journey parameter `t` is `index + localProgress` (hero = 0 … footer = 7). */
export const SECTION_ORDER = ["hero", "about", "experience", "projects", "stack", "education", "contact", "footer"] as const;
export type SectionId = (typeof SECTION_ORDER)[number];

/** Landscape vs portrait keyframe tables (phones and narrow windows are portrait). */
export type Aspect = "landscape" | "portrait";
export type Vec3 = readonly [number, number, number];

/** One camera keyframe on the dolly track. `t` is the journey parameter it is pinned to (fractional for sub-stops). */
export interface Keyframe {
  t: number;
  position: Vec3;
  /** what the camera looks at */
  target: Vec3;
  /** vertical field of view in degrees (default 32) */
  fov?: number;
}

/** Exported by U5 `places.ts`: sorted by `t`, first at t = 0, last at t = 7, for each aspect. */
export type KeyframeTable = Record<Aspect, readonly Keyframe[]>;

/** A grabbable iron body registered by U3 (letters and project initials). */
export interface Grabbable {
  id: string;
  /** which text this letter belongs to: "name" (hero rows) or a project id ("yot" | "remodely" | "servicepoints") */
  group: "name" | string;
  /** the rendered mesh (raycast target) */
  mesh: import("three").Object3D;
  /** home world position when hanging at rest */
  home: Vec3;
  /** impulse applied by the keyboard "push" button and the idle breeze */
  push: (impulse: Vec3, worldPoint?: Vec3) => void;
}

/** Status of the physics engine chunk. */
export type PhysicsStatus = "idle" | "loading" | "ready" | "failed";

/** Events the scene emits for the DOM (toasts, hints); dispatched on `window` as CustomEvent("heavy:<name>", { detail }). */
export type SceneEventName = "grab" | "release" | "snap" | "hoist" | "contact" | "physics-ready" | "poster";

export const PLACE_LABELS: Record<SectionId, string> = {
  hero: "HOME",
  about: "ABOUT",
  experience: "EXPERIENCE",
  projects: "PROJECTS",
  stack: "STACK",
  education: "EDUCATION",
  contact: "CONTACT",
  footer: "END",
};
