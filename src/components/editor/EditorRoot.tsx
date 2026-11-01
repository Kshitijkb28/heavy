/**
 * The editor (loaded only in edit mode). On entry it stops the reveal animations for the visit, marks
 * `html[data-editing]` (the top bar gives way to the edit bar), registers the preview renderer and opens the draft.
 * Every change re-derives the preview, re-measures the scroll map once the DOM settles, and is saved in this browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { content as published } from "@/data/resume";
import { validateContent, type Content } from "@/data/schema";
import { diffContent } from "@/lib/content-diff";
import { refreshScrollMap } from "@/lib/scene/scroll-map";
import { suspendReveals } from "@/components/motion/useReveal";
import { useEditor, type EditMode } from "@/store/editor";
import { setIn, type Path } from "./draft";
import { DraftContext, type DraftApi } from "./fields";
import { EditBar } from "./EditBar";
import { EditorPanel } from "./EditorPanel";
import { GitHubSession } from "./GitHubSession";
import { renderPreview } from "./preview";
import { STORAGE, readStorage, setPreview, writeStorage } from "./slots";
import styles from "./editor.module.css";

setPreview(renderPreview);

/** A draft kept in this browser, tied to the content it started from. */
interface SavedDraft {
  base: string;
  savedAt: string;
  draft: Content;
}

const baseKey = (mode: EditMode, sha: string | null) => (mode === "demo" ? "demo" : (sha ?? ""));

/** The draft kept in this browser, if any; `stale` when it started from another version than `key`. */
function readSaved(key: string): (SavedDraft & { stale: boolean }) | null {
  try {
    const saved = JSON.parse(readStorage(STORAGE.draft) ?? "null") as SavedDraft | null;
    return saved?.draft ? { ...saved, stale: saved.base !== key } : null;
  } catch {
    return null;
  }
}

/** Leaves edit mode: the page reloads without `?edit`, with the reveals and the published content. */
export function exitEditMode(): void {
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
  window.location.reload();
}

/** A kept draft worth offering back: one that differs (key order aside) from what this session starts from. */
function restorable(key: string, start: Content) {
  const saved = readSaved(key);
  return saved && diffContent(start, saved.draft).length > 0 ? saved : null;
}

export function EditorRoot({ mode }: { mode: EditMode }) {
  const active = useEditor((s) => s.active);
  const base = useEditor((s) => s.base);
  const baseSha = useEditor((s) => s.baseSha);
  const draft = useEditor((s) => s.draft);
  const view = useEditor((s) => s.view);
  const resumeFile = useEditor((s) => s.resumeFile);
  // this component only renders in the browser (a portal opened from EditEntry), so storage can be read up front
  const [restore, setRestore] = useState(() => (mode === "demo" ? restorable("demo", published) : null));

  useEffect(() => {
    suspendReveals();
    document.documentElement.dataset.editing = "";
    if (mode === "demo") useEditor.getState().open(published, { mode: "demo" });
  }, [mode]);

  // the preview changes section heights: re-measure the journey once the DOM has settled
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(refreshScrollMap, 150);
    return () => window.clearTimeout(id);
  }, [active, view]);

  const issues = useMemo(() => (draft ? validateContent(draft) : []), [draft]);
  const changes = useMemo(() => (base && draft ? diffContent(base, draft) : []), [base, draft]);

  // keep the draft in this browser while it differs from what it started from (paused only while the restore
  // choice is open, which is modal: nothing can be edited until it is made)
  useEffect(() => {
    if (!active || !draft || !base || restore) return;
    const id = window.setTimeout(() => {
      writeStorage(STORAGE.draft, changes.length === 0 ? null : JSON.stringify({ base: baseKey(mode, baseSha), savedAt: new Date().toISOString(), draft } satisfies SavedDraft));
    }, 400);
    return () => window.clearTimeout(id);
  }, [active, draft, base, baseSha, mode, restore, changes]);
  const set = useCallback((path: Path, value: unknown) => {
    const current = useEditor.getState().draft;
    if (current) useEditor.getState().setDraft(setIn(current, path, value));
  }, []);
  const api = useMemo<DraftApi | null>(() => (draft ? { draft, issues, set } : null), [draft, issues, set]);

  const onSessionReady = useCallback((repoContent: Content, sha: string) => {
    useEditor.getState().open(repoContent, { mode: "github", baseSha: sha });
    setRestore(restorable(sha, repoContent));
  }, []);

  if (mode === "github") {
    return (
      <GitHubSession onReady={onSessionReady} api={api} changes={changes} issues={issues} resumeFile={resumeFile}>
        {restore ? <RestoreDialog saved={restore} onDone={() => setRestore(null)} /> : null}
      </GitHubSession>
    );
  }

  if (!active || !api) return null;
  return (
    <DraftContext.Provider value={api}>
      <EditBar mode="demo" changes={changes.length} issues={issues.length} canPublish={false} onExit={exitEditMode} />
      <EditorPanel />
      {restore ? <RestoreDialog saved={restore} onDone={() => setRestore(null)} /> : null}
    </DraftContext.Provider>
  );
}

/**
 * The kept draft, offered back before anything else can be edited (a modal dialog: Esc does not dismiss it), so
 * restoring never overwrites new work and nothing typed around it goes unsaved.
 */
function RestoreDialog({ saved, onDone }: { saved: SavedDraft & { stale: boolean }; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    d?.querySelector<HTMLButtonElement>("[data-default]")?.focus();
    return () => {
      if (d?.open) d.close();
    };
  }, []);
  const when = new Date(saved.savedAt);
  const label = Number.isNaN(when.getTime()) ? "earlier" : when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <dialog ref={ref} className={styles.dialog} aria-label="Unpublished changes" onCancel={(e) => e.preventDefault()}>
      <div className={styles.dialogBody}>
        <h2 className={styles.panelTitle}>Unpublished changes</h2>
        <p className={styles.note}>
          This browser kept changes from {label} that were not published.
          {saved.stale ? " They were made on an older version of the site: restoring them replaces what changed since." : ""}
        </p>
        <div className={styles.dialogActions}>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              writeStorage(STORAGE.draft, null);
              onDone();
            }}
          >
            Start fresh
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            data-default=""
            onClick={() => {
              useEditor.getState().setDraft(saved.draft);
              onDone();
            }}
          >
            Restore
          </button>
        </div>
      </div>
    </dialog>
  );
}
