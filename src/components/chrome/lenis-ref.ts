import type Lenis from "lenis";

let instance: Lenis | undefined;

/** Set by SmoothScroll while it runs the root Lenis (fine pointer, motion on). */
export function setLenis(lenis: Lenis | undefined): void {
  instance = lenis;
}

/** The root Lenis instance, or undefined when the page scrolls natively (touch, reduced motion, SSR). */
export function getLenis(): Lenis | undefined {
  return instance;
}
