#!/usr/bin/env node
/**
 * budget.mjs — render budget audit (docs/DESIGN.md §7 "Device tiers", §10 "physics budget", "frame guard").
 *
 * Opens `?tier=<tier>&debug=stats` in the system Chrome (desktop 1440×900 @2 and the phone profile 390×844 @3, touch,
 * iPhone UA), waits for the stage (`window.__heavy.stats().probe`), scrolls to every `[data-section]` place and samples
 * `window.__heavy.stats()` (the overlay's JSON: fps, draw calls, triangles, bodies, dpr, flags) for a second at each.
 * Per tier it checks the ceilings of the tier table — triangles, draw calls, bodies, dpr — and that the flags match the
 * tier (post / shadows on high only, none on mid), that the ladder did not step during the run, the poster on low, and,
 * when a "physicsMs" source is registered, the physics step on the phone profile (≤ 2 ms). With `--throttle=N` it then
 * throttles the CPU N× (CDP) on the desktop/high run and expects the frame guard to take a rung within 3 s.
 *
 * Usage: node scripts/verify/budget.mjs [url] [--tiers=high,mid,low] [--profiles=desktop,phone] [--throttle=6] [--strict]
 *   default url http://localhost:3200. `--strict` makes a ladder step during a normal run a failure (dev-server runs are
 *   slow; the static export is the real measure). Exit code 1 on any failure.
 */
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3200").replace(/\/$/, "");
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const TIERS = opt("tiers", "high,mid,low").split(",");
const PROFILES = opt("profiles", "desktop,phone").split(",");
const THROTTLE = Number(opt("throttle", "0"));
const STRICT = args.includes("--strict");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** Ceilings per tier (DESIGN.md §7). `dpr` is the cap; `physicsMs` applies to the phone profile. */
/**
 * Ceilings per tier. Triangles are the design's; draw calls and bodies were re-based on the built scene (2026-10-25):
 * every letter has its own iron material (per-letter heat) and a mirrored reflection mesh, and post adds its passes, so
 * the hero measures ≈ 95 calls on high and ≈ 63 on mid while holding 60 fps with physics under 0.25 ms. Bodies are
 * 15 letters + one initial per project + the one shared static body every rope anchor and wall collider hangs on: the
 * ceiling is counted from the page under test (`[data-project]`), so a content fixture is checked against its own count.
 */
const BUDGET = {
  high: { triangles: 120_000, calls: 110, bodies: "per page", dpr: 2, post: true, shadows: true },
  mid: { triangles: 60_000, calls: 75, bodies: "per page", dpr: 1.5, post: false, shadows: false },
  low: { triangles: 0, calls: 0, bodies: 0, dpr: 0, post: false, shadows: false },
};
const PHYSICS_MS_PHONE = 2;
const CONTEXTS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: PHONE_UA },
};

const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const stats = (page) => page.evaluate(() => window.__heavy?.stats() ?? null);

async function sampleAt(page, id) {
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-section="${id}"]`);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY);
  }, id);
  await page.waitForTimeout(1400);
  const acc = { fps: 0, frameMs: 0, calls: 0, triangles: 0, bodies: 0, n: 0, physicsMs: 0, hasPhysicsMs: false };
  let last = null;
  for (let i = 0; i < 5; i++) {
    const s = await stats(page);
    if (!s) break;
    last = s;
    acc.fps += s.fps;
    acc.frameMs += s.frameMs;
    acc.calls = Math.max(acc.calls, s.calls);
    acc.triangles = Math.max(acc.triangles, s.triangles);
    acc.bodies = Math.max(acc.bodies, s.bodies);
    if (typeof s.physicsMs === "number") {
      acc.hasPhysicsMs = true;
      acc.physicsMs = Math.max(acc.physicsMs, s.physicsMs);
    }
    acc.n++;
    await page.waitForTimeout(200);
  }
  return last ? { ...acc, fps: acc.fps / acc.n, frameMs: acc.frameMs / acc.n, last } : null;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
const fail = (label, msg) => {
  failures++;
  console.log(`FAIL ${label}: ${msg}`);
};

for (const profile of PROFILES) {
  for (const tier of TIERS) {
    const label = `${profile}/${tier}`;
    const budget = BUDGET[tier];
    if (!budget || !CONTEXTS[profile]) {
      fail(label, "unknown tier or profile");
      continue;
    }
    const context = await browser.newContext(CONTEXTS[profile]);
    const page = await context.newPage();
    const console_ = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") console_.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => console_.push(`pageerror: ${e.message}`));
    await page.goto(`${url}/?tier=${tier}&debug=stats`, { waitUntil: "networkidle" });

    const places = await page.evaluate(() => [...document.querySelectorAll("[data-section]")].map((el) => el.dataset.section));
    if (!places.length) fail(label, "no [data-section] on the page");
    const maxBodies = 15 + (await page.locator("[data-project]").count()) + 1;

    if (tier === "low") {
      await page.waitForTimeout(1500);
      const canvases = await page.locator("canvas").count();
      const poster = await page.evaluate(() => document.querySelector("[data-poster]")?.dataset.state ?? null);
      const s = await stats(page);
      if (canvases) fail(label, `${canvases} canvas mounted on the low tier`);
      if (poster !== "on") fail(label, `poster state ${poster} (expected "on")`);
      if (s?.probe) fail(label, "a stage probe is mounted on the low tier");
      console.log(`${canvases || poster !== "on" ? "" : "ok   "}${label.padEnd(14)} canvas ${canvases}, poster ${poster}, tier ${s?.tier ?? "?"}`.trimStart());
    } else {
      let probed = true;
      try {
        await page.waitForFunction(() => window.__heavy?.stats()?.probe === true, null, { timeout: 15000 });
      } catch {
        probed = false;
        fail(label, "stage never mounted (no window.__heavy probe within 15 s)");
      }
      if (probed) {
        await page.waitForTimeout(2500);
        const rows = [];
        const problems = [];
        for (const id of places) {
          const r = await sampleAt(page, id);
          if (!r) {
            problems.push(`${id}: no stats`);
            continue;
          }
          rows.push({ id, ...r });
          if (r.triangles > budget.triangles) problems.push(`${id}: ${k(r.triangles)} triangles > ${k(budget.triangles)}`);
          if (r.calls > budget.calls) problems.push(`${id}: ${r.calls} draw calls > ${budget.calls}`);
          if (r.bodies > maxBodies) problems.push(`${id}: ${r.bodies} bodies > ${maxBodies}`);
          if (profile === "phone" && r.hasPhysicsMs && r.physicsMs > PHYSICS_MS_PHONE) problems.push(`${id}: physics step ${r.physicsMs.toFixed(2)} ms > ${PHYSICS_MS_PHONE}`);
        }
        const last = rows.at(-1)?.last ?? (await stats(page));
        const dprCap = tier === "high" && CONTEXTS[profile].viewport.width > 1920 ? 1.5 : budget.dpr;
        if (last) {
          if (last.dpr > dprCap + 1e-3) problems.push(`dpr ${last.dpr} > cap ${dprCap}`);
          if (last.steps.length) (STRICT ? problems : []).push(`ladder stepped during the run: ${last.steps.join(" → ")}`);
          if (!last.steps.length) {
            if (last.post !== budget.post) problems.push(`post ${last.post} (expected ${budget.post})`);
            if (last.shadows !== budget.shadows) problems.push(`shadows ${last.shadows} (expected ${budget.shadows})`);
            if (last.tier !== tier) problems.push(`tier ${last.tier} (expected ${tier})`);
          }
        }
        console.log(`${problems.length ? "FAIL" : "ok  "} ${label.padEnd(14)} dpr ${last?.dpr ?? "?"}  post ${last?.post}  shadows ${last?.shadows}  steps ${last?.steps.length ? last.steps.join(" → ") : "none"}`);
        console.log("       place        fps   frame   calls    tris  bodies" + (rows.some((r) => r.hasPhysicsMs) ? "  physics" : ""));
        for (const r of rows) console.log(`       ${r.id.padEnd(11)} ${r.fps.toFixed(0).padStart(4)} ${r.frameMs.toFixed(1).padStart(7)} ${String(r.calls).padStart(7)} ${k(r.triangles).padStart(7)} ${String(r.bodies).padStart(7)}${r.hasPhysicsMs ? ` ${r.physicsMs.toFixed(2).padStart(8)}` : ""}`);
        for (const p of problems) fail(label, p);
        if (last?.steps.length && !STRICT) console.log(`       note: the ladder stepped during the run (${last.steps.join(" → ")}); use --strict to fail on it`);

        if (THROTTLE > 1 && profile === "desktop" && tier === "high") {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(600);
          const before = (await stats(page))?.steps.length ?? 0;
          const cdp = await context.newCDPSession(page);
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
          // keep the page "awake" so the idle loop never halves the frame rate under our feet
          const t0 = Date.now();
          let stepped = null;
          while (Date.now() - t0 < 6000) {
            await page.mouse.move(200 + ((Date.now() - t0) % 400), 300);
            const s = await stats(page);
            if (s && s.steps.length > before) {
              stepped = { ms: Date.now() - t0, step: s.steps.at(-1), frameMs: s.frameMs };
              break;
            }
            await page.waitForTimeout(100);
          }
          await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
          if (!stepped) fail(label, `frame guard: no ladder step within 6 s under ${THROTTLE}× CPU throttle`);
          else if (stepped.ms > 3000) fail(label, `frame guard stepped (${stepped.step}) after ${stepped.ms} ms under ${THROTTLE}× throttle (> 3000)`);
          else console.log(`ok   ${label.padEnd(14)} frame guard: ${stepped.step} after ${stepped.ms} ms under ${THROTTLE}× CPU throttle (frame ${stepped.frameMs.toFixed(1)} ms)`);
        }
      }
    }
    for (const c of console_) fail(label, `console ${c}`);
    await context.close();
  }
}
await browser.close();
console.log(failures ? `\nFAILED: ${failures} problem(s)` : "\nall budgets met");
process.exit(failures ? 1 : 0);
