import { describe, expect, it } from "vitest";
import { TIER_CONFIGS, type TierConfig } from "./contracts";
import { configAfterSteps, FRAME_GUARD_DEFAULTS, FrameGuardCore, ladderPath, nextStep, resolveTierConfig, sameConfig } from "./tier";

describe("resolveTierConfig", () => {
  it("caps the pixel ratio instead of targeting it", () => {
    expect(resolveTierConfig("high", { devicePixelRatio: 3, viewportWidth: 1440 }).dpr).toBe(2);
    expect(resolveTierConfig("high", { devicePixelRatio: 1, viewportWidth: 1440 }).dpr).toBe(1);
    expect(resolveTierConfig("mid", { devicePixelRatio: 3, viewportWidth: 390 }).dpr).toBe(1.5);
    expect(resolveTierConfig("mid", { devicePixelRatio: 1.25, viewportWidth: 1024 }).dpr).toBe(1.25);
  });
  it("drops high to 1.5 above 1920 px wide", () => {
    expect(resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 2560 }).dpr).toBe(1.5);
    expect(resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1920 }).dpr).toBe(2);
  });
  it("keeps every other field from the table and gives low no canvas", () => {
    const high = resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1440 });
    expect({ ...high, dpr: TIER_CONFIGS.high.dpr }).toEqual(TIER_CONFIGS.high);
    expect(resolveTierConfig("low", { devicePixelRatio: 2, viewportWidth: 390 })).toEqual(TIER_CONFIGS.low);
  });
  it("treats a broken pixel ratio as 1", () => {
    expect(resolveTierConfig("high", { devicePixelRatio: NaN, viewportWidth: 1440 }).dpr).toBe(1);
    expect(resolveTierConfig("mid", { devicePixelRatio: 0, viewportWidth: 390 }).dpr).toBe(1);
  });
});

/** Every field that costs something must be monotonic down the ladder. */
function expectNoPromotion(a: TierConfig, b: TierConfig): void {
  expect(b.dpr).toBeLessThanOrEqual(a.dpr);
  expect(!b.post || a.post).toBe(true);
  expect(!b.shadows || a.shadows).toBe(true);
  expect(!b.reflections || a.reflections).toBe(true);
  expect(!b.cones || a.cones).toBe(true);
  expect(!b.anisotropy || a.anisotropy).toBe(true);
  expect(b.dust).toBeLessThanOrEqual(a.dust);
  expect(b.maxBodies).toBeLessThanOrEqual(a.maxBodies);
}

describe("ladder", () => {
  it("walks high down to the poster in the DESIGN order, never promoting", () => {
    const start = resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1440 });
    const path = ladderPath(start);
    expect(path.map((p) => p.step)).toEqual(["post", "shadows", "dpr", "dpr", "dpr", "dpr", "mid", "reflections", "cones", "poster"]);
    expect(path.map((p) => p.config.dpr)).toEqual([2, 2, 1.75, 1.5, 1.25, 1, 1, 1, 1, 0]);
    let previous = start;
    for (const { config } of path) {
      expectNoPromotion(previous, config);
      previous = config;
    }
    expect(path.at(-1)?.config).toEqual(TIER_CONFIGS.low);
    expect(nextStep(path.at(-1)!.config)).toBeNull();
  });
  it("walks a phone (mid, dpr 1.5) down: dpr 1 → reflections → cones → poster", () => {
    const start = resolveTierConfig("mid", { devicePixelRatio: 3, viewportWidth: 390 });
    const path = ladderPath(start);
    expect(path.map((p) => p.step)).toEqual(["dpr", "reflections", "cones", "poster"]);
    expect(path[0].config.dpr).toBe(1);
    expect(path[1].config.reflections).toBe(false);
    expect(path[2].config.cones).toBe(false);
    expect(path[3].config.tier).toBe("low");
  });
  it("skips rungs that would change nothing", () => {
    const high1 = resolveTierConfig("high", { devicePixelRatio: 1, viewportWidth: 1440 });
    expect(ladderPath(high1).map((p) => p.step)).toEqual(["post", "shadows", "mid", "reflections", "cones", "poster"]);
    const mid1 = resolveTierConfig("mid", { devicePixelRatio: 1, viewportWidth: 1024 });
    expect(ladderPath(mid1).map((p) => p.step)).toEqual(["reflections", "cones", "poster"]);
  });
  it("keeps the context-bound fields when high becomes mid", () => {
    const start = resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1440 });
    const mid = ladderPath(start).find((p) => p.step === "mid")!.config;
    expect(mid.tier).toBe("mid");
    expect(mid.antialias).toBe(TIER_CONFIGS.high.antialias);
    expect(mid.curveSegments).toBe(TIER_CONFIGS.high.curveSegments);
    expect(mid.maxBodies).toBe(TIER_CONFIGS.high.maxBodies);
    expect(mid.post).toBe(false);
    expect(mid.shadows).toBe(false);
    expect(mid.anisotropy).toBe(false);
  });
  it("compares configs by value", () => {
    const a = resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1440 });
    expect(sameConfig(a, { ...a })).toBe(true);
    expect(sameConfig(a, { ...a, dpr: 1.5 })).toBe(false);
  });
  it("replays a number of steps from the base (the frame guard's give-back)", () => {
    const high = resolveTierConfig("high", { devicePixelRatio: 2, viewportWidth: 1440 });
    const path = ladderPath(high);
    expect(configAfterSteps(high, 0)).toBe(high);
    for (let n = 1; n <= path.length; n++) expect(configAfterSteps(high, n)).toEqual(path[n - 1].config);
    expect(configAfterSteps(high, path.length + 3)).toEqual(path.at(-1)?.config);
  });
  it("has nothing below low", () => {
    expect(nextStep(TIER_CONFIGS.low)).toBeNull();
    expect(ladderPath(TIER_CONFIGS.low)).toEqual([]);
  });
});

/** Feeds `frames` frames of `dt` ms each; returns the timestamps at which the core asked for a demotion. */
function run(core: FrameGuardCore, from: number, dt: number, frames: number): number[] {
  const hits: number[] = [];
  let now = from;
  for (let i = 0; i < frames; i++) {
    now += dt;
    if (core.sample(now)) hits.push(now);
  }
  return hits;
}

/**
 * Like `run`, but each step changes the frame time: frames are `dts[n]` ms long after `n` steps (the last entry holds).
 * From `finalAt` steps on, the next rung would be the poster. Runs for `ms` of page time.
 */
function runSteps(core: FrameGuardCore, dts: number[], ms: number, finalAt = Infinity): number[] {
  const hits: number[] = [];
  let now = 0;
  while (now < ms) {
    now += dts[Math.min(hits.length, dts.length - 1)];
    if (core.sample(now, hits.length >= finalAt)) hits.push(now);
  }
  return hits;
}

describe("FrameGuardCore", () => {
  it("never demotes a steady 60 fps", () => {
    const core = new FrameGuardCore(0);
    expect(run(core, 0, 16.7, 1200)).toEqual([]);
    expect(core.mean).toBeCloseTo(16.7, 5);
  });
  it("demotes a slow page within 3 s of the first judged frame, then steps on after the grace period while steps pay off", () => {
    const core = new FrameGuardCore(0);
    const hits = runSteps(core, [36, 30, 25, 16.7], 30000);
    expect(hits.length).toBe(3);
    const firstJudged = FRAME_GUARD_DEFAULTS.warmupMs;
    expect(hits[0] - firstJudged).toBeLessThanOrEqual(3000);
    expect(hits[0] - firstJudged).toBeGreaterThanOrEqual(FRAME_GUARD_DEFAULTS.sustainMs);
    expect(hits[1] - hits[0]).toBeGreaterThanOrEqual(FRAME_GUARD_DEFAULTS.graceMs + FRAME_GUARD_DEFAULTS.sustainMs);
    expect(core.holding).toBe(false);
  });
  it("holds at a browser frame cap (Energy Saver, Low Power Mode: 30 fps): the step that bought nothing is given back", () => {
    const core = new FrameGuardCore(0);
    expect(run(core, 0, 1000 / 30, 1800)).toHaveLength(1); // one minute at 30 fps: one step, never the poster
    expect(core.holding).toBe(true);
    expect(core.takeUndo()).toBe(true);
    expect(core.takeUndo()).toBe(false);
  });
  it("never trades the 3D for the poster above ~22 fps, even while steps pay off", () => {
    const core = new FrameGuardCore(0);
    const hits = runSteps(core, [40, 34, 30], 60000, 2);
    expect(hits).toHaveLength(2);
    expect(core.holding).toBe(true);
    expect(core.takeUndo()).toBe(false); // the last step did help: it stays
  });
  it("keeps stepping below the floor, gain or not, so a crawling page still reaches the poster", () => {
    const core = new FrameGuardCore(0, { warmupMs: 0 });
    expect(runSteps(core, [100], 40000, 2).length).toBeGreaterThanOrEqual(4);
    expect(core.holding).toBe(false);
  });
  it("once holding, still steps when the frame rate collapses below the floor", () => {
    const core = new FrameGuardCore(0);
    let hits = run(core, 0, 1000 / 30, 600);
    expect(hits).toHaveLength(1);
    expect(core.holding).toBe(true);
    hits = run(core, 20000, 80, 100);
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
  it("ignores hitches: one long frame among fast ones is neither sampled nor sustained", () => {
    const core = new FrameGuardCore(0);
    let now = 2000;
    core.sample(now);
    for (let i = 0; i < 59; i++) {
      now += 16;
      expect(core.sample(now)).toBe(false);
    }
    now += 900; // a tab switch / GC pause
    expect(core.sample(now)).toBe(false);
    expect(core.mean).toBeCloseTo(16, 5);
    expect(run(core, now, 16, 600)).toEqual([]);
  });
  it("needs the slowness to be sustained", () => {
    const core = new FrameGuardCore(0, { warmupMs: 0 });
    expect(run(core, 0, 40, 30)).toEqual([]); // 1.2 s slow
    expect(run(core, 1200, 14, 200)).toEqual([]); // then fast again: the timer resets
    expect(core.slowFor(1200 + 200 * 14)).toBe(0);
  });
  it("suspend drops the window so idle half-rate frames never count", () => {
    const core = new FrameGuardCore(0, { warmupMs: 0 });
    run(core, 0, 33, 19); // the first frame only establishes the timestamp
    expect(core.samples).toBe(18);
    core.suspend(700);
    expect(core.samples).toBe(0);
    expect(core.mean).toBeNaN();
    // the first frame after a suspension has no known duration and is not sampled
    expect(core.sample(2000)).toBe(false);
    expect(core.samples).toBe(0);
    expect(core.sample(2016)).toBe(false);
    expect(core.samples).toBe(1);
  });
  it("judges a crawling page by time span, not frame count: 100 ms frames demote within 3 s", () => {
    const core = new FrameGuardCore(0, { warmupMs: 0 });
    const hits = run(core, 0, 100, 40);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]).toBeLessThanOrEqual(3000);
  });
  it("honours custom options", () => {
    const core = new FrameGuardCore(0, { warmupMs: 0, minSamples: 5, sustainMs: 100, slowMs: 20 });
    const hits = run(core, 0, 30, 20);
    expect(hits.length).toBe(1);
    // 5 samples by 180 ms, slow since then, sustained 100 ms → the frame at 300 ms
    expect(hits[0]).toBe(300);
  });
});
