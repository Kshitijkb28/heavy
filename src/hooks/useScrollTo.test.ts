import { describe, expect, it } from "vitest";
import { hashFor, isPlainClick, resolveTop, type AnchorClickLike } from "./useScrollTo";

const click = (over: Partial<AnchorClickLike> = {}): AnchorClickLike => ({
  defaultPrevented: false,
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  preventDefault() {},
  ...over,
});

describe("hashFor", () => {
  it("clears the hash for home and writes it for sections", () => {
    expect(hashFor("hero")).toBe("");
    expect(hashFor("content")).toBe("");
    expect(hashFor("top")).toBe("");
    expect(hashFor("projects")).toBe("#projects");
  });
});

describe("resolveTop", () => {
  it("adds the scroll offset and subtracts the scroll margin", () => {
    expect(resolveTop(1200, 300, 64, 9000)).toBe(1436);
  });
  it("rounds and clamps into the scrollable range", () => {
    expect(resolveTop(10.4, 0, 64, 9000)).toBe(0);
    expect(resolveTop(20_000, 0, 0, 9000)).toBe(9000);
    expect(resolveTop(100, 0, 0, -50)).toBe(0); // page shorter than the viewport
    expect(resolveTop(100.6, 0, 0, 9000)).toBe(101);
  });
});

describe("isPlainClick", () => {
  it("accepts an unmodified primary click", () => {
    expect(isPlainClick(click())).toBe(true);
  });
  it("leaves modified, secondary and handled clicks to the browser", () => {
    expect(isPlainClick(click({ metaKey: true }))).toBe(false);
    expect(isPlainClick(click({ ctrlKey: true }))).toBe(false);
    expect(isPlainClick(click({ shiftKey: true }))).toBe(false);
    expect(isPlainClick(click({ altKey: true }))).toBe(false);
    expect(isPlainClick(click({ button: 1 }))).toBe(false);
    expect(isPlainClick(click({ defaultPrevented: true }))).toBe(false);
  });
});
