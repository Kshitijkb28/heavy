import { describe, expect, it, vi } from "vitest";
import content from "@content";
import { serializeContent, type Content } from "@/data/schema";
import { CONTENT_PATH, GitHubError, bytesToBase64, createGitHub, decodeBase64Utf8, repoFromEnv } from "./github";

const REPO = { owner: "kb", repo: "heavy", branch: "main" };
const API = "https://api.github.com/repos/kb/heavy";

type Handler = (body: unknown) => { status: number; json?: unknown };

/** A scripted api.github.com: routes "METHOD path" to handlers (each a queue, or one handler), records every call. */
function fakeGitHub(routes: Record<string, Handler | Handler[]>) {
  const calls: { method: string; url: string; body: unknown; auth: string | null }[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body, auth: new Headers(init.headers).get("authorization") });
    const key = `${method} ${url.replace(API, "")}`;
    const route = routes[key];
    const handler = Array.isArray(route) ? route.shift() : route;
    if (!handler) return new Response(JSON.stringify({ message: `no route ${key}` }), { status: 599 });
    const { status, json } = handler(body);
    return new Response(json === undefined ? null : JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  };
  return { calls, fetchImpl: fetchImpl as typeof fetch };
}

const b64 = (s: string) => bytesToBase64(new TextEncoder().encode(s));
const fileAt = (c: Content, sha: string) => ({ status: 200, json: { sha, encoding: "base64", content: b64(serializeContent(c)).replace(/(.{60})/g, "$1\n") } });
const ok = (json: unknown) => () => ({ status: 200, json });
const created = (json: unknown) => () => ({ status: 201, json });

describe("base64", () => {
  it("round-trips UTF-8 (the résumé's accents) and binary", () => {
    expect(decodeBase64Utf8(b64("Résumé — ✓"))).toBe("Résumé — ✓");
    expect(bytesToBase64(new Uint8Array([0, 255, 37, 80, 68, 70]))).toBe("AP8lUERG");
  });
});

describe("repoFromEnv", () => {
  it("reads owner/repo and the branch, with this repository as the default", () => {
    expect(repoFromEnv({})).toEqual({ owner: "Kshitijkb28", repo: "heavy", branch: "main" });
    expect(repoFromEnv({ NEXT_PUBLIC_CONTENT_REPO: "someone/site", NEXT_PUBLIC_CONTENT_BRANCH: "content" })).toEqual({ owner: "someone", repo: "site", branch: "content" });
  });
});

describe("loadContent", () => {
  it("reads content.json at the branch head and decodes it as UTF-8", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c1" } }),
      [`GET /contents/${CONTENT_PATH}?ref=c1`]: () => fileAt(content, "f1"),
    });
    const gh = createGitHub("tok", REPO, fetchImpl);
    const loaded = await gh.loadContent();
    expect(loaded).toEqual({ content, commitSha: "c1", fileSha: "f1" });
    expect(calls[0].auth).toBe("Bearer tok");
  });

  it("names a bad token, a missing repo and a broken file", async () => {
    const auth = createGitHub("x", REPO, fakeGitHub({ "GET /git/ref/heads/main": () => ({ status: 401, json: { message: "Bad credentials" } }) }).fetchImpl);
    await expect(auth.loadContent()).rejects.toMatchObject({ kind: "auth" });
    const missing = createGitHub("x", REPO, fakeGitHub({ "GET /git/ref/heads/main": () => ({ status: 404, json: {} }) }).fetchImpl);
    await expect(missing.loadContent()).rejects.toMatchObject({ kind: "not-found" });
    const broken = createGitHub(
      "x",
      REPO,
      fakeGitHub({
        "GET /git/ref/heads/main": ok({ object: { sha: "c1" } }),
        [`GET /contents/${CONTENT_PATH}?ref=c1`]: ok({ sha: "f1", encoding: "base64", content: b64("{ not json") }),
      }).fetchImpl,
    );
    await expect(broken.loadContent()).rejects.toMatchObject({ kind: "invalid" });
  });
});

describe("publish", () => {
  const draft = { ...structuredClone(content), site: { ...content.site, year: 2027 } };
  const base = { commitSha: "c1", fileSha: "f1" };

  it("commits the content (and a new résumé) in one commit on top of the base, then moves the branch", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c1" } }),
      "POST /git/blobs": [created({ sha: "b-json" }), created({ sha: "b-pdf" })],
      "GET /git/commits/c1": ok({ tree: { sha: "t1" } }),
      "POST /git/trees": created({ sha: "t2" }),
      "POST /git/commits": created({ sha: "c2" }),
      "PATCH /git/refs/heads/main": ok({ object: { sha: "c2" } }),
    });
    const gh = createGitHub("tok", REPO, fetchImpl);
    const result = await gh.publish({ base, draft, message: "content: Edited site settings", resume: { path: "public/Kshitij-Bhardwaj-Resume.pdf", base64: "JVBERi0=" } });
    expect(result).toEqual({ commitSha: "c2", fileSha: "b-json", rebased: false });
    expect(calls.map((c) => `${c.method} ${c.url.replace(API, "")}`)).toEqual([
      "GET /git/ref/heads/main",
      "POST /git/blobs",
      "POST /git/blobs",
      "GET /git/commits/c1",
      "POST /git/trees",
      "POST /git/commits",
      "PATCH /git/refs/heads/main",
    ]);
    expect(calls[1].body).toEqual({ content: serializeContent(draft), encoding: "utf-8" });
    expect(calls[2].body).toEqual({ content: "JVBERi0=", encoding: "base64" });
    expect(calls[4].body).toEqual({
      base_tree: "t1",
      tree: [
        { path: CONTENT_PATH, mode: "100644", type: "blob", sha: "b-json" },
        { path: "public/Kshitij-Bhardwaj-Resume.pdf", mode: "100644", type: "blob", sha: "b-pdf" },
      ],
    });
    expect(calls[5].body).toEqual({ message: "content: Edited site settings", tree: "t2", parents: ["c1"] });
    expect(calls[6].body).toEqual({ sha: "c2", force: false });
  });

  it("writes content.json in canonical key order whatever order the draft's keys are in", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c1" } }),
      "POST /git/blobs": created({ sha: "b-json" }),
      "GET /git/commits/c1": ok({ tree: { sha: "t1" } }),
      "POST /git/trees": created({ sha: "t2" }),
      "POST /git/commits": created({ sha: "c2" }),
      "PATCH /git/refs/heads/main": ok({}),
    });
    const { name, ...rest } = draft.projects[0];
    const shuffled = { ...draft, projects: [{ ...rest, name }, ...draft.projects.slice(1)] } as Content;
    await createGitHub("tok", REPO, fetchImpl).publish({ base, draft: shuffled, message: "m" });
    expect(calls[1].body).toEqual({ content: serializeContent(draft), encoding: "utf-8" });
  });

  it("builds on a newer head when only code changed there", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c9" } }),
      [`GET /contents/${CONTENT_PATH}?ref=c9`]: () => fileAt(content, "f1"),
      "POST /git/blobs": created({ sha: "b-json" }),
      "GET /git/commits/c9": ok({ tree: { sha: "t9" } }),
      "POST /git/trees": created({ sha: "t10" }),
      "POST /git/commits": created({ sha: "c10" }),
      "PATCH /git/refs/heads/main": ok({}),
    });
    const result = await createGitHub("tok", REPO, fetchImpl).publish({ base, draft, message: "m" });
    expect(result).toEqual({ commitSha: "c10", fileSha: "b-json", rebased: true });
    expect(calls.find((c) => c.url.endsWith("/git/commits"))?.body).toMatchObject({ parents: ["c9"] });
  });

  it("stops with a conflict, writing nothing, when content.json changed elsewhere", async () => {
    const { fetchImpl, calls } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c9" } }),
      [`GET /contents/${CONTENT_PATH}?ref=c9`]: () => fileAt(draft, "f9"),
    });
    await expect(createGitHub("tok", REPO, fetchImpl).publish({ base, draft, message: "m" })).rejects.toMatchObject({ kind: "conflict" });
    expect(calls.some((c) => c.method !== "GET")).toBe(false);
  });

  it("retries once from the new head when the branch moves while committing", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /git/ref/heads/main": [ok({ object: { sha: "c1" } }), ok({ object: { sha: "c5" } })],
      [`GET /contents/${CONTENT_PATH}?ref=c5`]: () => fileAt(content, "f1"),
      "POST /git/blobs": [created({ sha: "b1" }), created({ sha: "b2" })],
      "GET /git/commits/c1": ok({ tree: { sha: "t1" } }),
      "GET /git/commits/c5": ok({ tree: { sha: "t5" } }),
      "POST /git/trees": [created({ sha: "t2" }), created({ sha: "t6" })],
      "POST /git/commits": [created({ sha: "c2" }), created({ sha: "c6" })],
      "PATCH /git/refs/heads/main": [() => ({ status: 422, json: { message: "Update is not a fast forward" } }), ok({})],
    });
    expect(await createGitHub("tok", REPO, fetchImpl).publish({ base, draft, message: "m" })).toEqual({ commitSha: "c6", fileSha: "b2", rebased: true });
  });

  it("explains a token that can read but not write", async () => {
    const { fetchImpl } = fakeGitHub({
      "GET /git/ref/heads/main": ok({ object: { sha: "c1" } }),
      "POST /git/blobs": () => ({ status: 403, json: { message: "Resource not accessible by personal access token" } }),
    });
    const error = await createGitHub("tok", REPO, fetchImpl)
      .publish({ base, draft, message: "m" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubError);
    expect(error).toMatchObject({ kind: "forbidden" });
    expect((error as Error).message).toMatch(/Contents/);
  });
});

describe("a GitHub that does not answer", () => {
  it("gives up after the timeout with a network error instead of waiting for ever", async () => {
    vi.useFakeTimers();
    try {
      const hang = ((_: RequestInfo | URL, init: RequestInit = {}) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
      const pending = createGitHub("tok", REPO, hang).loadContent();
      const settled = expect(pending).rejects.toMatchObject({ kind: "network" });
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runStatus", () => {
  it("follows the deploy run for a commit, and is unknown without Actions access", async () => {
    const run = (status: string, conclusion: string | null) =>
      createGitHub("tok", REPO, fakeGitHub({ "GET /actions/runs?head_sha=c2&per_page=5": ok({ workflow_runs: [{ status, conclusion, html_url: "https://github.com/kb/heavy/actions/runs/1" }] }) }).fetchImpl).runStatus("c2");
    expect(await run("queued", null)).toEqual({ state: "building", url: "https://github.com/kb/heavy/actions/runs/1" });
    expect(await run("completed", "success")).toEqual({ state: "live", url: "https://github.com/kb/heavy/actions/runs/1" });
    expect(await run("completed", "failure")).toEqual({ state: "failed", url: "https://github.com/kb/heavy/actions/runs/1" });
    const none = createGitHub("tok", REPO, fakeGitHub({ "GET /actions/runs?head_sha=c2&per_page=5": ok({ workflow_runs: [] }) }).fetchImpl);
    expect(await none.runStatus("c2")).toEqual({ state: "waiting" });
    const denied = createGitHub("tok", REPO, fakeGitHub({ "GET /actions/runs?head_sha=c2&per_page=5": () => ({ status: 403, json: {} }) }).fetchImpl);
    expect(await denied.runStatus("c2")).toEqual({ state: "unknown" });
  });
});
