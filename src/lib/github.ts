/**
 * The in-page editor's link to the repository (api.github.com, from the browser, with the owner's fine-grained token).
 * `loadContent` reads `src/data/content.json` at the branch head; `publish` writes the draft (and a replacement résumé)
 * as one commit on top of it through the Git Data API (blobs → tree → commit → move the branch, never forced), which
 * starts the Pages workflow; `runStatus` follows that run. A newer head is built on when only other files changed
 * there; a newer content.json is a conflict, reported before anything is written. `fetch` is injected: unit tested.
 */
import { parseContent, serializeContent, type Content } from "@/data/schema";

export const CONTENT_PATH = "src/data/content.json";

export interface RepoRef {
  owner: string;
  repo: string;
  branch: string;
}

/** `NEXT_PUBLIC_CONTENT_REPO` ("owner/repo", the deploy workflow passes its own) and `NEXT_PUBLIC_CONTENT_BRANCH`. */
export function repoFromEnv(env: Record<string, string | undefined> = { NEXT_PUBLIC_CONTENT_REPO: process.env.NEXT_PUBLIC_CONTENT_REPO, NEXT_PUBLIC_CONTENT_BRANCH: process.env.NEXT_PUBLIC_CONTENT_BRANCH }): RepoRef {
  const [owner, repo] = (env.NEXT_PUBLIC_CONTENT_REPO || "Kshitijkb28/heavy").split("/");
  return { owner, repo, branch: env.NEXT_PUBLIC_CONTENT_BRANCH || "main" };
}

export type GitHubErrorKind = "auth" | "forbidden" | "not-found" | "conflict" | "invalid" | "network" | "other";

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number;
  constructor(kind: GitHubErrorKind, message: string, status = 0) {
    super(message);
    this.name = "GitHubError";
    this.kind = kind;
    this.status = status;
  }
}

/** Standard base64 of raw bytes (a PDF, or UTF-8 text). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The contents API's base64 (wrapped in newlines) back to UTF-8 text. */
export function decodeBase64Utf8(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export interface LoadedContent {
  content: Content;
  /** the branch head the content was read at: the draft's base */
  commitSha: string;
  /** the blob of content.json at that commit (a newer head with the same blob changed nothing the draft cares about) */
  fileSha: string;
}

export interface PublishInput {
  base: { commitSha: string; fileSha: string };
  draft: Content;
  message: string;
  /** a replacement PDF for `profile.resumePdf`, at its path in the repo */
  resume?: { path: string; base64: string };
}

export type RunState = { state: "waiting" | "unknown" } | { state: "building" | "live" | "failed"; url: string };

export interface Published {
  commitSha: string;
  /** the new content.json blob: the next publish's base `fileSha` */
  fileSha: string;
  /** built on a newer head than the base (other files had changed there) */
  rebased: boolean;
}

export interface GitHub {
  loadContent(): Promise<LoadedContent>;
  publish(input: PublishInput): Promise<Published>;
  runStatus(commitSha: string): Promise<RunState>;
}

const PERMISSION_HELP = "Give the token Contents: Read and write on this repository.";
/** a request GitHub has not answered by then is given up (a hung connection must not lock the publish dialog) */
export const REQUEST_TIMEOUT_MS = 30_000;

export function createGitHub(token: string, repo: RepoRef, fetchImpl: typeof fetch = (...args) => fetch(...args)): GitHub {
  const root = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;

  async function call<T>(method: string, path: string, body?: unknown, writing = false): Promise<T> {
    let res: Response;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    try {
      res = await fetchImpl(`${root}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: abort.signal,
      });
    } catch {
      throw new GitHubError(
        "network",
        abort.signal.aborted ? `GitHub did not answer within ${REQUEST_TIMEOUT_MS / 1000} s. Try again in a moment.` : "GitHub could not be reached. Check the connection and try again.",
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;
    const detail = await res
      .json()
      .then((j: { message?: string }) => j?.message ?? "")
      .catch(() => "");
    if (res.status === 401) throw new GitHubError("auth", "GitHub did not accept the token: it may have expired. Sign in again with a new one.", 401);
    if (res.status === 403 || (writing && res.status === 404)) throw new GitHubError("forbidden", `This token cannot ${writing ? "write to" : "read"} ${repo.owner}/${repo.repo}. ${PERMISSION_HELP}`, res.status);
    if (res.status === 404) throw new GitHubError("not-found", `${repo.owner}/${repo.repo} (branch ${repo.branch}) was not found, or the token has no access to it.`, 404);
    if (res.status === 409 || res.status === 422) throw new GitHubError("conflict", detail || "GitHub refused the update.", res.status);
    throw new GitHubError("other", `GitHub answered ${res.status}${detail ? `: ${detail}` : ""}.`, res.status);
  }

  const head = async () => (await call<{ object: { sha: string } }>("GET", `/git/ref/heads/${repo.branch}`)).object.sha;

  async function fileAt(commitSha: string): Promise<{ sha: string; text: string }> {
    const file = await call<{ sha: string; content: string }>("GET", `/contents/${CONTENT_PATH}?ref=${commitSha}`);
    return { sha: file.sha, text: decodeBase64Utf8(file.content) };
  }

  async function loadContent(): Promise<LoadedContent> {
    const commitSha = await head();
    const file = await fileAt(commitSha);
    let content: Content;
    try {
      content = parseContent(JSON.parse(file.text));
    } catch (e) {
      throw new GitHubError("invalid", `content.json on GitHub is not valid: ${(e as Error).message}`);
    }
    return { content, commitSha, fileSha: file.sha };
  }

  /** The commit to build on: the base, or a newer head whose content.json is still the base's. */
  async function parentFor(base: PublishInput["base"]): Promise<{ parent: string; rebased: boolean }> {
    const current = await head();
    if (current === base.commitSha) return { parent: current, rebased: false };
    const file = await fileAt(current);
    if (file.sha !== base.fileSha) throw new GitHubError("conflict", "content.json changed on GitHub since you started editing (another device, or a code push). Your draft is kept: load the latest and apply your changes again.");
    return { parent: current, rebased: true };
  }

  async function publish(input: PublishInput, attempt = 0): Promise<Published> {
    const { parent, rebased } = await parentFor(input.base);
    // canonical key order (parseContent rebuilds every object), so a commit's diff shows only what changed
    const json = await call<{ sha: string }>("POST", "/git/blobs", { content: serializeContent(parseContent(input.draft)), encoding: "utf-8" }, true);
    const pdf = input.resume ? await call<{ sha: string }>("POST", "/git/blobs", { content: input.resume.base64, encoding: "base64" }, true) : null;
    const parentCommit = await call<{ tree: { sha: string } }>("GET", `/git/commits/${parent}`);
    const tree = await call<{ sha: string }>(
      "POST",
      "/git/trees",
      {
        base_tree: parentCommit.tree.sha,
        tree: [
          { path: CONTENT_PATH, mode: "100644", type: "blob", sha: json.sha },
          ...(pdf && input.resume ? [{ path: input.resume.path, mode: "100644", type: "blob", sha: pdf.sha }] : []),
        ],
      },
      true,
    );
    const commit = await call<{ sha: string }>("POST", "/git/commits", { message: input.message, tree: tree.sha, parents: [parent] }, true);
    try {
      await call("PATCH", `/git/refs/heads/${repo.branch}`, { sha: commit.sha, force: false }, true);
    } catch (e) {
      // someone pushed between reading the head and moving it: build once more on the newest head
      if (e instanceof GitHubError && e.kind === "conflict" && attempt === 0) {
        const again = await publish(input, 1);
        return { ...again, rebased: true };
      }
      throw e;
    }
    return { commitSha: commit.sha, fileSha: json.sha, rebased };
  }

  async function runStatus(commitSha: string): Promise<RunState> {
    let runs: { workflow_runs: { status: string; conclusion: string | null; html_url: string }[] };
    try {
      runs = await call("GET", `/actions/runs?head_sha=${commitSha}&per_page=5`);
    } catch {
      return { state: "unknown" };
    }
    const run = runs.workflow_runs[0];
    if (!run) return { state: "waiting" };
    if (run.status !== "completed") return { state: "building", url: run.html_url };
    return { state: run.conclusion === "success" ? "live" : "failed", url: run.html_url };
  }

  return { loadContent, publish, runStatus };
}
