/**
 * U2 — iron glyphs: TextGeometry per character of Anton + a convex-hull point cloud for Rapier (docs/DESIGN.md §4).
 *
 * `loadTypeface()` fetches and parses `public/fonts/anton.typeface.json` once; `getGlyph(char, curveSegments)` is then
 * synchronous and cached per (char, curveSegments). Every geometry is centred on its bounding-box centre so a rigid body
 * rotates about its middle, and carries an `aBevel` vertex attribute (1 on the bevel strips, 0 on faces and walls) that
 * the iron material uses for worn edges and the heat pulse. The hull is ≤ 64 points: the 2-D convex hull of the outline
 * (≤ 32 vertices, simplified by smallest-triangle removal) emitted on the front and back planes.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { Font } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { withBase } from "@/lib/base";

export const TYPEFACE_URL = "/fonts/anton.typeface.json";
/** metres per em at size 1 (the letters are one metre tall at the cap line, plus bevel) */
export const GLYPH_SIZE = 1;
export const GLYPH_DEPTH = 0.35;
export const BEVEL = { thickness: 0.04, size: 0.03, segments: 2 } as const;
export const HULL_MAX_POINTS = 64;
export const DEFAULT_CURVE_SEGMENTS = 4;

export interface GlyphData {
  geometry: BufferGeometry;
  /** flat xyz triples (≤ 64 points) for a Rapier convex hull collider, centred like the geometry, at scale 1 */
  hull: Float32Array;
  /** world size in metres at size 1 (bevel included) */
  size: { w: number; h: number; d: number };
  /** typographic horizontal advance at size 1 (for `layoutWord`) */
  advance: number;
  /** triangle count of `geometry` */
  triangles: number;
}

/** Font metrics of one character at size 1, without extruding anything (used by `layout.ts`). */
export interface GlyphMetrics {
  /** visual width / height / depth including the bevel (0 for a space) */
  w: number;
  h: number;
  d: number;
  /** typographic advance (spaces have one) */
  advance: number;
  /** left edge of the visual box relative to the pen position (bevel included) */
  xMin: number;
  /** bottom edge of the visual box relative to the baseline (bevel included) */
  yMin: number;
}

interface TypefaceGlyph {
  ha: number;
  x_min: number;
  x_max: number;
  o: string;
}
interface TypefaceData {
  glyphs: Record<string, TypefaceGlyph>;
  resolution: number;
  familyName: string;
}

let font: Font | null = null;
let data: TypefaceData | null = null;
let pending: Promise<void> | null = null;
const glyphCache = new Map<string, GlyphData>();
const metricsCache = new Map<string, GlyphMetrics>();

/** Parse an already-fetched typeface JSON (tests, or a preloaded module). Replaces any loaded font and clears the caches. */
export function parseTypeface(json: unknown): void {
  const d = json as TypefaceData;
  if (!d || typeof d !== "object" || !d.glyphs || !d.resolution) throw new Error("glyphs: not a three typeface JSON");
  font = new Font(json as ConstructorParameters<typeof Font>[0]);
  data = d;
  clearGlyphCache();
}

export function isTypefaceReady(): boolean {
  return font !== null;
}

/** Resolves once the typeface JSON is parsed; safe to call many times (one fetch; a failed fetch can be retried). */
export function loadTypeface(url: string = withBase(TYPEFACE_URL)): Promise<void> {
  if (font) return Promise.resolve();
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`glyphs: typeface fetch failed (${res.status}) ${url}`);
        return res.json();
      })
      .then((json) => {
        parseTypeface(json);
      })
      .catch((err: unknown) => {
        pending = null;
        throw err;
      });
  }
  return pending;
}

/** Characters the baked typeface contains (A–Z, 0–9, `. @ - & ' ?` and space). */
export function hasGlyph(char: string): boolean {
  return !!data?.glyphs[char];
}

function requireData(): TypefaceData {
  if (!data) throw new Error("glyphs: loadTypeface() has not resolved yet");
  return data;
}

/** Outline y-range of a typeface glyph from its path commands (control points included, so never smaller than the curve). */
function outlineYRange(o: string): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  const parts = o.split(" ");
  for (let i = 0; i < parts.length; ) {
    const cmd = parts[i++];
    const n = cmd === "m" || cmd === "l" ? 1 : cmd === "q" ? 2 : cmd === "b" ? 3 : 0;
    for (let k = 0; k < n; k++) {
      i++; // x
      const y = Number(parts[i++]);
      if (y < min) min = y;
      if (y > max) max = y;
    }
  }
  if (!Number.isFinite(min)) return { min: 0, max: 0 };
  return { min, max };
}

/** Font-derived metrics at size 1 (synchronous after `loadTypeface()`); unknown characters fall back to `?`. */
export function getMetrics(char: string): GlyphMetrics {
  const hit = metricsCache.get(char);
  if (hit) return hit;
  const d = requireData();
  const g = d.glyphs[char] ?? d.glyphs["?"];
  if (!g) throw new Error(`glyphs: no glyph for ${JSON.stringify(char)}`);
  const s = GLYPH_SIZE / d.resolution;
  let m: GlyphMetrics;
  if (!g.o) {
    m = { w: 0, h: 0, d: 0, advance: g.ha * s, xMin: 0, yMin: 0 };
  } else {
    const ys = outlineYRange(g.o);
    m = {
      w: (g.x_max - g.x_min) * s + 2 * BEVEL.size,
      h: (ys.max - ys.min) * s + 2 * BEVEL.size,
      d: GLYPH_DEPTH + 2 * BEVEL.thickness,
      advance: g.ha * s,
      xMin: g.x_min * s - BEVEL.size,
      yMin: ys.min * s - BEVEL.size,
    };
  }
  metricsCache.set(char, m);
  return m;
}

/**
 * Marks bevel faces: ExtrudeGeometry is non-indexed with per-face vertices; group 1 holds the side walls and the bevel
 * strips, and only bevel vertices sit outside z ∈ [0, depth] before centring. A face is a bevel face when any of its
 * vertices does, which keeps the mask crisp along the strip edges.
 */
function addBevelMask(geometry: BufferGeometry): void {
  const pos = geometry.getAttribute("position");
  const mask = new Float32Array(pos.count);
  const eps = 1e-5;
  for (const group of geometry.groups) {
    if (group.materialIndex !== 1) continue;
    const end = group.start + group.count;
    for (let i = group.start; i + 2 < end; i += 3) {
      let bevel = 0;
      for (let k = 0; k < 3; k++) {
        const z = pos.getZ(i + k);
        if (z < -eps || z > GLYPH_DEPTH + eps) bevel = 1;
      }
      if (bevel) {
        mask[i] = 1;
        mask[i + 1] = 1;
        mask[i + 2] = 1;
      }
    }
  }
  geometry.setAttribute("aBevel", new Float32BufferAttribute(mask, 1));
}

type Pt = [number, number];

/** Andrew's monotone chain; returns the hull counter-clockwise without the repeated first point. */
export function convexHull2D(points: readonly Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Drops the hull vertex forming the smallest triangle with its neighbours until `max` remain (Visvalingam). */
export function simplifyHull2D(hull: readonly Pt[], max: number): Pt[] {
  const h = [...hull];
  const area = (a: Pt, b: Pt, c: Pt) => Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
  while (h.length > max) {
    let best = -1;
    let bestArea = Infinity;
    for (let i = 0; i < h.length; i++) {
      const a = h[(i + h.length - 1) % h.length];
      const c = h[(i + 1) % h.length];
      const ar = area(a, h[i], c);
      if (ar < bestArea) {
        bestArea = ar;
        best = i;
      }
    }
    h.splice(best, 1);
  }
  return h;
}

/** ≤ 64 hull points for a centred extrusion: the simplified 2-D outline hull on the front and back planes. */
export function buildHull(geometry: BufferGeometry, maxPoints = HULL_MAX_POINTS): Float32Array {
  const pos = geometry.getAttribute("position");
  const seen = new Set<string>();
  const pts: Pt[] = [];
  let zMin = Infinity;
  let zMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (z < zMin) zMin = z;
    if (z > zMax) zMax = z;
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)}`;
    if (!seen.has(key)) {
      seen.add(key);
      pts.push([x, y]);
    }
  }
  const hull = simplifyHull2D(convexHull2D(pts), Math.floor(maxPoints / 2));
  const out = new Float32Array(hull.length * 6);
  hull.forEach(([x, y], i) => {
    out.set([x, y, zMin], i * 3);
    out.set([x, y, zMax], hull.length * 3 + i * 3);
  });
  return out;
}

/** True when `getGlyph(char, curveSegments)` would return from the cache (no extrusion). */
export function isGlyphCached(char: string, curveSegments: number = DEFAULT_CURVE_SEGMENTS): boolean {
  return glyphCache.has(`${char}@${Math.max(1, Math.round(curveSegments))}`);
}

/** Scales a hull point cloud (for slots with `scale` ≠ 1). */
export function scaleHull(hull: Float32Array, scale: number): Float32Array {
  const out = new Float32Array(hull.length);
  for (let i = 0; i < hull.length; i++) out[i] = hull[i] * scale;
  return out;
}

const EMPTY = { w: 0, h: 0, d: 0 };

/** Synchronous after `loadTypeface()` resolved; cached per (char, curveSegments). A space yields an empty geometry. */
export function getGlyph(char: string, curveSegments: number = DEFAULT_CURVE_SEGMENTS): GlyphData {
  const cs = Math.max(1, Math.round(curveSegments));
  const key = `${char}@${cs}`;
  const hit = glyphCache.get(key);
  if (hit) return hit;
  if (!font) requireData();
  const metrics = getMetrics(char);
  const geometry = new TextGeometry(char, {
    font: font!,
    size: GLYPH_SIZE,
    depth: GLYPH_DEPTH,
    curveSegments: cs,
    bevelEnabled: true,
    bevelThickness: BEVEL.thickness,
    bevelSize: BEVEL.size,
    bevelSegments: BEVEL.segments,
  });
  const pos = geometry.getAttribute("position");
  let glyph: GlyphData;
  if (!pos || pos.count === 0) {
    geometry.dispose();
    glyph = { geometry: new BufferGeometry(), hull: new Float32Array(0), size: EMPTY, advance: metrics.advance, triangles: 0 };
  } else {
    addBevelMask(geometry);
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const size = { w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y, d: bb.max.z - bb.min.z };
    const c = bb.getCenter(new Vector3());
    geometry.translate(-c.x, -c.y, -c.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    glyph = { geometry, hull: buildHull(geometry), size, advance: metrics.advance, triangles: pos.count / 3 };
  }
  glyph.geometry.name = `glyph:${char}@${cs}`;
  glyphCache.set(key, glyph);
  return glyph;
}

/**
 * Extrudes the given characters a few per animation frame so a mount never blocks (DESIGN.md §4: three glyphs per
 * frame). Idempotent: cached glyphs cost nothing. Resolves when every glyph is ready.
 */
export function warmGlyphs(chars: Iterable<string>, curveSegments: number = DEFAULT_CURVE_SEGMENTS, perFrame = 3): Promise<void> {
  const list = [...new Set(chars)].filter((c) => c !== " ");
  if (typeof requestAnimationFrame !== "function") {
    for (const c of list) getGlyph(c, curveSegments);
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    let i = 0;
    const step = () => {
      try {
        for (let k = 0; k < perFrame && i < list.length; k++, i++) getGlyph(list[i], curveSegments);
      } catch (err) {
        reject(err);
        return;
      }
      if (i < list.length) requestAnimationFrame(step);
      else resolve();
    };
    step();
  });
}

/** Disposes every cached geometry (tests, or a full stage teardown). */
export function clearGlyphCache(): void {
  for (const g of glyphCache.values()) g.geometry.dispose();
  glyphCache.clear();
  metricsCache.clear();
}

/** Number of cached (char, curveSegments) entries — for the debug overlay and tests. */
export function glyphCacheSize(): number {
  return glyphCache.size;
}
