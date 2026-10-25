import { TIER_CONFIGS, type Tier, type TierConfig } from "./contracts";

/**
 * Device tier (docs/DESIGN.md "Device tiers"). Runs once on the client after mount; never during render.
 * low  = reduced motion, Data Saver, no hardware WebGL2, small textures, ≤ 2 GB memory, or `?tier=low`
 * mid  = any coarse-pointer device (phones/tablets; never demote iPhones on hardwareConcurrency), or a weak desktop
 * high = fine pointer with ≥ 8 GB and ≥ 6 cores
 * `?tier=high|mid|low` forces a tier for testing. U8 adds the runtime ladder (step down only) in `useFrameGuard.ts`.
 */
export function detectTier(): Tier {
  return detectTierWithReason().tier;
}

/**
 * Why `detectTier` chose its tier; Providers writes it to `html[data-tier-reason]` and the `?debug=stats` line shows it,
 * so a visitor who only gets the poster can say why. `software-webgl`: WebGL2 runs, but on the CPU (graphics
 * acceleration off in the browser, or the GPU blocklisted); `no-webgl2`: none at all (or blocked for the site).
 */
export type TierReason = "forced" | "reduced-motion" | "save-data" | "low-memory" | "software-webgl" | "no-webgl2" | "touch" | "memory" | "cores" | "capable";

export function detectTierWithReason(): { tier: Tier; reason: TierReason } {
  if (typeof window === "undefined") return { tier: "mid", reason: "capable" };
  const forced = new URLSearchParams(window.location.search).get("tier");
  if (forced === "high" || forced === "mid" || forced === "low") return { tier: forced, reason: "forced" };

  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return { tier: "low", reason: "reduced-motion" };
  if (nav.connection?.saveData) return { tier: "low", reason: "save-data" };
  if ((nav.deviceMemory ?? 8) <= 2) return { tier: "low", reason: "low-memory" };
  const webgl = probeWebGL2();
  if (webgl !== "hardware") return { tier: "low", reason: webgl === "software" ? "software-webgl" : "no-webgl2" };

  const coarse = window.matchMedia("(pointer: coarse)").matches && !window.matchMedia("(pointer: fine)").matches;
  if (coarse) return { tier: "mid", reason: "touch" };
  if ((nav.deviceMemory ?? 8) <= 4) return { tier: "mid", reason: "memory" };
  if ((navigator.hardwareConcurrency ?? 8) < 6) return { tier: "mid", reason: "cores" };
  return { tier: "high", reason: "capable" };
}

/**
 * Hardware WebGL2 with usable texture sizes. A software renderer (SwiftShader) reports a major performance caveat and
 * counts as unsupported; a second, caveat-free context tells it apart from no WebGL2 at all (for the reason only).
 */
function probeWebGL2(): "hardware" | "software" | "none" {
  try {
    const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: true, powerPreference: "high-performance" });
    if (gl) {
      const ok = gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return ok ? "hardware" : "none";
    }
    const soft = document.createElement("canvas").getContext("webgl2");
    soft?.getExtension("WEBGL_lose_context")?.loseContext();
    return soft ? "software" : "none";
  } catch {
    return "none";
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

/** The config `count` rungs below `base`: the ladder is deterministic, so this replays the steps taken from it. */
export function configAfterSteps(base: TierConfig, count: number): TierConfig {
  let cfg = base;
  for (let i = 0; i < count; i++) cfg = nextStep(cfg)?.config ?? cfg;
  return cfg;
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
  /**
   * a step that did not make the mean at least this much faster (fraction) shows the frame rate is not set by what the
   * stage draws — the browser or the display paces it (Chrome's Energy Saver and iOS Low Power Mode hold pages at
   * 30 fps; a 30 Hz screen) — so the guard gives that step back and holds instead of stepping on to the poster
   */
  minGain: number;
  /** below this frame rate (mean ms, ≈ 22 fps) the guard steps on even without a gain, and only below it does the last
   *  rung trade the 3D for the poster */
  floorMs: number;
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
  minGain: 0.1,
  floorMs: 45,
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
  /** the mean that triggered the last step (NaN before the first) */
  private stepMean = NaN;
  /** a mean above this is slow: `slowMs`, or `floorMs` once the guard holds */
  private limit: number;
  private undoPending = false;

  constructor(now: number, options: Partial<FrameGuardOptions> = {}) {
    this.options = { ...FRAME_GUARD_DEFAULTS, ...options };
    this.buffer = new Float64Array(Math.max(1, Math.floor(this.options.window)));
    this.quietUntil = now + this.options.warmupMs;
    this.limit = this.options.slowMs;
  }

  /** true once frames proved to be paced by something no rung changes (or only the poster was left): from then on the
   *  guard only steps below `floorMs` */
  get holding(): boolean {
    return this.limit > this.options.slowMs;
  }

  /** true once (then false) when the guard started holding because its last step bought no speed: give that step back */
  takeUndo(): boolean {
    const pending = this.undoPending;
    this.undoPending = false;
    return pending;
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
   * Feed one frame (its timestamp in ms); `finalRung` says the next step would be the poster. Returns true when a
   * demotion is due; the window is then dropped and the guard goes quiet for `graceMs`. A slow spell that a step did
   * not shorten (by `minGain`), or that only the poster could answer, makes the guard hold instead while the frame rate
   * stays above the floor.
   */
  sample(now: number, finalRung = false): boolean {
    const dt = now - this.last;
    this.last = now;
    if (!Number.isFinite(dt) || dt <= 0) return false;
    if (now < this.quietUntil) return false;
    if (dt > this.options.hitchMs) return false;
    this.push(dt);
    if (this.count < this.options.minSamples && (this.count < 3 || this.sum < this.options.minSpanMs)) return false;
    if (this.mean <= this.limit) {
      this.slowSince = NaN;
      return false;
    }
    if (Number.isNaN(this.slowSince)) this.slowSince = now;
    if (now - this.slowSince < this.options.sustainMs) return false;
    const mean = this.mean;
    const gained = Number.isNaN(this.stepMean) || mean < this.stepMean * (1 - this.options.minGain);
    this.clear();
    this.slowSince = NaN;
    if (mean <= this.options.floorMs && (!gained || finalRung)) {
      this.undoPending = !gained;
      this.limit = this.options.floorMs;
      return false;
    }
    this.stepMean = mean;
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
