#!/usr/bin/env node
/**
 * contrast.mjs — recomputes the Night Rig text/background pairs of docs/DESIGN.md §1 and §3 from the tokens in
 * src/app/globals.css (`:root`) and fails when a pair is under its minimum:
 *   13:1  body text, mercury titles on void / floor, void on text (toast), and text on the weakest ink-well pixel
 *   7:1   muted text on void / floor (DESIGN: 7.9:1)
 *   4.5:1 signal accent text (only at ≥ 16 px / 500: DESIGN 5.6:1), void on signal (primary button), muted on the scrim
 * "Weakest ink-well pixel": the lowest non-zero alpha of the `.ink-well` scrim composited over pure white (a blown-out
 * highlight) and over mercury (the key light) — the brightest thing text can ever sit on. `--steel`, `--iron` and
 * `--signal-deep` carry no text and are listed for information only.
 *
 * Usage: node scripts/verify/contrast.mjs [path/to/globals.css]   (default: src/app/globals.css)
 * Exit code 1 on any failure.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "src/app/globals.css");
const css = readFileSync(file, "utf8");

const TOKENS = ["void", "floor", "iron", "steel", "text", "muted", "mercury", "signal", "signal-deep"];
/** [foreground, background, minimum, role] */
const PAIRS = [
  ["text", "void", 13, "body text"],
  ["text", "floor", 13, "body text on cards / floor"],
  ["mercury", "void", 13, "h1, titles, giant email"],
  ["mercury", "floor", 13, "titles on cards"],
  ["muted", "void", 7, "secondary text (DESIGN 7.9:1)"],
  ["muted", "floor", 7, "secondary text on cards"],
  ["signal", "void", 4.5, "accent text ≥ 16 px / 500 (DESIGN 5.6:1), focus ring"],
  ["signal", "floor", 4.5, "accent on cards"],
  ["void", "signal", 4.5, "primary button label"],
  ["void", "text", 13, "toast"],
];
const INFO = [
  ["steel", "void", "hairlines, chains (no text)"],
  ["iron", "void", "cast iron (no text)"],
  ["signal-deep", "void", "glows / scrims only, never text"],
];

/** Reads `--name: #hex;` declarations inside the first `:root {` block. */
function readRoot() {
  const start = css.indexOf(":root {");
  if (start < 0) throw new Error("no :root block in " + file);
  const end = css.indexOf("}", start);
  const block = css.slice(start, end);
  const out = {};
  for (const name of TOKENS) {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(block);
    if (m) out[name] = m[1];
  }
  return out;
}

/** Alphas of the void scrim in a CSS value: `rgba(5, 5, 7, a)` literals and `color-mix(in srgb, var(--void) N%, transparent)`. */
function scrimAlphas(value) {
  const out = [...value.matchAll(/rgba\(\s*5\s*,\s*5\s*,\s*7\s*,\s*(0?\.\d+|1|0)\s*\)/g)].map((m) => Number(m[1]));
  for (const m of value.matchAll(/color-mix\([^)]*var\(--void\)\s*(\d+(?:\.\d+)?)%[^)]*transparent\s*\)/g)) out.push(Number(m[1]) / 100);
  return out.filter((a) => a > 0);
}

/** The lowest non-zero alpha of the `.ink-well` scrim — in the block itself or in the `:root` tokens it uses (`var(--scrim)`). */
function readScrimAlpha() {
  const start = css.indexOf(".ink-well {");
  if (start < 0) return null;
  const block = css.slice(start, css.indexOf("}", start));
  const rootStart = css.indexOf(":root {");
  const rootBlock = rootStart < 0 ? "" : css.slice(rootStart, css.indexOf("}", rootStart));
  const alphas = scrimAlphas(block);
  for (const m of block.matchAll(/var\((--[\w-]+)\)/g)) {
    const token = new RegExp(`${m[1]}:\\s*([^;]+);`).exec(rootBlock);
    if (token) alphas.push(...scrimAlphas(token[1]));
  }
  return alphas.length ? Math.min(...alphas) : null;
}

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function contrast(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
/** `over` composited with `alpha` on top of `under` (both sRGB 0–255 triples). */
const composite = (over, alpha, under) => over.map((c, i) => Math.round(c * alpha + under[i] * (1 - alpha)));
const hex = ([r, g, b]) => "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

const tokens = readRoot();
let failed = false;
const missing = TOKENS.filter((t) => !tokens[t]);
if (missing.length) {
  console.error(`missing tokens in :root: ${missing.join(", ")}`);
  failed = true;
}
console.log(`tokens from ${path.relative(root, file)}`);
console.log("  pair                               ratio   min   role");
const line = (ok, name, ratio, min, role) => console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(30)} ${ratio.toFixed(2).padStart(6)}:1 ${String(min).padStart(5)}  ${role}`);
for (const [fg, bg, min, role] of PAIRS) {
  if (!tokens[fg] || !tokens[bg]) continue;
  const ratio = contrast(hexToRgb(tokens[fg]), hexToRgb(tokens[bg]));
  const ok = ratio >= min;
  if (!ok) failed = true;
  line(ok, `${fg} on ${bg}`, ratio, min, role);
}

const alpha = readScrimAlpha();
if (alpha === null) {
  console.log("  info .ink-well scrim not found (no composite check)");
} else {
  const voidRgb = hexToRgb(tokens.void);
  for (const [underName, under] of [
    ["white", [255, 255, 255]],
    ["mercury", hexToRgb(tokens.mercury)],
  ]) {
    const pixel = composite(voidRgb, alpha, under);
    for (const [fg, min] of [
      ["text", 13],
      ["mercury", 13],
      ["muted", 4.5],
      ["signal", 4.5],
    ]) {
      const ratio = contrast(hexToRgb(tokens[fg]), pixel);
      const ok = ratio >= min;
      if (!ok) failed = true;
      line(ok, `${fg} on scrim ${alpha} / ${underName}`, ratio, min, `ink-well over ${underName} → ${hex(pixel)}`);
    }
  }
}
for (const [fg, bg, role] of INFO) {
  if (!tokens[fg] || !tokens[bg]) continue;
  console.log(`  info ${`${fg} on ${bg}`.padEnd(30)} ${contrast(hexToRgb(tokens[fg]), hexToRgb(tokens[bg])).toFixed(2).padStart(6)}:1        ${role}`);
}
console.log(failed ? "\nFAILED: a pair is under its minimum" : "\nall pairs meet their minimums");
process.exit(failed ? 1 : 0);
