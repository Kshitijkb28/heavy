"use client";

/**
 * Weight-drop reveals (U7, DESIGN.md "Motion language"): every `[data-reveal]` block under `main` is prepared shortly
 * before it can be seen (SplitText lines inside clipped wrappers, or its children, or the block itself), then its pieces
 * fall 12 px into place over 500 ms (power3.out, 40 ms stagger) when the block's top crosses 85 % of the viewport, once.
 * After the drop the original markup is restored. Blocks already scrolled past are released instantly and nothing that
 * is visible is ever hidden again. A MutationObserver picks up blocks added later; an IntersectionObserver watchdog and
 * the stylesheet's 3 s safety timer guarantee that content never stays hidden if a trigger misses.
 */
import { useEffect, type RefObject } from "react";
import { loadGsap, refreshScrollTriggers, type GsapBundle } from "@/lib/gsap";
import styles from "./motion.module.css";
import {
  HOLD_SELECTOR,
  REVEAL,
  REVEAL_SELECTOR,
  cascadeDelay,
  classifyRect,
  instantRelease,
  parseRevealConfig,
  readMotionMode,
  staggerFor,
  wantsMask,
  type RevealConfig,
  type RevealState,
} from "./reveal-core";

type Tween = ReturnType<GsapBundle["gsap"]["fromTo"]>;
type DelayedCall = ReturnType<GsapBundle["gsap"]["delayedCall"]>;
type Trigger = ReturnType<GsapBundle["ScrollTrigger"]["create"]>;
type Split = ReturnType<GsapBundle["SplitText"]["create"]>;

interface Entry {
  el: HTMLElement;
  config: RevealConfig;
  state: RevealState;
  split: Split | null;
  tween: Tween | null;
  trigger: Trigger | null;
  delayed: DelayedCall | null;
  watchdog: ReturnType<typeof setTimeout> | undefined;
  kids: HTMLElement[];
}

export interface RevealController {
  /** registers every `[data-reveal]` under the root not seen before and forgets removed ones (also run by a MutationObserver) */
  scan(): void;
  /** shows everything instantly (reduced motion switched on at runtime) */
  releaseAll(): void;
  /** kills triggers, tweens and splits; prepared blocks go back to their pristine markup, playing ones are shown */
  dispose(): void;
  /** live counters for the lab page and the debug overlay */
  stats(): Record<RevealState, number>;
}

/** Shows every hold under `root` immediately (calm mode, a failed GSAP chunk). Returns how many it touched. */
export function releaseHolds(root: ParentNode): number {
  let n = 0;
  root.querySelectorAll<HTMLElement>(HOLD_SELECTOR).forEach((el) => {
    if (el.dataset.revealState === "done") return;
    el.style.animation = "none";
    el.style.opacity = "1";
    el.dataset.revealState = "done";
    n += 1;
  });
  return n;
}

/** Releases the holds now and keeps releasing any that are added later. */
function watchHolds(root: HTMLElement): () => void {
  releaseHolds(root);
  const mo = new MutationObserver(() => releaseHolds(root));
  mo.observe(root, { childList: true, subtree: true });
  return () => mo.disconnect();
}

function fontsSettled(maxWaitMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const ok = () => {
      if (done) return;
      done = true;
      resolve();
    };
    document.fonts.ready.then(ok, ok);
    setTimeout(ok, maxWaitMs);
  });
}

export function createRevealController(root: HTMLElement, bundle: GsapBundle): RevealController {
  const { gsap, ScrollTrigger, SplitText } = bundle;
  const entries = new Map<HTMLElement, Entry>();
  const startLine = `top ${REVEAL.start * 100}%`;

  // Blocks are prepared well before they can be seen; a second observer is the watchdog for prepared blocks on screen.
  const armIo = new IntersectionObserver(onArmable, { rootMargin: `${REVEAL.armMargin * 100}% 0px`, threshold: 0 });
  const eyeIo = new IntersectionObserver(onSeen, { rootMargin: `0px 0px -${(1 - REVEAL.start) * 100}% 0px`, threshold: 0 });
  const mo = new MutationObserver(scheduleScan);
  mo.observe(root, { childList: true, subtree: true });

  // Reveals that fire in the same frame (a jump, a deep link, a tall section entering at once) land in DOM order.
  let frameCount = 0;
  let frameHandle = 0;
  function cascadeSlot(): number {
    if (!frameHandle) {
      frameHandle = requestAnimationFrame(() => {
        frameHandle = 0;
        frameCount = 0;
      });
    }
    frameCount += 1;
    return frameCount - 1;
  }

  let scanHandle = 0;
  function scheduleScan() {
    if (scanHandle) return;
    scanHandle = requestAnimationFrame(() => {
      scanHandle = 0;
      scan();
    });
  }

  function scan() {
    for (const [el, e] of entries) {
      if (!el.isConnected) {
        teardown(e);
        entries.delete(el);
      }
    }
    let added = 0;
    root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el) => {
      if (entries.has(el)) return;
      register(el);
      added += 1;
    });
    if (added) refreshScrollTriggers();
  }

  function register(el: HTMLElement) {
    const e: Entry = { el, config: parseRevealConfig(el.dataset), state: "idle", split: null, tween: null, trigger: null, delayed: null, watchdog: undefined, kids: [] };
    entries.set(el, e);
    if (el.dataset.revealState === "done") {
      e.state = "done";
      return;
    }
    el.dataset.revealState = "idle";
    armIo.observe(el);
  }

  function onArmable(records: IntersectionObserverEntry[]) {
    const batch: Entry[] = [];
    for (const r of records) {
      const e = entries.get(r.target as HTMLElement);
      if (!e || e.state !== "idle" || !r.isIntersecting) continue;
      armIo.unobserve(r.target);
      batch.push(e);
    }
    if (batch.length) armBatch(batch);
  }

  /** Reads first (one layout), then writes: blocks scrolled past or already visible are released, the rest are prepared. */
  function armBatch(batch: Entry[]) {
    const vh = window.innerHeight;
    const measured = batch.map((e) => {
      const rect = e.el.getBoundingClientRect();
      const cs = getComputedStyle(e.el);
      return {
        e,
        pos: classifyRect(rect.top, rect.bottom, vh),
        onScreen: rect.bottom > 0 && rect.top < vh,
        shown: cs.opacity !== "0",
        mask: wantsMask(parseFloat(cs.lineHeight), parseFloat(cs.fontSize)),
      };
    });
    const now: Entry[] = [];
    for (const m of measured) {
      if (instantRelease(m.pos, m.onScreen, m.shown)) {
        release(m.e);
        continue;
      }
      prepare(m.e, m.mask);
      if (m.pos === "visible") now.push(m.e);
    }
    for (const m of measured) if (m.e.state === "armed" && !now.includes(m.e)) watch(m.e);
    for (const e of now) reveal(e);
  }

  /** Hides the block under GSAP's control (the CSS safety timer hands over here) and builds its paused drop. */
  function prepare(e: Entry, mask: boolean) {
    const { el } = e;
    // splitting text that contains a link or a button clones it into empty, focusable copies (and the revert drops focus):
    // such blocks always drop as one piece
    if (e.config.mode !== "block" && e.config.mode !== "children" && el.querySelector("a, button, input, select, textarea, [tabindex]")) e.config = { ...e.config, mode: "block" };
    const { config } = e;
    el.style.animation = "none";
    e.state = "armed";
    el.dataset.revealState = "armed";
    const from = { y: -config.distance, opacity: 0 };
    const to = { y: 0, opacity: 1, duration: config.duration, ease: REVEAL.ease, paused: true, onComplete: () => finish(e) };

    if (config.mode === "block") {
      e.tween = gsap.fromTo(el, from, to);
      return;
    }
    if (config.mode === "children") {
      e.kids = Array.from(el.children).filter((c): c is HTMLElement => c instanceof HTMLElement);
      if (!e.kids.length) {
        e.tween = gsap.fromTo(el, from, to);
        return;
      }
      e.tween = gsap.fromTo(e.kids, from, { ...to, stagger: staggerFor(e.kids.length, config.stagger) });
      el.style.opacity = "1";
      return;
    }
    const type = config.mode === "lines" ? "lines" : `lines,${config.mode}`;
    e.split = SplitText.create(el, {
      type,
      tag: "span",
      // "auto" puts aria-label on <p>/<span>, which ARIA prohibits on generic roles; the split is reverted after the drop,
      // and line spans read naturally meanwhile
      aria: "none",
      autoSplit: true,
      mask: mask ? "lines" : undefined,
      linesClass: styles.line,
      wordsClass: styles.word,
      charsClass: styles.char,
      // Re-run on every (auto)split: SplitText reverts the previous drop itself, keeping its playhead when live.
      onSplit: (self) => {
        for (const m of self.masks) m.classList.add(styles.mask);
        const pieces = config.mode === "lines" ? self.lines : config.mode === "words" ? self.words : self.chars;
        const tween = gsap.fromTo(pieces, from, { ...to, paused: e.state !== "revealing", stagger: staggerFor(pieces.length, config.stagger) });
        e.tween = tween;
        return tween;
      },
    });
    el.style.opacity = "1";
  }

  function watch(e: Entry) {
    e.trigger = ScrollTrigger.create({
      trigger: e.el,
      start: startLine,
      end: "bottom top",
      onEnter: () => reveal(e),
      onEnterBack: () => reveal(e),
      onLeave: () => reveal(e),
    });
    eyeIo.observe(e.el);
  }

  function onSeen(records: IntersectionObserverEntry[]) {
    for (const r of records) {
      const e = entries.get(r.target as HTMLElement);
      if (!e) continue;
      clearTimeout(e.watchdog);
      e.watchdog = undefined;
      if (r.isIntersecting && e.state === "armed") {
        e.watchdog = setTimeout(() => {
          if (e.state === "armed") reveal(e);
        }, REVEAL.watchdogMs);
      }
    }
  }

  function reveal(e: Entry) {
    if (e.state !== "armed") return;
    e.state = "revealing";
    e.el.dataset.revealState = "revealing";
    killTrigger(e);
    eyeIo.unobserve(e.el);
    clearTimeout(e.watchdog);
    e.watchdog = undefined;
    if (!e.tween) {
      finish(e);
      return;
    }
    const delay = e.config.delay + cascadeDelay(cascadeSlot());
    if (delay > 0) {
      e.delayed = gsap.delayedCall(delay, () => {
        e.delayed = null;
        e.tween?.play();
      });
    } else {
      e.tween.play();
    }
  }

  /** The drop landed: restore the original markup and leave the block visible (the `.hold` rule still says opacity 0). */
  function finish(e: Entry) {
    if (e.state === "done") return;
    e.state = "done";
    e.el.dataset.revealState = "done";
    teardown(e);
    e.el.style.animation = "none";
    e.el.style.opacity = "1";
  }

  function release(e: Entry) {
    if (e.state === "done") return;
    finish(e);
  }

  function killTrigger(e: Entry) {
    e.trigger?.kill();
    e.trigger = null;
  }

  function teardown(e: Entry) {
    killTrigger(e);
    eyeIo.unobserve(e.el);
    armIo.unobserve(e.el);
    clearTimeout(e.watchdog);
    e.watchdog = undefined;
    e.delayed?.kill();
    e.delayed = null;
    if (e.split) {
      e.split.revert();
      e.split = null;
      e.tween = null;
    }
    if (e.tween) {
      e.tween.kill();
      e.tween = null;
    }
    if (e.kids.length) {
      gsap.set(e.kids, { clearProps: "opacity,transform" });
      for (const kid of e.kids) if (!kid.getAttribute("style")) kid.removeAttribute("style");
      e.kids = [];
    } else if (e.config.mode === "block" || e.config.mode === "children") {
      gsap.set(e.el, { clearProps: "transform" });
    }
  }

  return {
    scan,
    releaseAll() {
      for (const e of entries.values()) release(e);
      releaseHolds(root);
    },
    dispose() {
      mo.disconnect();
      armIo.disconnect();
      eyeIo.disconnect();
      if (scanHandle) cancelAnimationFrame(scanHandle);
      scanHandle = 0;
      if (frameHandle) cancelAnimationFrame(frameHandle);
      frameHandle = 0;
      for (const e of entries.values()) {
        if (e.state === "revealing") {
          release(e);
        } else if (e.state === "armed") {
          teardown(e);
          e.el.style.removeProperty("animation");
          e.el.style.removeProperty("opacity");
          delete e.el.dataset.revealState;
        } else if (e.state === "idle") {
          delete e.el.dataset.revealState;
        }
      }
      entries.clear();
    },
    stats() {
      const s: Record<RevealState, number> = { idle: 0, armed: 0, revealing: 0, done: 0 };
      for (const e of entries.values()) s[e.state] += 1;
      return s;
    },
  };
}

let activeController: RevealController | null = null;

/** Live reveal counters for the debug overlay (U8) and the lab; null until the controller runs (calm mode never runs one). */
export function revealStats(): Record<RevealState, number> | null {
  return activeController?.stats() ?? null;
}

export interface StartRevealsOptions {
  /** force calm mode (everything shown at once); default: `html[data-motion]` / `prefers-reduced-motion` */
  calm?: boolean;
  /** receives the controller once GSAP and the fonts are in (lab and debug use) */
  onController?: (controller: RevealController) => void;
}

/**
 * Imperative entry: loads GSAP, waits for the fonts (≤ 1.2 s) and runs the controller on `root`; in calm mode or when
 * the chunk fails it releases every hold instead, now and as they are added. Returns the disposer.
 */
export function startReveals(root: HTMLElement, opts: StartRevealsOptions = {}): () => void {
  let disposed = false;
  let controller: RevealController | null = null;
  let stopFallback: (() => void) | null = null;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const calm = opts.calm ?? readMotionMode(document.documentElement.dataset.motion, mq.matches) === "calm";

  const fallback = () => {
    if (!stopFallback) stopFallback = watchHolds(root);
  };
  const goCalm = () => {
    controller?.releaseAll();
    controller?.dispose();
    if (activeController === controller) activeController = null;
    controller = null;
    fallback();
  };

  if (calm) {
    fallback();
  } else {
    loadGsap()
      .then(async (bundle) => {
        await fontsSettled(REVEAL.fontsWaitMs);
        if (disposed) return;
        if (mq.matches) {
          fallback();
          return;
        }
        controller = createRevealController(root, bundle);
        activeController = controller;
        controller.scan();
        opts.onController?.(controller);
      })
      .catch(() => {
        if (!disposed) fallback();
      });
  }

  const onChange = () => {
    if (mq.matches) goCalm();
  };
  mq.addEventListener("change", onChange);

  return () => {
    disposed = true;
    mq.removeEventListener("change", onChange);
    controller?.dispose();
    if (activeController === controller) activeController = null;
    controller = null;
    stopFallback?.();
    stopFallback = null;
  };
}

/** Runs the reveals on `main` (or the given root) for the life of the component; Strict Mode replays are clean. */
export function useReveal(rootRef?: RefObject<HTMLElement | null>, opts?: StartRevealsOptions): void {
  useEffect(() => {
    const root = rootRef?.current ?? document.querySelector<HTMLElement>("main") ?? document.body;
    return startReveals(root, opts);
    // opts is read once on mount by design (callbacks and the calm override do not change at runtime)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRef]);
}
