/** Following a publish: polls the deploy run for the commit and turns it into the edit bar's status line. */
import type { GitHub } from "@/lib/github";

export interface PublishStatus {
  text: string;
  tone?: "error";
  /** what the edit bar offers beside the status: reload the live site, or open the failed run */
  action?: { kind: "reload"; label: string } | { kind: "link"; label: string; href: string };
}

/** Polls `runStatus(commitSha)` (first after `firstMs`, then every `pollMs`, for at most `maxMs`) until live or failed. */
export function followRun(
  gh: Pick<GitHub, "runStatus">,
  commitSha: string,
  onStatus: (status: PublishStatus) => void,
  signal: AbortSignal,
  { firstMs = 3_000, pollMs = 10_000, maxMs = 15 * 60_000 } = {},
): void {
  const started = Date.now();
  onStatus({ text: "Published · waiting for the build…" });
  const tick = async () => {
    if (signal.aborted) return;
    const run = await gh.runStatus(commitSha);
    if (signal.aborted) return;
    if (run.state === "live") return onStatus({ text: "Live ✓", action: { kind: "reload", label: "Reload" } });
    if (run.state === "failed") return onStatus({ text: "The build failed: the site still shows the last version", tone: "error", action: { kind: "link", label: "Open the run", href: run.url } });
    if (run.state === "unknown") return onStatus({ text: "Published · live in about two minutes" });
    if (run.state === "building") onStatus({ text: "Published · building the site…" });
    if (Date.now() - started < maxMs) setTimeout(tick, pollMs);
  };
  setTimeout(tick, firstMs);
}
