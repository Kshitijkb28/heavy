import { beforeEach, describe, expect, it } from "vitest";
import { sceneState } from "@/lib/scene-state";
import { LOOP, createLoopController, type LoopMode } from "./loop";

function harness() {
  let now = 1_000;
  const calls: string[] = [];
  const queue = new Map<number, (now: number) => void>();
  let nextId = 1;
  const modes: Array<[LoopMode, boolean]> = [];
  const ctrl = createLoopController({
    setFrameloop: (m) => calls.push(`frameloop:${m}`),
    invalidate: () => calls.push("invalidate"),
    raf: (cb) => {
      const id = nextId++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => {
      queue.delete(id);
    },
    now: () => now,
    onMode: (m, active) => modes.push([m, active]),
  });
  const advance = (ms: number) => {
    now += ms;
  };
  /** runs every queued animation frame once (each may queue the next) */
  const flushFrame = () => {
    const pending = [...queue.entries()];
    queue.clear();
    for (const [, cb] of pending) cb(now);
  };
  return { ctrl, calls, modes, advance, flushFrame, queueSize: () => queue.size, time: () => now };
}

describe("loop controller", () => {
  beforeEach(() => {
    sceneState.lastInputAt = 0;
    sceneState.idleMs = 0;
    sceneState.active = true;
  });

  it("starts awake and stays there while bodies move", () => {
    const h = harness();
    h.ctrl.input();
    expect(sceneState.lastInputAt).toBe(h.time());
    h.advance(LOOP.halfAfterMs + 1);
    h.ctrl.frame(() => false);
    expect(h.ctrl.mode).toBe("always");
    expect(sceneState.idleMs).toBe(LOOP.halfAfterMs + 1);
  });

  it("drops to half rate after 8 s idle with sleeping bodies and renders every other frame", () => {
    const h = harness();
    h.ctrl.input();
    h.advance(LOOP.halfAfterMs);
    h.ctrl.frame(() => true);
    expect(h.ctrl.mode).toBe("half");
    expect(h.calls).toEqual(["frameloop:demand"]);
    expect(sceneState.active).toBe(true);
    h.calls.length = 0;
    for (let i = 0; i < 8; i++) {
      h.advance(16);
      h.flushFrame();
    }
    expect(h.calls.filter((c) => c === "invalidate")).toHaveLength(4);
    expect(h.queueSize()).toBe(1);
  });

  it("rests in demand mode after 60 s, draws one last frame, and wakes on input", () => {
    const h = harness();
    h.ctrl.input();
    h.advance(LOOP.halfAfterMs);
    h.ctrl.frame(() => true);
    h.calls.length = 0;
    h.advance(LOOP.demandAfterMs);
    h.flushFrame();
    expect(h.ctrl.mode).toBe("demand");
    expect(h.calls).toEqual(["frameloop:demand", "invalidate"]);
    expect(h.queueSize()).toBe(0);
    h.calls.length = 0;
    h.ctrl.input();
    expect(h.ctrl.mode).toBe("always");
    expect(h.calls).toEqual(["frameloop:always"]);
    expect(sceneState.idleMs).toBe(0);
  });

  it("goes straight to demand when the idle clock is already past 60 s", () => {
    const h = harness();
    h.ctrl.input();
    h.advance(LOOP.demandAfterMs + 5);
    h.ctrl.frame(() => false);
    expect(h.ctrl.mode).toBe("demand");
  });

  it("parks while hidden and resumes awake when visible again", () => {
    const h = harness();
    h.ctrl.setVisible(false);
    expect(h.ctrl.mode).toBe("never");
    expect(h.ctrl.isActive()).toBe(false);
    expect(sceneState.active).toBe(false);
    expect(h.calls.at(-1)).toBe("frameloop:never");
    h.ctrl.input();
    expect(h.ctrl.mode).toBe("never");
    h.advance(5_000);
    h.ctrl.setVisible(true);
    expect(h.ctrl.mode).toBe("always");
    expect(sceneState.active).toBe(true);
    expect(sceneState.lastInputAt).toBe(h.time());
    expect(h.modes.at(-1)).toEqual(["always", true]);
  });

  it("honours the manual switch independently of visibility", () => {
    const h = harness();
    h.ctrl.setEnabled(false);
    expect(h.ctrl.mode).toBe("never");
    h.ctrl.setVisible(true);
    expect(h.ctrl.mode).toBe("never");
    h.ctrl.setEnabled(true);
    expect(h.ctrl.mode).toBe("always");
    h.ctrl.setVisible(false);
    h.ctrl.setEnabled(true);
    expect(h.ctrl.mode).toBe("never");
  });

  it("cancels its ticker on dispose and ignores everything afterwards", () => {
    const h = harness();
    h.ctrl.input();
    h.advance(LOOP.halfAfterMs);
    h.ctrl.frame(() => true);
    expect(h.queueSize()).toBe(1);
    h.ctrl.dispose();
    expect(h.queueSize()).toBe(0);
    h.calls.length = 0;
    h.ctrl.input();
    h.ctrl.setVisible(false);
    expect(h.calls).toEqual([]);
  });
});
