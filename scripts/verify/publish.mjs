#!/usr/bin/env node
/**
 * publish.mjs — the editor's GitHub flow against a scripted api.github.com (Playwright intercepts every request, so
 * nothing reaches GitHub), on a phone and a desktop, in a normal build (no demo flag):
 *   - a visitor gets no Edit button, `?edit=demo` does nothing, and the editor chunk is never fetched
 *   - `?edit` asks for a token; a rejected token shows GitHub's reason; a good one loads content.json from the branch head
 *   - after an edit, Publish lists the change and writes one commit: blobs → tree → commit → ref (force: false), with
 *     the draft serialized as content.json; the edit bar then follows the run to "Live ✓"
 *   - the token is kept for this tab only (sessionStorage), which then shows "Edit" in the top bar; Sign out removes it
 *
 * Usage: node scripts/verify/publish.mjs [url] [--viewports=390x844,1440x900]
 */
import { readFileSync } from "node:fs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const url = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3200").replace(/\/$/, "");
const onlyViewports = args.find((a) => a.startsWith("--viewports="))?.slice("--viewports=".length).split(",");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const VIEWPORTS = [
  [390, 844, "phone"],
  [1440, 900, "desktop"],
].filter(([w, h]) => !onlyViewports || onlyViewports.includes(`${w}x${h}`));
const REPO = "/repos/Kshitijkb28/heavy";
const contentText = readFileSync("src/data/content.json", "utf8");
const b64 = (s) => Buffer.from(s, "utf8").toString("base64");

/** A scripted GitHub: answers by method + path, remembers every call and the content of each blob written. */
function mockGitHub(page) {
  const calls = [];
  const blobs = [];
  let runChecks = 0;
  return {
    calls,
    blobs,
    install: () =>
      page.route("https://api.github.com/**", async (route) => {
        const req = route.request();
        const u = new URL(req.url());
        const key = `${req.method()} ${u.pathname.replace(REPO, "")}${u.search}`;
        const body = req.postData() ? JSON.parse(req.postData()) : undefined;
        calls.push({ key, body, auth: req.headers()["authorization"] });
        const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data), headers: { "access-control-allow-origin": "*" } });
        if (req.headers()["authorization"] === "Bearer bad-token") return json(401, { message: "Bad credentials" });
        if (key === "GET /git/ref/heads/main") return json(200, { object: { sha: "c1" } });
        if (key === "GET /contents/src/data/content.json?ref=c1") return json(200, { sha: "f1", encoding: "base64", content: b64(contentText) });
        if (key === "POST /git/blobs") {
          blobs.push(body);
          return json(201, { sha: `b${blobs.length}` });
        }
        if (key === "GET /git/commits/c1") return json(200, { tree: { sha: "t1" } });
        if (key === "POST /git/trees") return json(201, { sha: "t2" });
        if (key === "POST /git/commits") return json(201, { sha: "c2" });
        if (key === "PATCH /git/refs/heads/main") return json(200, { object: { sha: "c2" } });
        if (key.startsWith("GET /actions/runs?head_sha=c2")) {
          runChecks++;
          return json(200, { workflow_runs: [{ status: runChecks > 1 ? "completed" : "in_progress", conclusion: runChecks > 1 ? "success" : null, html_url: "https://github.com/Kshitijkb28/heavy/actions/runs/1" }] });
        }
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
        return json(404, { message: `unscripted ${key}` });
      }),
  };
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--hide-scrollbars"] });
let failures = 0;
try {
  for (const [width, height, kind] of VIEWPORTS) {
    const phone = kind === "phone";
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(phone ? { isMobile: true, hasTouch: true, userAgent: PHONE_UA } : {}) });
    const page = await context.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      // the rejected-token step logs the 401 the browser saw; anything else is a problem
      if ((m.type() === "error" || m.type() === "warning") && !/401|Unauthorized/.test(m.text())) problems.push(`console ${m.type()}: ${m.text().slice(0, 160)}`);
    });
    const gh = mockGitHub(page);
    await gh.install();
    const scripts = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));

    // a visitor: no Edit, no editor chunk, `?edit=demo` ignored in a normal build
    await page.goto(`${url}/?edit=demo&tier=low`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const visitor = await page.evaluate(() => ({
      edit: !!document.querySelector('[aria-label="Edit this site"]'),
      bar: !!document.querySelector('[role="region"][aria-label="Editor"]'),
      editing: document.documentElement.hasAttribute("data-editing"),
    }));
    if (visitor.edit || visitor.bar || visitor.editing) problems.push(`visitor sees the editor ${JSON.stringify(visitor)}`);
    const editorChunks = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.js/.test(n)));
    // nothing a visitor downloads carries the validator (its messages) or the GitHub client
    const leaked = await page.evaluate(async (urls) => {
      const out = [];
      for (const u of urls) {
        const text = await fetch(u).then((r) => r.text());
        if (/must be a whole number|not a time zone|api\.github\.com/.test(text)) out.push(u.split("/").pop());
      }
      return out;
    }, editorChunks);
    if (leaked.length) problems.push(`visitor chunks carry editor code: ${leaked.join(", ")}`);
    const before = new Set(editorChunks);

    // the owner: ?edit → sign in
    await page.goto(`${url}/?edit&tier=low`, { waitUntil: "networkidle" });
    await page.waitForSelector("#editor-token", { timeout: 15000 });
    const afterEdit = await page.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /\.js/.test(n)));
    if (!afterEdit.some((n) => !before.has(n))) problems.push("opening edit mode fetched no extra chunk (is the editor in the visitor bundle?)");
    await page.fill("#editor-token", "bad-token");
    await page.click('button:has-text("Sign in")');
    await page.waitForSelector("#editor-token-msg", { timeout: 5000 });
    await page.waitForTimeout(400);
    const rejected = await page.textContent("#editor-token-msg");
    if (!/did not accept the token/.test(rejected ?? "")) problems.push(`bad token message: "${rejected}"`);
    await page.fill("#editor-token", "good-token");
    await page.click('button:has-text("Sign in")');
    await page.waitForSelector('[role="region"][aria-label="Editor"]', { timeout: 10000 });
    const stored = await page.evaluate(() => ({ session: sessionStorage.getItem("heavy:gh-token"), local: localStorage.getItem("heavy:gh-token") }));
    if (stored.session !== "good-token" || stored.local !== null) problems.push(`token kept as ${JSON.stringify(stored)} (expected this tab only)`);

    // edit: the © year in Site settings, then publish
    await page.click('[aria-label="Site settings"]');
    await page.waitForSelector("#editor-panel", { state: "visible" });
    const year = page.locator('#editor-panel input[type="number"]');
    await year.fill("2027");
    await page.click("#editor-panel [data-close]");
    await page.click('[aria-label="Publish"]');
    await page.waitForSelector('dialog[aria-labelledby="editor-publish-title"]', { timeout: 5000 });
    const listed = await page.textContent('dialog[aria-labelledby="editor-publish-title"] ul');
    if (!/Edited site settings/.test(listed ?? "")) problems.push(`publish dialog lists "${listed}"`);
    await page.click('dialog[aria-labelledby="editor-publish-title"] button:has-text("Publish")');
    await page.waitForFunction(() => /Live ✓/.test(document.querySelector('[role="region"][aria-label="Editor"] [role="status"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => problems.push("the edit bar never showed Live ✓"));
    if (!(await page.locator('[role="region"][aria-label="Editor"] button:has-text("Reload")').count())) problems.push("no Reload beside Live ✓");
    // the next edit brings the counts back
    await page.click('[aria-label="Site settings"]');
    await page.waitForSelector("#editor-panel", { state: "visible" });
    await page.locator('#editor-panel input[type="number"]').fill("2028");
    await page.click("#editor-panel [data-close]");
    const line = await page.textContent('[role="region"][aria-label="Editor"] [role="status"]');
    if (!/^1 change$/.test(line?.trim() ?? "")) problems.push(`after a further edit the bar says "${line}"`);

    const writes = gh.calls.filter((c) => !c.key.startsWith("GET")).map((c) => c.key);
    if (writes.join(" | ") !== "POST /git/blobs | POST /git/trees | POST /git/commits | PATCH /git/refs/heads/main") problems.push(`writes: ${writes.join(" | ")}`);
    const published = gh.blobs[0]?.content ? JSON.parse(gh.blobs[0].content) : null;
    if (published?.site?.year !== 2027) problems.push(`committed content.json year ${published?.site?.year}`);
    if (gh.blobs[0]?.content !== `${JSON.stringify({ ...JSON.parse(contentText), site: { ...JSON.parse(contentText).site, year: 2027 } }, null, 2)}\n`) problems.push("committed content.json is not canonical (key order / indent / newline)");
    const ref = gh.calls.find((c) => c.key === "PATCH /git/refs/heads/main");
    if (ref?.body?.force !== false) problems.push(`ref update force=${ref?.body?.force}`);
    const commit = gh.calls.find((c) => c.key === "POST /git/commits");
    if (commit?.body?.message !== "content: Edited site settings") problems.push(`commit message "${commit?.body?.message}"`);
    if (gh.calls.some((c) => c.auth !== "Bearer good-token" && c.auth !== "Bearer bad-token")) problems.push("a GitHub call went without the token");

    // a signed-in browser shows Edit; Sign out removes the token
    await page.goto(`${url}/?tier=low`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    if (!(await page.locator('[aria-label="Edit this site"]').count())) problems.push("no Edit button for the signed-in browser");
    await page.click('[aria-label="Edit this site"]');
    await page.waitForSelector('[role="region"][aria-label="Editor"]', { timeout: 10000 });
    await page.click('[aria-label="Sign out of editing on this device"]');
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    if (await page.evaluate(() => sessionStorage.getItem("heavy:gh-token") ?? localStorage.getItem("heavy:gh-token"))) problems.push("Sign out kept the token");
    if (await page.locator('[aria-label="Edit this site"]').count()) problems.push("Edit still shown after Sign out");

    await context.close();
    const label = `${width}×${height}`;
    if (problems.length) {
      failures++;
      console.log(`FAIL ${label.padEnd(10)} ${problems.length} problem(s)`);
      for (const p of problems) console.log(`       ${p}`);
    } else console.log(`ok   ${label}`);
  }
} finally {
  await browser.close();
}
console.log(failures ? `\nFAILED: ${failures} of ${VIEWPORTS.length} runs` : `\nall ${VIEWPORTS.length} runs clean`);
process.exit(failures ? 1 : 0);
