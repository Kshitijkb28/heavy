/**
 * The open section's form: a side panel over the 3D half from 64rem (the text column stays visible beside it), a
 * bottom-sheet `<dialog>` below (`showModal`: native focus trap, Esc, focus back to the Edit button, the
 * src/components/chrome/StageSheet.tsx pattern). Esc closes the side panel too.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { DESKTOP, useMediaQuery } from "@/hooks/useMediaQuery";
import { useEditor } from "@/store/editor";
import { PANELS } from "./forms";
import { takeOpener } from "./preview";
import styles from "./editor.module.css";

function focusFirstField(root: HTMLElement | null) {
  root?.querySelector<HTMLElement>("input, textarea, select, button:not([data-close])")?.focus({ preventScroll: true });
}

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    focusFirstField(d);
    return () => {
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog ref={ref} id="editor-panel" className={styles.sheet} aria-labelledby="editor-panel-title" onClose={onClose}>
      {children}
    </dialog>
  );
}

export function EditorPanel() {
  const panel = useEditor((s) => s.panel);
  const setPanel = useEditor((s) => s.setPanel);
  const desktop = useMediaQuery(DESKTOP);
  const asideRef = useRef<HTMLElement>(null);

  const close = () => {
    setPanel(null);
    const back = takeOpener();
    requestAnimationFrame(() => back?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (panel && desktop) focusFirstField(asideRef.current);
  }, [panel, desktop]);

  if (!panel) return null;
  const { title, Form } = PANELS[panel];
  const content = (
    <>
      <div className={styles.panelHead}>
        <h2 id="editor-panel-title" className={styles.panelTitle}>
          {title}
        </h2>
        <button type="button" className={`${styles.button} ${styles.icon}`} data-close="" aria-label={`Close ${title}`} onClick={close}>
          ✕
        </button>
      </div>
      <div className={styles.panelBody}>
        <Form />
      </div>
    </>
  );

  if (!desktop) return <Sheet onClose={close}>{content}</Sheet>;
  return (
    <aside
      ref={asideRef}
      id="editor-panel"
      className={styles.panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby="editor-panel-title"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          close();
        }
      }}
    >
      {content}
    </aside>
  );
}
