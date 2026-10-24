#!/usr/bin/env node
/**
 * bake-typeface.mjs — converts tools/fonts/Anton-Regular.ttf (SIL OFL 1.1, see tools/fonts/OFL.txt) into the three.js
 * typeface JSON that `FontLoader` / `TextGeometry` consume (`public/fonts/anton.typeface.json`). Only the glyphs the site
 * extrudes are kept (A–Z, 0–9, a few marks) so the file stays small. Outline commands follow three's FontLoader order:
 * `m x y`, `l x y`, `q x y cx cy` (end point first, then the control point), `b x y c1x c1y c2x c2y`.
 *
 * Usage: node scripts/bake-typeface.mjs            (re-run only when the font or the glyph set changes)
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "tools/fonts/Anton-Regular.ttf");
const out = path.join(root, "public/fonts/anton.typeface.json");
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.@-&'? ";

const buf = readFileSync(src);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r = (n) => Math.round(n);

const glyphs = {};
for (const ch of CHARS) {
  const g = font.charToGlyph(ch);
  if (!g || g.index === 0) throw new Error(`glyph missing for ${JSON.stringify(ch)}`);
  const parts = [];
  for (const c of g.path.commands) {
    switch (c.type) {
      case "M": parts.push("m", r(c.x), r(c.y)); break;
      case "L": parts.push("l", r(c.x), r(c.y)); break;
      case "Q": parts.push("q", r(c.x), r(c.y), r(c.x1), r(c.y1)); break;
      case "C": parts.push("b", r(c.x), r(c.y), r(c.x1), r(c.y1), r(c.x2), r(c.y2)); break;
      case "Z": break; // subpaths close implicitly in three
      default: throw new Error(`unknown command ${c.type}`);
    }
  }
  const bb = g.getBoundingBox();
  glyphs[ch] = { ha: r(g.advanceWidth), x_min: r(bb.x1), x_max: r(bb.x2), o: parts.join(" ") };
}

const head = font.tables.head;
const post = font.tables.post ?? {};
const data = {
  glyphs,
  familyName: font.names.fontFamily?.en ?? "Anton",
  ascender: r(font.ascender),
  descender: r(font.descender),
  underlinePosition: r(post.underlinePosition ?? -100),
  underlineThickness: r(post.underlineThickness ?? 50),
  boundingBox: { xMin: r(head.xMin), xMax: r(head.xMax), yMin: r(head.yMin), yMax: r(head.yMax) },
  resolution: font.unitsPerEm,
  original_font_information: {
    font_family_name: font.names.fontFamily?.en ?? "Anton",
    license: "SIL Open Font License 1.1 — tools/fonts/OFL.txt",
    copyright: font.names.copyright?.en ?? "",
  },
  cssFontWeight: "400",
  cssFontStyle: "normal",
};

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(data));
const kb = (readFileSync(out).length / 1024).toFixed(1);
console.log(`wrote ${path.relative(root, out)} — ${Object.keys(glyphs).length} glyphs, ${kb} KB, upem ${font.unitsPerEm}`);
