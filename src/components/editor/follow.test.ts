import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunState } from "@/lib/github";
import { followRun, type PublishStatus } from "./follow";

const RUN = "https://github.com/kb/heavy/actions/runs/1";
const scripted = (...states: RunState[]) => {
  const calls: string[] = [];
  return { calls, gh: { runStatus: async (sha: string) => (calls.push(sha), states.shift() ?? states.at(-1) ?? { state: "waiting" as const }) } };
};

describe("followRun", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports the build until the site is live, then offers a reload and stops", async () => {
    const seen: PublishStatus[] = [];
    const { gh, calls } = scripted({ state: "building", url: RUN }, { state: "live", url: RUN });
    followRun(gh, "c2", (s) => seen.push(s), new AbortController().signal);
    expect(seen.at(-1)?.text).toMatch(/waiting for the build/);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(seen.at(-1)?.text).toMatch(/building/);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seen.at(-1)).toEqual({ text: "Live ✓", action: { kind: "reload", label: "Reload" } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(2);
  });

  it("links a failed build to its run", async () => {
    const seen: PublishStatus[] = [];
    followRun(scripted({ state: "failed", url: RUN }).gh, "c2", (s) => seen.push(s), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(seen.at(-1)).toEqual({ text: "The build failed: the site still shows the last version", tone: "error", action: { kind: "link", label: "Open the run", href: RUN } });
  });

  it("says when it cannot see the run (no Actions access)", async () => {
    const seen: PublishStatus[] = [];
    followRun(scripted({ state: "unknown" }).gh, "c2", (s) => seen.push(s), new AbortController().signal);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(seen.at(-1)?.text).toBe("Published · live in about two minutes");
  });

  it("stops when aborted (a newer publish, or leaving edit mode)", async () => {
    const seen: PublishStatus[] = [];
    const stop = new AbortController();
    const { gh, calls } = scripted({ state: "building", url: RUN });
    followRun(gh, "c2", (s) => seen.push(s), stop.signal);
    await vi.advanceTimersByTimeAsync(3_000);
    stop.abort();
    const count = seen.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls).toHaveLength(1);
    expect(seen).toHaveLength(count);
  });
});
