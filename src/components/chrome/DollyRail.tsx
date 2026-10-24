"use client";

import { useRef, type CSSProperties } from "react";
import { TRACK } from "@/data/derived";
import { useActiveStation } from "@/hooks/useActiveSection";
import { DESKTOP, useMediaQuery } from "@/hooks/useMediaQuery";
import { handleAnchorClick } from "@/hooks/useScrollTo";
import { useTrackProgress } from "./useTrackProgress";
import s from "./DollyRail.module.css";

const LAST = TRACK.length - 1;

/**
 * The Dolly Track (desktop ≥ 64rem; display: none below): a fixed bottom rail — 1 px steel hairline, seven station ticks
 * HOME … CONTACT in mono, a signal marker sliding with `sceneState.t / 6` (rAF while visible, via `--rail-p`), the active
 * station lit from the store (`aria-current`), the marker glinting with `--beacon`. Real links in a `<nav>`.
 */
export function DollyRail() {
  const station = useActiveStation();
  const visible = useMediaQuery(DESKTOP);
  const ref = useRef<HTMLElement>(null);
  useTrackProgress(ref, visible);

  return (
    <nav ref={ref} aria-label="Sections" className={s.rail}>
      <div className={s.inner}>
        <div className={s.track} aria-hidden="true">
          <span className={s.marker} />
        </div>
        <ol className={s.stations}>
          {TRACK.map((p, i) => (
            <li key={p.id} className={s.station} style={{ "--i": i / LAST } as CSSProperties}>
              <a href={`#${p.id}`} className={s.link} aria-current={p.id === station.id ? "location" : undefined} onClick={(e) => handleAnchorClick(e, p.id)}>
                <span className={s.tick} aria-hidden="true" />
                <span className={s.label}>{p.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}
