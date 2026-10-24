import { describe, expect, it } from "vitest";
import { decidePhysicsPolicy, IDLE_TIMEOUT_MS } from "./loader";

describe("physics load policy", () => {
  it("desktops load at idle", () => {
    expect(decidePhysicsPolicy({ coarsePointer: false })).toBe("idle");
    expect(decidePhysicsPolicy({ coarsePointer: false, effectiveType: "2g", saveData: true })).toBe("idle");
  });
  it("phones on 4g without Data Saver load at idle", () => {
    expect(decidePhysicsPolicy({ coarsePointer: true, effectiveType: "4g", saveData: false })).toBe("idle");
  });
  it("phones otherwise wait for the first pointerdown", () => {
    expect(decidePhysicsPolicy({ coarsePointer: true, effectiveType: "4g", saveData: true })).toBe("pointerdown");
    expect(decidePhysicsPolicy({ coarsePointer: true, effectiveType: "3g" })).toBe("pointerdown");
    expect(decidePhysicsPolicy({ coarsePointer: true, effectiveType: null })).toBe("pointerdown");
    expect(decidePhysicsPolicy({ coarsePointer: true })).toBe("pointerdown");
  });
  it("the idle deadline is 1.5 s", () => {
    expect(IDLE_TIMEOUT_MS).toBe(1500);
  });
});
