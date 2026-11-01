"use client";

/**
 * The owner's way into edit mode, in the top bar. Visitors get nothing: it renders null on the server and on the first
 * client paint. A signed-in tab (or a device that chose "Remember") shows "Edit"; `?edit` opens edit mode (sign-in
 * first if needed); `?edit=demo` edits a local draft that cannot publish, in development and in builds made with
 * NEXT_PUBLIC_EDITOR_DEMO=1 only. The editor itself is a separate chunk, fetched on the way in; a tab left open across
 * a deploy (its chunk names are gone) reloads once to pick up the new ones.
 */
import { useCallback, useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import { createPortal } from "react-dom";
import type { EditMode } from "@/store/editor";
import { readToken } from "./token";

const DEMO_ALLOWED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_EDITOR_DEMO === "1";

type Root = { Component: ComponentType<{ mode: EditMode }>; mode: EditMode };

const onStorage = (change: () => void) => {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
};
const hasToken = () => !!readToken();
const RELOADED = "heavy:editor-reloaded";

/** The editor chunk did not load: reload once (a deploy renamed the chunks), then say so instead of retrying for ever. */
function recover(fail: () => void) {
  try {
    if (!window.sessionStorage.getItem(RELOADED)) {
      window.sessionStorage.setItem(RELOADED, "1");
      window.location.reload();
      return;
    }
  } catch {
    // no storage: fall through to the message
  }
  fail();
}
const loaded = () => {
  try {
    window.sessionStorage.removeItem(RELOADED);
  } catch {
    // nothing to clear
  }
};
const noToken = () => false;

export function EditEntry({ className }: { className?: string }) {
  // false on the server and at hydration (the HTML never has the button), the browser's answer right after
  const signedIn = useSyncExternalStore(onStorage, hasToken, noToken);
  const [root, setRoot] = useState<Root | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const launch = useCallback((mode: EditMode) => {
    import("./EditorRoot")
      .then(({ EditorRoot }) => {
        loaded();
        setRoot({ Component: EditorRoot, mode });
      })
      .catch(() => recover(() => setFailed(true)));
  }, []);

  // `?edit` / `?edit=demo` open edit mode as soon as the page has hydrated
  useEffect(() => {
    const edit = new URLSearchParams(window.location.search).get("edit");
    const mode: EditMode | null = edit === "demo" ? (DEMO_ALLOWED ? "demo" : null) : edit !== null ? "github" : null;
    if (!mode) return;
    let alive = true;
    import("./EditorRoot")
      .then(({ EditorRoot }) => {
        loaded();
        if (alive) setRoot({ Component: EditorRoot, mode });
      })
      .catch(() => recover(() => alive && setFailed(true)));
    return () => {
      alive = false;
    };
  }, []);

  if (root) return createPortal(<root.Component mode={root.mode} />, document.body);
  if (failed) {
    return (
      <button type="button" className={className} onClick={() => window.location.reload()}>
        Editor failed to load · Reload
      </button>
    );
  }
  if (!signedIn) return null;
  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      aria-label="Edit this site"
      onClick={() => {
        setLoading(true);
        launch("github");
      }}
    >
      {loading ? "Opening…" : "Edit"}
    </button>
  );
}
