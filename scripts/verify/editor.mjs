#!/usr/bin/env node
/**
 * editor.mjs — the in-page editor in demo mode (`?edit=demo`, a build with NEXT_PUBLIC_EDITOR_DEMO=1), on phones,
 * a tablet and desktops, in the system Chrome like the other verify scripts:
 *   - the edit bar replaces the top bar; every section has its Edit button; no reveal hold stays hidden
 *   - every panel opens with nothing wider than the viewport and every visible control ≥ 44 × 44 px
 *   - adding a role shows at once: the new card first, numbered 01, the annotation and the Companies stat recounted
 *   - the scroll map follows the taller page: the projects section still lands on t = 3 exactly
 *   - the draft survives a reload (the restore banner), Discard returns to the published content
 *   - no console errors or warnings
 *
 * Usage: node scripts/verify/editor.mjs [url] [--viewports=390x844,1440x900] [--shots=dir]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3200").replace(/\/$/, "");
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const onlyViewports = args.find((a) => a.startsWith("--viewports="))?.slice("--viewports=".length).split(",");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_ARGS = ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"];
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const VIEWPORTS = [
  [320, 568, "phone"],
  [390, 844, "phone"],
  [768, 1024, "tablet"],
  [1440, 900, "desktop"],
].filter(([w, h]) => !onlyViewports || onlyViewports.includes(`${w}x${h}`));
const PANELS = ["hero", "about", "experience", "projects", "stack", "education", "contact"];
const TAP_MIN = 44;
if (shots) mkdirSync(shots, { recursive: true });

/** Runs in the page: horizontal overflow, and visible controls in `root` smaller than 44 × 44. */
function audit({ TAP_MIN, rootSelector }) {
  const problems = [];
  const vw = window.innerWidth;
  if (document.scrollingElement.scrollWidth > document.documentElement.clientWidth + 1) problems.push(`page scrolls sideways (${document.scrollingElement.scrollWidth} > ${vw})`);
  const root = document.querySelector(rootSelector);
  if (!root) return [...problems, `no ${rootSelector}`];
  const r = root.getBoundingClientRect();
  if (r.left < -0.5 || r.right > vw + 0.5) problems.push(`${rootSelector} spans ${Math.round(r.left)}…${Math.round(r.right)} of ${vw}`);
  for (const el of root.querySelectorAll("button, input, textarea, select, a[href]")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
    if (b.right > vw + 0.5 || b.left < -0.5) problems.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" crosses the edge`);
    const small = el.type === "checkbox" ? false : b.width < TAP_MIN - 0.5 || b.height < TAP_MIN - 0.5;
    const tag = el.tagName.toLowerCase();
    if (small) problems.push(`${tag} "${(el.getAttribute("aria-label") || el.textContent || el.placeholder || "").trim().slice(0, 30)}" is ${Math.round(b.width)}×${Math.round(b.height)}`);
  }
  return problems;
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: CHROME_ARGS });
let failures = 0;
try {
  for (const [width, height, kind] of VIEWPORTS) {
    const phone = kind === "phone";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: phone ? 2 : 1, ...(phone ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}) });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && problems.push(`console ${m.type()}: ${m.text().slice(0, 160)}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    const label = `${width}×${height}`;

    await page.goto(`${url}/?edit=demo&tier=${phone ? "mid" : "high"}&debug=stats`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: '[data-debug="stats"] { display: none !important; }' });
    await page.waitForSelector('[role="region"][aria-label="Editor"]', { timeout: 15000 });
    await page.waitForTimeout(600);

    const entry = await page.evaluate(() => ({
      topbar: getComputedStyle(document.querySelector("[data-topbar]")).display,
      editing: document.documentElement.hasAttribute("data-editing"),
      buttons: [...document.querySelectorAll("[data-edit-panel]")].map((b) => b.dataset.editPanel),
      hidden: [...document.querySelectorAll("main .hold, main [data-reveal]")].filter((el) => getComputedStyle(el).opacity === "0").length,
    }));
    if (entry.topbar !== "none") problems.push(`top bar still shown (${entry.topbar})`);
    if (!entry.editing) problems.push("html[data-editing] missing");
    if (entry.buttons.join() !== PANELS.join()) problems.push(`edit buttons ${entry.buttons.join()} (expected ${PANELS.join()})`);
    if (entry.hidden) problems.push(`${entry.hidden} reveal holds hidden in the preview`);
    for (const p of await page.evaluate(audit, { TAP_MIN, rootSelector: '[role="region"][aria-label="Editor"]' })) problems.push(`edit bar: ${p}`);

    for (const panel of [...PANELS, "site"]) {
      if (panel === "site") await page.click('[aria-label="Site settings"]');
      else {
        await page.evaluate((p) => document.querySelector(`[data-edit-panel="${p}"]`).scrollIntoView({ block: "center" }), panel);
        await page.click(`[data-edit-panel="${panel}"]`);
      }
      await page.waitForSelector("#editor-panel", { state: "visible", timeout: 5000 });
      await page.waitForTimeout(250);
      for (const p of await page.evaluate(audit, { TAP_MIN, rootSelector: "#editor-panel" })) problems.push(`${panel} panel: ${p}`);
      if (shots) await page.screenshot({ path: path.join(shots, `${width}x${height}-${panel}.png`) });
      await page.click('#editor-panel [data-close]');
      await page.waitForSelector("#editor-panel", { state: "detached", timeout: 5000 });
    }

    // Site settings: focus comes back to the Site button when the panel closes
    await page.click('[aria-label="Site settings"]');
    await page.waitForSelector("#editor-panel", { state: "visible" });
    await page.click("#editor-panel [data-close]");
    await page.waitForTimeout(200);
    if ((await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) !== "Site settings") problems.push("focus did not return to the Site button");

    // keyboard: Move up twice keeps hold of the same bullet
    await page.evaluate(() => document.querySelector('[data-edit-panel="experience"]').scrollIntoView({ block: "center" }));
    await page.click('[data-edit-panel="experience"]');
    await page.waitForSelector("#editor-panel", { state: "visible" });
    const roleCard = '#editor-panel ol > li:first-child';
    const third = await page.inputValue(`${roleCard} [aria-label="Bullets"] ol > li:nth-child(3) textarea`);
    await page.focus(`${roleCard} [aria-label="Move bullet 3 up"]`);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(120);
    const firstNow = await page.inputValue(`${roleCard} [aria-label="Bullets"] ol > li:nth-child(1) textarea`);
    if (firstNow !== third) problems.push("keyboard Move up twice did not keep hold of the moved bullet");

    // holding Backspace in an empty tag field removes one chip, not all of them
    const chips = `${roleCard} button[aria-label^="Remove "]:not([aria-label^="Remove bullet"]):not([aria-label^="Remove role"])`;
    const chipCount = await page.locator(chips).count();
    await page.focus(`${roleCard} input[placeholder="Add…"]`);
    await page.keyboard.down("Backspace");
    await page.keyboard.down("Backspace");
    await page.keyboard.down("Backspace");
    await page.keyboard.up("Backspace");
    if ((await page.locator(chips).count()) !== chipCount - 1) problems.push(`held Backspace removed ${chipCount - (await page.locator(chips).count())} chips`);

    // Undo follows its entry: remove a bullet of the second role, move that role up, undo there
    const second = '#editor-panel ol > li:nth-child(2)';
    const secondCompany = await page.inputValue(`${second} input >> nth=0`);
    const secondBullets = await page.locator(`${second} [aria-label="Bullets"] ol > li textarea`).count();
    await page.click(`${second} [aria-label="Remove bullet 1"]`);
    await page.click(`${second} [aria-label="Move role 2 up"]`);
    await page.waitForTimeout(150);
    const firstCompany = await page.inputValue('#editor-panel ol > li:first-child input >> nth=0');
    if (firstCompany !== secondCompany) problems.push("Move role up did not move the role");
    const undoIn = await page.evaluate(() => [...document.querySelectorAll("#editor-panel ol > li")].findIndex((li) => li.querySelector(':scope > div [role="status"], :scope [role="status"]')));
    if (undoIn !== 0) problems.push(`the bullet's Undo shows in role ${undoIn + 1}, not with its role`);
    await page.click('#editor-panel ol > li:first-child [role="status"] button:has-text("Undo")').catch(() => problems.push("no Undo in the moved role"));
    await page.waitForTimeout(120);
    const restoredBullets = await page.locator('#editor-panel ol > li:first-child [aria-label="Bullets"] ol > li textarea').count();
    if (restoredBullets !== secondBullets) problems.push(`Undo put the bullet back in another role (${restoredBullets} vs ${secondBullets})`);

    // Undo does not survive Discard. Below 64rem the panel is a modal sheet: it closes before the bar can be used
    // (and its lists unmount), so the check is the desktop side panel's, which stays open beside the bar.
    await page.click('#editor-panel [aria-label="Remove role 2"]');
    const sheet = width < 1024;
    if (sheet) await page.click("#editor-panel [data-close]");
    if (await page.locator('[aria-label="Discard changes"]').isDisabled()) problems.push("Discard is off although a role was just removed");
    else {
      await page.click('[aria-label="Discard changes"]');
      await page.click('button:has-text("Discard")');
    }
    await page.waitForTimeout(200);
    if (!sheet) {
      if (await page.locator('#editor-panel [role="status"]:has-text("Removed")').count()) problems.push("an Undo row survived Discard");
      await page.click("#editor-panel [data-close]");
    }

    // add a role at the top and watch the page follow
    await page.evaluate(() => document.querySelector('[data-edit-panel="experience"]').scrollIntoView({ block: "center" }));
    await page.click('[data-edit-panel="experience"]');
    await page.waitForSelector("#editor-panel", { state: "visible" });
    await page.click('#editor-panel button:has-text("+ Add role")');
    await page.fill("#editor-panel ol li:first-child input >> nth=0", "Acme Labs");
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => {
      const first = document.querySelector("#experience article");
      return {
        company: first?.querySelector("h3")?.textContent?.replace("↗", "").replace("(opens in a new tab)", "").trim(),
        index: first?.querySelector("header span")?.textContent?.trim(),
        annotation: document.querySelector("#experience .section__annotation")?.textContent?.trim(),
        companies: [...document.querySelectorAll("#about li")].find((li) => /Compan/.test(li.textContent))?.textContent?.replace(/\s+/g, " ").trim(),
        status: document.querySelector('[role="region"][aria-label="Editor"] [role="status"]')?.textContent?.trim(),
      };
    });
    if (after.company !== "Acme Labs") problems.push(`new role shows "${after.company}"`);
    if (after.index !== "01") problems.push(`new role numbered ${after.index}`);
    if (!/^3 roles · 2023 — present$/.test(after.annotation ?? "")) problems.push(`annotation "${after.annotation}"`);
    if (!/^3 ?Companies ?Acme Labs · Ethara AI · Mind2web LLP$/.test(after.companies ?? "")) problems.push(`companies stat "${after.companies}"`);
    if (!/^Demo · \d+ changes? · \d+ to fix · nothing is published$/.test(after.status ?? "")) problems.push(`status "${after.status}"`);
    await page.click('#editor-panel [data-close]');

    // the journey re-measured: the projects section still lands on t = 3
    await page.evaluate(() => {
      const el = document.querySelector('[data-section="projects"]');
      const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - margin);
    });
    await page.waitForTimeout(900);
    const t = await page.evaluate(() => window.__heavy?.stats()?.t);
    if (typeof t !== "number" || Math.abs(t - 3) > 0.005) problems.push(`projects anchor at t = ${t} after the edit (expected 3)`);
    if (shots) await page.screenshot({ path: path.join(shots, `${width}x${height}-after-add.png`) });

    // the draft survives a reload; Discard returns to the published content
    await page.waitForTimeout(600);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForSelector('dialog[open][aria-label="Unpublished changes"]', { timeout: 8000 }).catch(() => problems.push("no restore dialog after a reload"));
    const modal = await page.evaluate(() => document.querySelector('dialog[open][aria-label="Unpublished changes"]')?.matches(":modal") ?? false);
    if (!modal) problems.push("the restore choice is not a modal dialog (edits around it would not be saved)");
    await page.click('dialog[aria-label="Unpublished changes"] button:has-text("Restore")').catch(() => {});
    await page.waitForTimeout(300);
    const restored = await page.evaluate(() => document.querySelector("#experience article h3")?.textContent ?? "");
    if (!restored.includes("Acme Labs")) problems.push("restore did not bring the draft back");
    await page.click('[aria-label="Discard changes"]');
    await page.click('button:has-text("Discard")');
    await page.waitForTimeout(300);
    const discarded = await page.evaluate(() => document.querySelector("#experience article h3")?.textContent ?? "");
    if (!discarded.includes("Ethara AI")) problems.push(`after Discard the first role is "${discarded.trim()}"`);

    await context.close();
    if (problems.length) {
      failures++;
      console.log(`FAIL ${label.padEnd(10)} ${problems.length} problem(s)`);
      for (const p of problems.slice(0, 40)) console.log(`       ${p}`);
    } else console.log(`ok   ${label}`);
  }
} finally {
  await browser.close();
}
console.log(failures ? `\nFAILED: ${failures} of ${VIEWPORTS.length} runs` : `\nall ${VIEWPORTS.length} runs clean`);
process.exit(failures ? 1 : 0);
