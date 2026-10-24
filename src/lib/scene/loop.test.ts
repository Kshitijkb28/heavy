import { describe, expect, it } from "vitest";
import { LOOP, clampDelta, nextLoopMode } from "./loop";

describe("stage loop state machine", () => {
  it("runs every frame while the visitor is here", () => {
    expect(nextLoopMode(0, true, true)).toBe("always");
    expect(nextLoopMode(LOOP.halfAfterMs - 1, true, true)).toBe("always");
  });
  it("drops to half rate after 8 s only once the bodies sleep", () => {
    expect(nextLoopMode(LOOP.halfAfterMs, true, true)).toBe("half");
    expect(nextLoopMode(LOOP.halfAfterMs, false, true)).toBe("always");
    expect(nextLoopMode(LOOP.demandAfterMs - 1, false, true)).toBe("always");
  });
  it("rests in demand mode after 60 s", () => {
    expect(nextLoopMode(LOOP.demandAfterMs, true, true)).toBe("demand");
    expect(nextLoopMode(LOOP.demandAfterMs, false, true)).toBe("demand");
  });
  it("never renders while hidden", () => {
    expect(nextLoopMode(0, false, false)).toBe("never");
    expect(nextLoopMode(LOOP.demandAfterMs, true, false)).toBe("never");
  });
  it("clamps frame deltas after a hidden tab", () => {
    expect(clampDelta(1 / 60)).toBeCloseTo(1 / 60, 12);
    expect(clampDelta(2)).toBe(LOOP.maxDelta);
    expect(clampDelta(-1)).toBe(LOOP.maxDelta);
    expect(clampDelta(NaN)).toBe(LOOP.maxDelta);
    expect(clampDelta(0.5, 0.1)).toBe(0.1);
  });
});
