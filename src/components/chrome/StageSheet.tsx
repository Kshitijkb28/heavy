"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { TRACK, sheetLinks } from "@/data/derived";
import { useActiveStation } from "@/hooks/useActiveSection";
import { DESKTOP, useMediaQuery } from "@/hooks/useMediaQuery";
import { handleAnchorClick, isPlainClick } from "@/hooks/useScrollTo";
import { useUI } from "@/store/ui";
import { useTrackProgress } from "./useTrackProgress";
import s from "./StageSheet.module.css";

/**
 * Phone navigation (below 64rem; display: none above): a 48 px round stage counter bottom-right showing the active
 * station code with a progress ring, opening a bottom-sheet `<dialog>` via `showModal` — native focus trap, Esc, backdrop
 * click, focus returned to the counter — with 56 px rows for the seven places plus Résumé, LinkedIn, GitHub and email.
 * While open: `html[data-sheet="open"]` locks the document, the sheet panel contains its own overscroll.
 */
export function StageSheet() {
  const open = useUI((st) => st.sheetOpen);
  const setOpen = useUI((st) => st.setSheetOpen);
  const station = useActiveStation();
  const desktop = useMediaQuery(DESKTOP);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** false while a place link closes the sheet: focus goes to the section, not back to the counter */
  const returnFocus = useRef(true);
  useTrackProgress(buttonRef, !desktop);

  // the sheet belongs to the phone/tablet layout: widening past the desktop breakpoint (a rotated tablet) closes it and
  // hands focus to the page instead of to the now hidden counter
  useEffect(() => {
    if (!desktop || !open) return;
    returnFocus.current = false;
    setOpen(false);
    // focus was inside the dialog: give it to the page, not to the body
    requestAnimationFrame(() => document.getElementById("content")?.focus({ preventScroll: true }));
  }, [desktop, open, setOpen]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (!open) {
      if (d.open) d.close();
      return;
    }
    if (!d.open) d.showModal();
    document.documentElement.dataset.sheet = "open";
    const row = d.querySelector<HTMLElement>("[aria-current]") ?? d.querySelector<HTMLElement>("a, button");
    row?.focus({ preventScroll: true });
    return () => {
      delete document.documentElement.dataset.sheet;
    };
  }, [open]);

  const close = () => setOpen(false);
  /** native `close` (Esc, `close()`): sync the store and hand focus back to the counter */
  const onClose = () => {
    setOpen(false);
    if (returnFocus.current) buttonRef.current?.focus({ preventScroll: true });
    returnFocus.current = true;
  };
  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === dialogRef.current) setOpen(false);
  };
  const onPlace = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (!isPlainClick(e)) return;
    returnFocus.current = false;
    dialogRef.current?.close(); // synchronously: the document is no longer inert when we scroll and focus the section
    setOpen(false);
    handleAnchorClick(e, id);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`mono ${s.counter}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="stage-sheet"
        aria-label={`Sections — stage ${station.code}`}
        onClick={() => setOpen(true)}
      >
        <span className={s.ring} aria-hidden="true" />
        <span className={s.code} aria-hidden="true">
          {station.code}
        </span>
      </button>
      <dialog id="stage-sheet" ref={dialogRef} className={s.sheet} aria-labelledby="stage-sheet-title" onClose={onClose} onClick={onBackdrop} data-lenis-prevent="">
        <div className={s.panel}>
          <div className={s.handle} aria-hidden="true" />
          <div className={s.head}>
            <p id="stage-sheet-title" className={`mono ${s.title}`}>
              Stage <b>{station.code}</b> <span>{station.label}</span>
            </p>
            <button type="button" className={s.close} onClick={close} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M3 3l12 12M15 3L3 15" />
              </svg>
            </button>
          </div>
          <nav aria-label="Sections">
            <ol className={s.list}>
              {TRACK.map((p) => (
                <li key={p.id}>
                  <a href={`#${p.id}`} className={s.row} aria-current={p.id === station.id ? "location" : undefined} onClick={(e) => onPlace(e, p.id)}>
                    <span className={`mono ${s.rowCode}`}>{p.code}</span>
                    <span className={s.rowLabel}>{p.meta?.label ?? "Home"}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <ul className={`${s.list} ${s.links}`}>
            {sheetLinks.map((l) => (
              <li key={l.label}>
                <a href={l.href} className={s.row} target={l.external ? "_blank" : undefined} rel={l.external ? "noopener noreferrer" : undefined} onClick={close}>
                  <span className={s.rowLabel}>{l.label}</span>
                  <span className={`mono ${s.rowMeta}`} aria-hidden="true">
                    {l.external ? "↗" : "@"}
                  </span>
                  {l.external ? <span className="sr-only"> (opens in a new tab)</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </dialog>
    </>
  );
}
