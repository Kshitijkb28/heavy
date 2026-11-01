/** Fixed at the top while editing (it replaces the top bar): what changed, what blocks a publish, and the controls. */
import { useState } from "react";
import type { EditMode } from "@/store/editor";
import { useEditor } from "@/store/editor";
import type { PublishStatus } from "./follow";
import { rememberOpener } from "./preview";
import styles from "./editor.module.css";

export interface EditBarProps {
  mode: EditMode;
  changes: number;
  issues: number;
  /** a status from the publish flow ("Building…", "Live ✓"), shown instead of the counts until the next edit */
  status?: PublishStatus | null;
  canPublish: boolean;
  onPublish?: () => void;
  onExit: () => void;
  onSignOut?: () => void;
}

export function EditBar({ mode, changes, issues, status, canPublish, onPublish, onExit, onSignOut }: EditBarProps) {
  const discard = useEditor((s) => s.discard);
  const setPanel = useEditor((s) => s.setPanel);
  const [confirming, setConfirming] = useState(false);
  const counts = `${changes} change${changes === 1 ? "" : "s"}${issues ? ` · ${issues} to fix` : ""}`;
  const line = status?.text ?? (mode === "demo" ? `Demo · ${counts} · nothing is published` : counts);

  return (
    <div className={styles.bar} role="region" aria-label="Editor">
      <div className={styles.status}>
        <span className={styles.statusTitle}>Editing</span>
        <span className={styles.statusLine} role="status" data-tone={status?.tone ?? (issues ? "error" : undefined)}>
          {line}
        </span>
      </div>
      {status?.action?.kind === "reload" ? (
        <button type="button" className={styles.button} onClick={() => window.location.reload()}>
          {status.action.label}
        </button>
      ) : status?.action?.kind === "link" ? (
        <a className={styles.button} href={status.action.href} target="_blank" rel="noopener noreferrer">
          {status.action.label}
        </a>
      ) : null}
      {confirming ? (
        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.button} ${styles.danger}`}
            onClick={() => {
              discard();
              setConfirming(false);
            }}
          >
            Discard {changes}
          </button>
          <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
            Keep
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.button}
            aria-label="Site settings"
            onClick={(e) => {
              rememberOpener(e.currentTarget);
              setPanel("site");
            }}
          >
            <span aria-hidden="true">⚙</span>
            <span className={styles.wide}>Site</span>
          </button>
          <button type="button" className={styles.button} aria-label="Discard changes" disabled={changes === 0} onClick={() => setConfirming(true)}>
            <span aria-hidden="true">↺</span>
            <span className={styles.wide}>Discard</span>
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            aria-label="Publish"
            disabled={!canPublish}
            title={mode === "demo" ? "Demo mode: publishing is off" : issues ? "Fix the marked fields first" : undefined}
            onClick={onPublish}
          >
            <span aria-hidden="true">↑</span>
            <span className={styles.wide}>Publish</span>
          </button>
          {onSignOut ? (
            <button type="button" className={`${styles.button} ${styles.quiet}`} aria-label="Sign out of editing on this device" onClick={onSignOut}>
              <span aria-hidden="true">⎋</span>
              <span className={styles.wide}>Sign out</span>
            </button>
          ) : null}
          <button type="button" className={`${styles.button} ${styles.quiet}`} aria-label="Leave edit mode" onClick={onExit}>
            <span aria-hidden="true">✕</span>
            <span className={styles.wide}>Exit</span>
          </button>
        </div>
      )}
    </div>
  );
}
