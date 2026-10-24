import { describe, expect, it } from "vitest";
import {
  REVEAL,
  cascadeDelay,
  classifyRect,
  instantRelease,
  gateIsOpen,
  handoffChange,
  handoffState,
  parseRevealConfig,
  parseRevealMode,
  readMotionMode,
  staggerFor,
  wantsMask,
} from "./reveal-core";

describe("parseRevealMode", () => {
  it("defaults to lines for a bare attribute, empty or unknown values", () => {
    expect(parseRevealMode(undefined)).toBe("lines");
    expect(parseRevealMode("")).toBe("lines");
    expect(parseRevealMode("sideways")).toBe("lines");
  });
  it("accepts every mode, trimmed and case-insensitive", () => {
    expect(parseRevealMode(" Words ")).toBe("words");
    expect(parseRevealMode("CHARS")).toBe("chars");
    expect(parseRevealMode("children")).toBe("children");
    expect(parseRevealMode("block")).toBe("block");
  });
});

describe("parseRevealConfig", () => {
  it("uses the spec timings by default: 12 px, 500 ms, 40 ms stagger, no delay", () => {
    expect(parseRevealConfig({})).toEqual({ mode: "lines", delay: 0, stagger: 0.04, distance: 12, duration: 0.5 });
  });
  it("staggers characters faster", () => {
    expect(parseRevealConfig({ reveal: "chars" }).stagger).toBe(REVEAL.charStagger);
  });
  it("reads ms / px overrides and ignores garbage", () => {
    const c = parseRevealConfig({ reveal: "children", revealDelay: "120", revealStagger: "60", revealDistance: "20" });
    expect(c).toEqual({ mode: "children", delay: 0.12, stagger: 0.06, distance: 20, duration: 0.5 });
    const bad = parseRevealConfig({ revealDelay: "soon", revealStagger: "-5", revealDistance: "" });
    expect(bad.delay).toBe(0);
    expect(bad.stagger).toBe(0.04);
    expect(bad.distance).toBe(12);
  });
});

describe("classifyRect", () => {
  const vh = 800;
  it("marks blocks fully above the viewport as scrolled past", () => {
    expect(classifyRect(-300, -20, vh)).toBe("above");
    expect(classifyRect(-300, 0, vh)).toBe("above");
  });
  it("marks blocks whose top crossed 85 % of the viewport as visible, including tall ones straddling it", () => {
    expect(classifyRect(100, 300, vh)).toBe("visible");
    expect(classifyRect(679, 900, vh)).toBe("visible");
    expect(classifyRect(-100, 2000, vh)).toBe("visible");
  });
  it("marks blocks below the reveal line as still to come", () => {
    expect(classifyRect(680, 900, vh)).toBe("below");
    expect(classifyRect(1500, 1700, vh)).toBe("below");
  });
});

describe("staggerFor", () => {
  it("is zero for a single piece", () => {
    expect(staggerFor(1, 0.04)).toBe(0);
    expect(staggerFor(0, 0.04)).toBe(0);
  });
  it("keeps the base stagger for short lists and caps the total for long ones", () => {
    expect(staggerFor(6, 0.04)).toBe(0.04);
    expect(staggerFor(46, 0.04)).toBeCloseTo(0.9 / 45, 6);
    expect(staggerFor(46, 0.04) * 45).toBeLessThanOrEqual(REVEAL.maxStaggerTotal);
  });
});

describe("cascadeDelay", () => {
  it("lands same-frame blocks 70 ms apart in order, capped so a long section never crawls", () => {
    expect(cascadeDelay(0)).toBe(0);
    expect(cascadeDelay(1)).toBeCloseTo(0.07, 6);
    expect(cascadeDelay(3)).toBeCloseTo(0.21, 6);
    expect(cascadeDelay(40)).toBeCloseTo(REVEAL.cascadeMax * REVEAL.cascade, 6);
    expect(cascadeDelay(-2)).toBe(0);
  });
});

describe("instantRelease", () => {
  it("skips the drop for blocks scrolled past and for visible blocks the safety timer already showed", () => {
    expect(instantRelease("above", false, false)).toBe(true);
    expect(instantRelease("visible", true, true)).toBe(true);
    expect(instantRelease("below", true, true)).toBe(true);
    expect(instantRelease("visible", true, false)).toBe(false);
    expect(instantRelease("below", false, true)).toBe(false);
  });
});

describe("wantsMask", () => {
  it("masks body text and leaves tight display line-heights unclipped", () => {
    expect(wantsMask(27.9, 18)).toBe(true);
    expect(wantsMask(73.6, 80)).toBe(false);
    expect(wantsMask(Number.NaN, 18)).toBe(false);
  });
});

describe("readMotionMode and the gate", () => {
  it("is calm when the layout said so or the media query matches", () => {
    expect(readMotionMode("calm", false)).toBe("calm");
    expect(readMotionMode("full", true)).toBe("calm");
    expect(readMotionMode(undefined, false)).toBe("full");
  });
  it("opens on calm, on load, on failure, or at the 1.8 s timeout", () => {
    const base = { mode: "full" as const, loaded: false, failed: false, elapsedMs: 0, timeoutMs: 1800 };
    expect(gateIsOpen(base)).toBe(false);
    expect(gateIsOpen({ ...base, mode: "calm" })).toBe(true);
    expect(gateIsOpen({ ...base, loaded: true })).toBe(true);
    expect(gateIsOpen({ ...base, failed: true })).toBe(true);
    expect(gateIsOpen({ ...base, elapsedMs: 1800 })).toBe(true);
  });
});

describe("hero handoff", () => {
  it("is on only once the entrance settled and while the scene is live", () => {
    expect(handoffState(false, false)).toBe(false);
    expect(handoffState(true, false)).toBe(true);
    expect(handoffState(true, true)).toBe(false);
  });
  it("only reports edges so a manual override is not undone by polling", () => {
    expect(handoffChange(null, false)).toBe(false);
    expect(handoffChange(false, false)).toBeNull();
    expect(handoffChange(false, true)).toBe(true);
    expect(handoffChange(true, false)).toBe(false);
  });
});
