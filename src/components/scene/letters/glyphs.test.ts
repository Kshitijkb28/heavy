import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { NAME_ROWS } from "@/data/derived";
import {
  BEVEL,
  GLYPH_DEPTH,
  HULL_MAX_POINTS,
  buildHull,
  clearGlyphCache,
  convexHull2D,
  getGlyph,
  getMetrics,
  glyphCacheSize,
  hasGlyph,
  isTypefaceReady,
  parseTypeface,
  scaleHull,
  simplifyHull2D,
  warmGlyphs,
} from "./glyphs";

const typeface = JSON.parse(readFileSync("public/fonts/anton.typeface.json", "utf8"));
const NAME_CHARS = [...new Set(NAME_ROWS.join(""))];

beforeAll(() => {
  parseTypeface(typeface);
});

describe("typeface", () => {
  it("parses and exposes the baked glyph set", () => {
    expect(isTypefaceReady()).toBe(true);
    for (const c of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.@-&'? ") expect(hasGlyph(c)).toBe(true);
    expect(hasGlyph("a")).toBe(false);
  });
  it("derives metrics from the font without extruding", () => {
    const k = getMetrics("K");
    expect(k.advance).toBeCloseTo(967 / 2048, 5);
    expect(k.w).toBeCloseTo((985 - 78) / 2048 + 2 * BEVEL.size, 5);
    expect(k.h).toBeGreaterThan(0.85);
    expect(k.h).toBeLessThan(1.0);
    expect(k.d).toBeCloseTo(GLYPH_DEPTH + 2 * BEVEL.thickness, 6);
    const space = getMetrics(" ");
    expect(space.w).toBe(0);
    expect(space.advance).toBeCloseTo(480 / 2048, 5);
  });
});

describe("getGlyph", () => {
  it("caches per (char, curveSegments)", () => {
    clearGlyphCache();
    const a = getGlyph("K", 4);
    const b = getGlyph("K", 4);
    const c = getGlyph("K", 3);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(glyphCacheSize()).toBe(2);
    expect(c.geometry).not.toBe(a.geometry);
  });
  it("centres every geometry on its bounding-box centre", () => {
    for (const ch of NAME_CHARS) {
      const g = getGlyph(ch, 4);
      g.geometry.computeBoundingBox();
      const bb = g.geometry.boundingBox!;
      expect(Math.abs(bb.max.x + bb.min.x)).toBeLessThan(1e-5);
      expect(Math.abs(bb.max.y + bb.min.y)).toBeLessThan(1e-5);
      expect(Math.abs(bb.max.z + bb.min.z)).toBeLessThan(1e-5);
      expect(bb.max.x - bb.min.x).toBeCloseTo(g.size.w, 5);
      expect(bb.max.z - bb.min.z).toBeCloseTo(GLYPH_DEPTH + 2 * BEVEL.thickness, 5);
    }
  });
  it("stays within the triangle budget (≤ 3k per letter at curveSegments 4)", () => {
    let total = 0;
    for (const ch of NAME_ROWS.join("")) {
      const g = getGlyph(ch, 4);
      expect(g.triangles).toBeLessThanOrEqual(3000);
      expect(g.triangles).toBe(g.geometry.getAttribute("position").count / 3);
      total += g.triangles;
    }
    expect(total).toBeLessThan(8000);
  });
  it("builds a ≤ 64-point hull on the front and back planes inside the box", () => {
    for (const ch of NAME_CHARS) {
      const g = getGlyph(ch, 4);
      const n = g.hull.length / 3;
      expect(n).toBeLessThanOrEqual(HULL_MAX_POINTS);
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n % 2).toBe(0);
      const half = n / 2;
      for (let i = 0; i < n; i++) {
        const x = g.hull[i * 3];
        const y = g.hull[i * 3 + 1];
        const z = g.hull[i * 3 + 2];
        expect(Math.abs(x)).toBeLessThanOrEqual(g.size.w / 2 + 1e-5);
        expect(Math.abs(y)).toBeLessThanOrEqual(g.size.h / 2 + 1e-5);
        expect(Math.abs(Math.abs(z) - g.size.d / 2)).toBeLessThan(1e-5);
        if (i < half) expect(z).toBeLessThan(0);
        else expect(z).toBeGreaterThan(0);
      }
    }
    expect(getGlyph("S", 4).hull.length / 3).toBe(64);
  });
  it("marks bevel faces with the aBevel attribute", () => {
    const g = getGlyph("H", 4);
    const bevel = g.geometry.getAttribute("aBevel");
    expect(bevel.count).toBe(g.geometry.getAttribute("position").count);
    let ones = 0;
    for (let i = 0; i < bevel.count; i++) {
      const v = bevel.getX(i);
      expect(v === 0 || v === 1).toBe(true);
      ones += v;
    }
    expect(ones).toBeGreaterThan(0);
    expect(ones).toBeLessThan(bevel.count);
    const caps = g.geometry.groups.find((gr) => gr.materialIndex === 0)!;
    for (let i = caps.start; i < caps.start + caps.count; i++) expect(bevel.getX(i)).toBe(0);
  });
  it("yields an empty glyph for a space and falls back to ? for unknown characters", () => {
    const sp = getGlyph(" ", 4);
    expect(sp.triangles).toBe(0);
    expect(sp.hull.length).toBe(0);
    expect(sp.advance).toBeGreaterThan(0);
    const q = getGlyph("?", 4);
    const unknown = getGlyph("~", 4);
    expect(unknown.triangles).toBe(q.triangles);
  });
  it("clamps curveSegments to ≥ 1", () => {
    expect(() => getGlyph("K", 0)).not.toThrow();
    expect(getGlyph("K", 0)).toBe(getGlyph("K", 1));
  });
  it("warms every unique glyph without a frame scheduler", async () => {
    clearGlyphCache();
    await warmGlyphs(NAME_ROWS.join(""), 4);
    expect(glyphCacheSize()).toBe(NAME_CHARS.length);
  });
  it("scales hulls", () => {
    const h = scaleHull(new Float32Array([1, -2, 0.5]), 0.5);
    expect([...h]).toEqual([0.5, -1, 0.25]);
  });
});

describe("hull maths", () => {
  it("computes a convex hull and simplifies it to a budget", () => {
    const square: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
      [0.2, 0.9],
    ];
    const hull = convexHull2D(square);
    expect(hull).toHaveLength(4);
    const circle: [number, number][] = Array.from({ length: 50 }, (_, i) => [Math.cos((i / 50) * Math.PI * 2), Math.sin((i / 50) * Math.PI * 2)]);
    const h = convexHull2D(circle);
    expect(h).toHaveLength(50);
    expect(simplifyHull2D(h, 12)).toHaveLength(12);
  });
  it("buildHull emits both planes", () => {
    const g = getGlyph("I", 4).geometry;
    const hull = buildHull(g, 16);
    expect(hull.length / 3).toBeLessThanOrEqual(16);
  });
});
