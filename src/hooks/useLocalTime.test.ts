import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClock, formatLocalTime, msUntilNextMinute } from "./useLocalTime";

describe("formatLocalTime", () => {
  it("formats Asia/Kolkata as 24-hour IST", () => {
    // 2026-03-01T09:02:00Z = 14:32 IST
    expect(formatLocalTime(new Date(Date.UTC(2026, 2, 1, 9, 2)), "Asia/Kolkata")).toBe("14:32 IST");
  });
  it("pads hours and never uses a 12-hour cycle", () => {
    // 18:35Z = 00:05 IST next day
    expect(formatLocalTime(new Date(Date.UTC(2026, 2, 1, 18, 35)), "Asia/Kolkata")).toBe("00:05 IST");
  });
  it("returns an empty string for an invalid zone instead of throwing", () => {
    expect(formatLocalTime(new Date(), "Not/AZone")).toBe("");
  });
});

describe("msUntilNextMinute", () => {
  it("lands just inside the next minute", () => {
    expect(msUntilNextMinute(0)).toBe(60_050);
    expect(msUntilNextMinute(59_000)).toBe(1_050);
    expect(msUntilNextMinute(123_456)).toBe(60_000 - 3_456 + 50);
  });
});

describe("createClock", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns a stable snapshot within a minute and a new one after the boundary", () => {
    let now = Date.UTC(2026, 2, 1, 9, 2, 10);
    const clock = createClock("Asia/Kolkata", () => now);
    const a = clock.getSnapshot();
    now += 20_000;
    expect(clock.getSnapshot()).toBe(a);
    expect(a).toBe("14:32 IST");
    now += 40_000;
    expect(clock.getSnapshot()).toBe("14:33 IST");
  });

  it("notifies subscribers at each minute boundary and stops after unsubscribe", () => {
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 9, 2, 30)));
    const clock = createClock("Asia/Kolkata");
    const onChange = vi.fn();
    const stop = clock.subscribe(onChange);
    vi.advanceTimersByTime(30_000);
    expect(onChange).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(120_000);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
