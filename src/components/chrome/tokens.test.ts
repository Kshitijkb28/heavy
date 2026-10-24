import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Readability guard for the token sheet (docs/DESIGN.md §1): text ≥ 13:1 on every scrim, accent ≥ 4.5:1, names frozen. */
const css = readFileSync(path.resolve(import.meta.dirname, "../../app/globals.css"), "utf8");

function rootTokens(): Record<string, string> {
  const start = css.indexOf(":root {");
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]] = m[2].toLowerCase();
  return out;
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const t = rootTokens();

describe("Night Rig tokens", () => {
  it("keeps the frozen values", () => {
    expect(t).toMatchObject({ void: "#050507", floor: "#0b0c10", iron: "#2a2d34", steel: "#596270", text: "#e8ecf2", muted: "#9aa3af", mercury: "#d7e6ff", signal: "#ff3355", "signal-deep": "#7a0f23" });
    expect(css).toContain("--seam: rgba(232, 236, 242, 0.08)");
  });
  it("reads ≥ 13:1 for text and titles on the void and on the floor plate", () => {
    expect(contrast(t.text, t.void)).toBeGreaterThanOrEqual(13);
    expect(contrast(t.text, t.floor)).toBeGreaterThanOrEqual(13);
    expect(contrast(t.mercury, t.void)).toBeGreaterThanOrEqual(13);
    expect(contrast(t.mercury, t.floor)).toBeGreaterThanOrEqual(13);
  });
  it("keeps secondary text and the accent legible", () => {
    expect(contrast(t.muted, t.void)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.muted, t.floor)).toBeGreaterThanOrEqual(7);
    expect(contrast(t.signal, t.void)).toBeGreaterThanOrEqual(4.5); // eyebrow (≥ 16 px / 500) and the primary button
  });
  it("never renames a primitive", () => {
    for (const cls of [".sr-only", ".mono", ".ink-well", ".page", ".stage", ".hold", ".skip-link", ".section", ".hero-name", ".hero-line", ".toast"]) expect(css).toContain(`${cls} {`);
  });
  it("ships the U6 class contract", () => {
    for (const cls of [".btn", ".btn--primary", ".btn--ghost", ".btn--link", ".chip", ".section__head", ".section__index", ".section__title", ".section__annotation", ".eyebrow", ".card", ".row", ".hero-hook", ".hero-ctas", ".hero-hint", ".push-button", ".giant-email"]) expect(css).toMatch(new RegExp(`${cls.replace(/[.-]/g, "\\$&")}\\b`));
  });
});
