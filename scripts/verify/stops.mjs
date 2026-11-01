#!/usr/bin/env node
/**
 * stops.mjs — screenshots of the lit set pieces at their journey stops, to check the hall after the content changes
 * (DESIGN.md §10): every project card stop (`[data-project-stop]`, t = 3 + i/n: the camera frames initial i), the two
 * Experience bays (t = 2, 2.5) and the Stack tubes (t = 4), on a phone and a desktop viewport. Same system Chrome as
 * the other verify scripts (never SwiftShader). Prints the journey `t` and the active section at each shot.
 *
 * Usage: node scripts/verify/stops.mjs [url] --shots=dir [--viewports=390x844,1440x900] [--tier=high|mid]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3200").replace(/\/$/, "");
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const tier = args.find((a) => a.startsWith("--tier="))?.slice("--tier=".length);
const onlyViewports = args.find((a) => a.startsWith("--viewports="))?.slice("--viewports=".length).split(",");
if (!shots) {
  console.error("usage: stops.mjs [url] --shots=dir [--viewports=390x844,1440x900] [--tier=high|mid]");
  process.exit(2);
}
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const VIEWPORTS = [
  [390, 844, "phone"],
  [1440, 900, "desktop"],
].filter(([w, h]) => !onlyViewports || onlyViewports.includes(`${w}x${h}`));

mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
try {
  for (const [width, height, kind] of VIEWPORTS) {
    const phone = kind === "phone";
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: phone ? 2 : 1,
      ...(phone ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}),
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    const t = tier ?? (phone ? "mid" : "high");
    await page.goto(`${url}/?tier=${t}&debug=stats`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__heavy?.stats()?.probe === true, null, { timeout: 20000 });
    // the stats overlay would cover the shot; `window.__heavy` stays
    await page.addStyleTag({ content: '[data-debug="stats"] { display: none !important; }' });
    await page.waitForTimeout(2500);

    /** [label, CSS selector of the element whose top (less its scroll margin) is the stop] */
    const stops = await page.evaluate(() => {
      const out = [["bays", '[data-section="experience"]']];
      const n = document.querySelectorAll("[data-project-stop]").length;
      for (let i = 0; i < n; i++) out.push([`project-${i}`, `[data-project-stop="${i}"]`]);
      out.push(["tubes", '[data-section="stack"]']);
      return out;
    });
    for (const [label, selector] of stops) {
      await page.evaluate((sel) => {
        // as the scroll map anchors a stop: the section's scroll margin; the first card is the section itself
        const el = document.querySelector(sel);
        const section = el.closest("[data-section]") ?? el;
        const first = el.dataset.projectStop === "0";
        const margin = parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
        window.scrollTo(0, (first ? section : el).getBoundingClientRect().top + window.scrollY - margin);
      }, selector);
      await page.waitForTimeout(1600);
      const state = await page.evaluate(() => ({ t: window.__heavy?.stats()?.t, section: document.documentElement.dataset.activeSection ?? "" }));
      const file = path.join(shots, `${width}x${height}-${label}.png`);
      await page.screenshot({ path: file });
      console.log(`${width}x${height} ${label.padEnd(10)} t=${typeof state.t === "number" ? state.t.toFixed(3) : state.t} → ${path.relative(process.cwd(), file)}`);
    }
    if (errors.length) {
      failures++;
      console.log(`FAIL ${width}x${height}: ${errors.slice(0, 5).join(" | ")}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
process.exit(failures ? 1 : 0);
