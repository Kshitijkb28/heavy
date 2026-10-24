import { TIER_CONFIGS, type Tier, type TierConfig } from "./contracts";

/**
 * Device tier (docs/DESIGN.md "Device tiers"). Runs once on the client after mount; never during render.
 * low  = reduced motion, Data Saver, no hardware WebGL2, small textures, ≤ 2 GB memory, or `?tier=low`
 * mid  = any coarse-pointer device (phones/tablets; never demote iPhones on hardwareConcurrency), or a weak desktop
 * high = fine pointer with ≥ 8 GB and ≥ 6 cores
 * `?tier=high|mid|low` forces a tier for testing. U8 adds the runtime ladder (step down only) in `useFrameGuard.ts`.
 */
export function detectTier(): Tier {
  if (typeof window === "undefined") return "mid";
  const forced = new URLSearchParams(window.location.search).get("tier");
  if (forced === "high" || forced === "mid" || forced === "low") return forced;

  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "low";
  if (nav.connection?.saveData) return "low";
  if ((nav.deviceMemory ?? 8) <= 2) return "low";
  if (!probeWebGL2()) return "low";

  const coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
  if (coarse) return "mid";
  if ((nav.deviceMemory ?? 8) <= 4) return "mid";
  if ((navigator.hardwareConcurrency ?? 8) < 6) return "mid";
  return "high";
}

/** Hardware WebGL2 with usable texture sizes; software renderers (SwiftShader) count as unsupported. */
function probeWebGL2(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" });
    if (!gl) return false;
    const ok = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch {
    return false;
  }
}

export function tierConfig(tier: Tier): TierConfig {
  return TIER_CONFIGS[tier];
}

/* ------------------------------------------------------------------------------------------------------------------
 * U8 — effective config, the runtime ladder and the frame-guard core. Pure (no DOM): `useFrameGuard.ts` binds them to
 * R3F, the quality store and `html[data-tier]`; `src/lib/tier.test.ts` covers them.
 * ---------------------------------------------------------------------------------------------------------------- */

/** What the static tier table cannot know: the device pixel ratio and the viewport width. */
export interface TierEnv {
  devicePixelRatio: number;
  viewportWidth: number;
}

const quantize = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The TierConfig a device actually runs: the table's `dpr` is a cap, never a target (high = min(2, dpr), 1.5 above
 * 1920 px wide; mid = min(1.5, dpr)); every other field is the table's. Low has no canvas (dpr 0).
 */
export function resolveTierConfig(tier: Tier, env: TierEnv): TierConfig {
  const base = TIER_CONFIGS[tier];
  if (tier === "low") return { ...base };
  const device = Number.isFinite(env.devicePixelRatio) && env.devicePixelRatio > 0 ? env.devicePixelRatio : 1;
  const cap = tier === "high" && env.viewportWidth > 1920 ? Math.min(base.dpr, 1.5) : base.dpr;
  return { ...base, dpr: quantize(Math.min(cap, device)) };
}

/** `TierEnv` read from the browser (call from effects only). */
export function readTierEnv(): TierEnv {
  if (typeof window === "undefined") return { devicePixelRatio: 1, viewportWidth: 1440 };
  return { devicePixelRatio: window.devicePixelRatio || 1, viewportWidth: window.innerWidth };
}

/**
 * One rung of the step-down ladder (DESIGN.md §6, never promotes):
 * high: post → shadows → dpr −0.25 (floor 1, one rung per step) → mid; mid: dpr 1 → reflections → cones → poster.
 * `mid` keeps the context's `antialias`, the extruded `curveSegments` and `maxBodies` (none can change at runtime) and
 * only flips the presentation: no post, no shadows, no anisotropy, dpr ≤ 1.5, `tier: "mid"` so mid-only stand-ins
 * (glow sprites for bloom) switch on. `poster` is `TIER_CONFIGS.low`: the stage unmounts and the CSS poster stays.
 */
export type LadderStep = "post" | "shadows" | "dpr" | "mid" | "reflections" | "cones" | "poster";

export interface LadderResult {
  step: LadderStep;
  config: TierConfig;
}

export const LADDER_RUNGS: Record<Tier, readonly LadderStep[]> = {
  high: ["post", "shadows", "dpr", "mid"],
  mid: ["dpr", "reflections", "cones", "poster"],
  low: [],
};

function applyRung(cfg: TierConfig, step: LadderStep): TierConfig {
  switch (step) {
    case "post":
      return { ...cfg, post: false };
    case "shadows":
      return { ...cfg, shadows: false };
    case "dpr":
      if (cfg.tier === "high") return cfg.dpr > 1 ? { ...cfg, dpr: Math.max(1, quantize(cfg.dpr - 0.25)) } : cfg;
      return { ...cfg, dpr: Math.min(cfg.dpr, 1) };
    case "mid":
      return { ...cfg, tier: "mid", post: false, shadows: false, anisotropy: false, dpr: Math.min(cfg.dpr, TIER_CONFIGS.mid.dpr) };
    case "reflections":
      return { ...cfg, reflections: false };
    case "cones":
      return { ...cfg, cones: false };
    case "poster":
      return { ...TIER_CONFIGS.low };
  }
}

/** Field-by-field equality (configs are plain objects; identity means nothing across renders). */
export function sameConfig(a: TierConfig, b: TierConfig): boolean {
  for (const key of Object.keys(a) as (keyof TierConfig)[]) if (a[key] !== b[key]) return false;
  return true;
}

/** The next rung that changes something, or null when the ladder is exhausted (low / poster). */
export function nextStep(cfg: TierConfig): LadderResult | null {
  for (const step of LADDER_RUNGS[cfg.tier]) {
    const config = applyRung(cfg, step);
    if (!sameConfig(config, cfg)) return { step, config };
  }
  return null;
}

/** Every rung from `cfg` down to the poster, in order (for the debug overlay and tests). */
export function ladderPath(cfg: TierConfig): LadderResult[] {
  const out: LadderResult[] = [];
  let current = cfg;
  for (let i = 0; i < 24; i++) {
    const next = nextStep(current);
    if (!next) break;
    out.push(next);
    current = next.config;
  }
  return out;
}

/** Frame-guard tuning (DESIGN.md §6: "60-frame rolling mean > 22 ms for 2 s"). */
export interface FrameGuardOptions {
  /** rolling window length in frames */
  window: number;
  /** a rolling mean above this (ms) counts as slow */
  slowMs: number;
  /** how long the mean must stay slow before a step (ms) */
  sustainMs: number;
  /** judgement pause after a step, so one demotion can take effect before the next is considered (ms) */
  graceMs: number;
  /** a single frame longer than this is a hitch (GC, tab switch, shader compile) and is not sampled (ms) */
  hitchMs: number;
  /** samples needed before the mean is trusted … */
  minSamples: number;
  /** … or, sooner, the span of frame time (ms) the window must cover: a 100 ms-per-frame page is judged after 5 frames */
  minSpanMs: number;
  /** judgement pause after construction: first paint, compiles, the letter drop (ms) */
  warmupMs: number;
}

export const FRAME_GUARD_DEFAULTS: FrameGuardOptions = {
  window: 60,
  slowMs: 22,
  sustainMs: 2000,
  graceMs: 2500,
  hitchMs: 250,
  minSamples: 20,
  minSpanMs: 500,
  warmupMs: 1000,
};

/**
 * The pure part of the frame guard: feed it frame timestamps, it says when a demotion is due. One instance per canvas
 * mount; `suspend()` whenever frames are not representative (half-rate idle loop, demand mode, hidden tab).
 */
export class FrameGuardCore {
  readonly options: FrameGuardOptions;
  private readonly buffer: Float64Array;
  private head = 0;
  private count = 0;
  private sum = 0;
  private last = NaN;
  private slowSince = NaN;
  private quietUntil: number;

  constructor(now: number, options: Partial<FrameGuardOptions> = {}) {
    this.options = { ...FRAME_GUARD_DEFAULTS, ...options };
    this.buffer = new Float64Array(Math.max(1, Math.floor(this.options.window)));
    this.quietUntil = now + this.options.warmupMs;
  }

  /** samples in the window */
  get samples(): number {
    return this.count;
  }

  /** rolling mean frame time in ms (NaN while empty) */
  get mean(): number {
    return this.count ? this.sum / this.count : NaN;
  }

  /** false during warm-up and grace */
  judging(now: number): boolean {
    return now >= this.quietUntil;
  }

  /** ms the mean has been continuously slow (0 when it is not) */
  slowFor(now: number): number {
    return Number.isNaN(this.slowSince) ? 0 : now - this.slowSince;
  }

  /**
   * Feed one frame (its timestamp in ms). Returns true when a demotion is due; the window is then dropped and the
   * guard goes quiet for `graceMs`.
   */
  sample(now: number): boolean {
    const dt = now - this.last;
    this.last = now;
    if (!Number.isFinite(dt) || dt <= 0) return false;
    if (now < this.quietUntil) return false;
    if (dt > this.options.hitchMs) return false;
    this.push(dt);
    if (this.count < this.options.minSamples && (this.count < 3 || this.sum < this.options.minSpanMs)) return false;
    if (this.mean <= this.options.slowMs) {
      this.slowSince = NaN;
      return false;
    }
    if (Number.isNaN(this.slowSince)) this.slowSince = now;
    if (now - this.slowSince < this.options.sustainMs) return false;
    this.clear();
    this.slowSince = NaN;
    this.quietUntil = now + this.options.graceMs;
    return true;
  }

  /** Drop the window and pause judgement for `ms` (0 = until fresh samples fill it again). */
  suspend(now: number, ms = 0): void {
    this.clear();
    this.slowSince = NaN;
    this.last = NaN;
    this.quietUntil = Math.max(this.quietUntil, now + ms);
  }

  private push(dt: number): void {
    const size = this.buffer.length;
    if (this.count === size) this.sum -= this.buffer[this.head];
    else this.count++;
    this.buffer[this.head] = dt;
    this.sum += dt;
    this.head = (this.head + 1) % size;
  }

  private clear(): void {
    this.head = 0;
    this.count = 0;
    this.sum = 0;
  }
}
