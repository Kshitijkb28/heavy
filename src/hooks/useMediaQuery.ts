import { useCallback, useSyncExternalStore } from "react";

/** Queries the chrome keys off. */
export const FINE_POINTER = "(pointer: fine)";
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/** Desktop chrome (the dolly track) from 64rem; the stage counter and sheet below it. Mirrors the CSS breakpoint. */
export const DESKTOP = "(min-width: 64rem)";

const lists = new Map<string, MediaQueryList>();
function list(query: string): MediaQueryList {
  let l = lists.get(query);
  if (!l) {
    l = window.matchMedia(query);
    lists.set(query, l);
  }
  return l;
}

/**
 * `matchMedia(query).matches`, subscribed to changes. `serverValue` is what the server render and hydration use
 * (default false), so the first client paint matches the HTML and the real value lands on the next render.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const l = list(query);
      l.addEventListener("change", onChange);
      return () => l.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => list(query).matches, [query]);
  const getServerSnapshot = useCallback(() => serverValue, [serverValue]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
