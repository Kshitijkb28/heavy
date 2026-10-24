"use client";

import { useMemo, useSyncExternalStore } from "react";

/** "14:32 IST" for a zone, 24-hour. Pure; the hook below calls it once per minute. */
export function formatLocalTime(date: Date, timeZone: string, locale = "en-IN"): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
    const zone = get("timeZoneName");
    return `${get("hour")}:${get("minute")}${zone ? ` ${zone}` : ""}`;
  } catch {
    return "";
  }
}

/** Milliseconds until the next whole minute (+ a 50 ms guard so the tick lands inside the new minute). */
export function msUntilNextMinute(now: number): number {
  return 60_000 - (now % 60_000) + 50;
}

export interface Clock {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => string;
}

/**
 * A minute clock as an external store: the snapshot is the formatted time of the current minute (stable within the
 * minute, so React's snapshot check is happy), subscribers are woken at each minute boundary and when the tab becomes
 * visible again (timers drift in background tabs).
 */
export function createClock(timeZone: string, now: () => number = Date.now): Clock {
  let lastMinute = -1;
  let last = "";
  return {
    subscribe(onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(tick, msUntilNextMinute(now()));
      };
      const tick = () => {
        onChange();
        schedule();
      };
      schedule();
      const onVisible = () => {
        if (typeof document === "undefined" || document.visibilityState === "visible") tick();
      };
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
      return () => {
        clearTimeout(timer);
        if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      };
    },
    getSnapshot() {
      const t = now();
      const minute = Math.floor(t / 60_000);
      if (minute !== lastMinute) {
        lastMinute = minute;
        last = formatLocalTime(new Date(t), timeZone);
      }
      return last;
    },
  };
}

const serverSnapshot = () => "";

/** Local time in `timeZone`, e.g. "14:32 IST"; empty on the server and during hydration, live after mount. */
export function useLocalTime(timeZone: string): string {
  const clock = useMemo(() => createClock(timeZone), [timeZone]);
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, serverSnapshot);
}
