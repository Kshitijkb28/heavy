#!/usr/bin/env node
/**
 * overflow.mjs — layout audit in the system Chrome (docs/DESIGN.md §7 "Phone layout", §10 "Verification").
 *
 * 11 viewports × 5 scroll stops:
 *   - `document.scrollingElement.scrollWidth === clientWidth` (nothing wider than the viewport, 320 px included)
 *   - no rendered element whose box crosses the viewport's left or right edge (±0.5 px)
 * plus, at 320×568, the hero fit (both `.hero-line`s ≤ 288 px of layout width, the hero's last CTA inside the first
 * viewport, measured in layout space so reveal transforms do not count) and, on every phone viewport, a tap-target audit
 * (every visible interactive element ≥ 44 × 44 px; inline links by their padded hit box; the closed stage sheet is
 * skipped). Console errors and warnings fail the run too (React key / hydration warnings count).
 *
 * Usage: node scripts/verify/overflow.mjs [url] [--tier=high|mid|low] [--viewports=390x844,1440x900] [--shots=dir]
 *   default url http://localhost:3200; `--tier` appends `?tier=`; `--shots` saves a screenshot per viewport at stop 0.
 * Exit code 1 on any failure. Phones run with a touch context and an iPhone user agent; never SwiftShader (the system
 * Chrome with Metal ANGLE, headless).
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3200").replace(/\/$/, "");
const tier = args.find((a) => a.startsWith("--tier="))?.slice("--tier=".length);
const onlyViewports = args.find((a) => a.startsWith("--viewports="))?.slice("--viewports=".length).split(",");
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** [width, height, kind] */
const VIEWPORTS = [
  [320, 568, "phone"],
  [360, 740, "phone"],
  [375, 667, "phone"],
  [390, 844, "phone"],
  [412, 915, "phone"],
  [430, 932, "phone"],
  [768, 1024, "tablet"],
  [1024, 768, "desktop"],
  [1280, 800, "desktop"],
  [1440, 900, "desktop"],
  [1920, 1080, "desktop"],
].filter(([w, h]) => !onlyViewports || onlyViewports.includes(`${w}x${h}`));
const STOPS = [0, 0.25, 0.5, 0.75, 1];
const TAP_MIN = 44;
const HERO_FIT_VIEWPORT = "320x568";
const HERO_LINE_MAX = 288;

/** Runs in the page: elements crossing the viewport's side edges. Dev-tools portals are not content; a visually hidden
 *  element (1 × 1 px, clipped, pulled 1 px off the edge by its negative margin) is not layout; descendants of an in-view
 *  ancestor with overflow hidden/clip are clipped, not wide. */
function findWide() {
  const vw = window.innerWidth;
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("nextjs-portal")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.width <= 1 && r.height <= 1)) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      // painted inside an ancestor that clips horizontally and itself sits within the viewport (the CSS poster's sweeping
      // beacon, carousels): clipped, so it can neither show past the edge nor widen the page
      let clipped = false;
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ox = getComputedStyle(a).overflowX;
        if (ox === "hidden" || ox === "clip") {
          const ar = a.getBoundingClientRect();
          if (ar.left >= -0.5 && ar.right <= vw + 0.5) clipped = true;
          break;
        }
      }
      if (clipped) continue;
      const id = el.id ? `#${el.id}` : "";
      const cls = [...el.classList].slice(0, 2).join(".");
      out.push(`${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} ${Math.round(r.left)}…${Math.round(r.right)}`);
    }
  }
  return out;
}

/** Runs in the page: hero fit at the smallest phone (scrollY 0), in layout space (offset chain, transforms ignored). */
function heroFit(HERO_LINE_MAX) {
  const top = (el) => {
    let y = 0;
    for (let node = el; node; node = node.offsetParent) y += node.offsetTop;
    return y;
  };
  const problems = [];
  const hero = document.querySelector('[data-section="hero"]');
  if (!hero) return { problems: ["no [data-section=hero]"], lines: [], ctaBottom: null };
  const lines = [...hero.querySelectorAll("h1 .hero-line")].map((s) => s.scrollWidth);
  if (lines.length !== 2) problems.push(`expected two .hero-line, found ${lines.length}`);
  for (const w of lines) if (w > HERO_LINE_MAX) problems.push(`h1 line ${w} px > ${HERO_LINE_MAX}`);
  const ctas = [...hero.querySelectorAll(".hero-ctas a, .hero-ctas button")];
  const last = ctas.at(-1);
  const ctaBottom = last ? top(last) + last.offsetHeight : null;
  if (!last) problems.push("no hero CTA");
  else if (ctaBottom > window.innerHeight) problems.push(`last CTA bottom ${ctaBottom} > ${window.innerHeight}`);
  if (last && ctaBottom > top(hero) + hero.offsetHeight) problems.push("CTAs below the hero section");
  return { problems, lines, ctaBottom };
}

/** Runs in the page: visible interactive elements under 44 × 44 (the padded box of inline links counts). */
function tapTargets(TAP_MIN) {
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
    if (seen.has(el) || el.closest("nextjs-portal, dialog:not([open])")) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    let w = r.width;
    let h = r.height;
    if (cs.display === "inline") {
      const boxes = [...el.getClientRects()];
      h = Math.max(...boxes.map((b) => b.height));
      w = Math.max(...boxes.map((b) => b.width));
    }
    if (w + 0.5 < TAP_MIN || h + 0.5 < TAP_MIN) {
      const id = el.id ? `#${el.id}` : "";
      const cls = [...el.classList].slice(0, 2).join(".");
      out.push(`${el.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} ${Math.round(w)}×${Math.round(h)} "${(el.textContent ?? "").trim().slice(0, 24)}"`);
    }
  }
  return out;
}

if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
const rows = [];
for (const [width, height, kind] of VIEWPORTS) {
  const touch = kind !== "desktop";
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: touch ? 3 : 2,
    isMobile: kind === "phone",
    hasTouch: touch,
    ...(kind === "phone" ? { userAgent: PHONE_UA } : {}),
  });
  const page = await context.newPage();
  const console_ = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));
  await page.goto(`${url}/${tier ? `?tier=${tier}` : ""}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const problems = [];
  let fit = null;
  for (const stop of STOPS) {
    await page.evaluate((s) => window.scrollTo(0, Math.round((document.scrollingElement.scrollHeight - window.innerHeight) * s)), stop);
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth, y: window.scrollY }));
    if (r.sw !== r.cw) problems.push(`stop ${stop}: scrollWidth ${r.sw} ≠ clientWidth ${r.cw}`);
    const wide = await page.evaluate(findWide);
    for (const w of wide) problems.push(`stop ${stop}: ${w}`);
    if (stop === 0 && `${width}x${height}` === HERO_FIT_VIEWPORT) {
      fit = await page.evaluate(`(${heroFit})(${HERO_LINE_MAX})`);
      for (const p of fit.problems) problems.push(`hero fit: ${p}`);
    }
    if (stop === 0 && kind === "phone") {
      const small = await page.evaluate(`(${tapTargets})(${TAP_MIN})`);
      for (const s of small) problems.push(`tap target: ${s}`);
    }
    if (stop === 0 && shots) await page.screenshot({ path: path.join(shots, `${width}x${height}${tier ? `-${tier}` : ""}.png`) });
  }
  for (const c of console_) problems.push(`console: ${c}`);
  const label = `${width}×${height}${tier ? ` ${tier}` : ""}`.padEnd(16);
  if (problems.length) {
    failures++;
    console.log(`FAIL ${label} ${problems.length} problem(s)`);
    for (const p of problems) console.log(`       ${p}`);
  } else {
    console.log(`ok   ${label}${fit ? ` (h1 lines ${fit.lines.join("/")} px, last CTA bottom ${fit.ctaBottom} px)` : ""}`);
  }
  rows.push({ label, problems: problems.length });
  await context.close();
}
await browser.close();
console.log(failures ? `\nFAILED: ${failures} of ${rows.length} runs` : `\nall ${rows.length} runs clean`);
process.exit(failures ? 1 : 0);
