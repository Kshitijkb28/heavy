#!/usr/bin/env node
/**
 * make-og.mjs — renders scripts/og/poster.html (the Night Rig share poster: the name in Anton under the key-light pool,
 * mirrored in the wet floor, raked by the beacon) with Playwright driving the system Chrome into
 *   public/og.png            1200 × 630   (metadata.openGraph / twitter images in src/app/layout.tsx)
 *   src/app/icon.png          512 × 512   (Next `icon` file convention → <link rel="icon">)
 *   src/app/apple-icon.png    180 × 180   (Next `apple-icon` file convention → apple-touch-icon)
 * The icons carry one iron initial. Text comes from src/data/content.json (the content the in-page editor commits; the
 * deploy workflow re-runs `--only=og` so the share card follows edits); the Anton face from tools/fonts is embedded as a
 * data URI so no file:// font loading is involved. `CHROME_PATH` overrides the macOS Chrome (CI: /usr/bin/google-chrome).
 *
 * Usage: node scripts/make-og.mjs [--only=og|icon|apple]   (npm run make:og)
 */
import { readFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
/** Metal ANGLE is macOS only; elsewhere Chrome picks its own GL backend. */
const GPU_ARGS = process.platform === "darwin" ? ["--use-angle=metal", "--ignore-gpu-blocklist"] : [];
const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

const { profile, links } = JSON.parse(readFileSync(path.join(root, "src/data/content.json"), "utf8"));

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const font = readFileSync(path.join(root, "tools/fonts/Anton-Regular.ttf")).toString("base64");
const html = readFileSync(path.join(root, "scripts/og/poster.html"), "utf8")
  .replace("{{ANTON_DATA_URI}}", `data:font/ttf;base64,${font}`)
  .replaceAll("{{FIRST}}", escape(profile.firstName))
  .replaceAll("{{LAST}}", escape(profile.lastName))
  .replace("{{INITIAL}}", escape(profile.firstName.slice(0, 1)))
  .replace("{{EYEBROW}}", escape(profile.eyebrow))
  .replace("{{SITE}}", escape(links.site.label));

/** [variant, width, height, output] */
const TARGETS = [
  ["og", 1200, 630, "public/og.png"],
  ["icon", 512, 512, "src/app/icon.png"],
  ["apple", 180, 180, "src/app/apple-icon.png"],
].filter(([variant]) => !only || variant === only);

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [...GPU_ARGS, "--hide-scrollbars", "--font-render-hinting=none"] });
try {
  for (const [variant, width, height, out] of TARGETS) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html.replace('data-variant="og"', `data-variant="${variant}"`), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => document.fonts.check('400 100px "Anton"'));
    if (!loaded) throw new Error("Anton did not load");
    const file = path.join(root, out);
    mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: "png", clip: { x: 0, y: 0, width, height } });
    await page.close();
    console.log(`wrote ${out} — ${width}×${height}, ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
} finally {
  await browser.close();
}
