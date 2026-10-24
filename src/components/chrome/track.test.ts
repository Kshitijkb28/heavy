import { describe, expect, it } from "vitest";
import { markerProgress, TRACK_SPAN } from "./track";

describe("markerProgress", () => {
  it("maps HOME … CONTACT onto 0 … 1", () => {
    expect(TRACK_SPAN).toBe(6);
    expect(markerProgress(0)).toBe(0);
    expect(markerProgress(3)).toBe(0.5);
    expect(markerProgress(6)).toBe(1);
    expect(markerProgress(2.4)).toBeCloseTo(0.4);
  });
  it("holds at the ends and ignores garbage", () => {
    expect(markerProgress(7)).toBe(1);
    expect(markerProgress(-1)).toBe(0);
    expect(markerProgress(Number.NaN)).toBe(0);
    expect(markerProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
