"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The browser pieces `copyText` touches, injectable for tests. */
export interface ClipboardEnv {
  navigator?: { clipboard?: { writeText?: (text: string) => Promise<void> } };
  document?: Document;
}

const defaultEnv = (): ClipboardEnv => ({
  navigator: typeof navigator === "undefined" ? undefined : (navigator as ClipboardEnv["navigator"]),
  document: typeof document === "undefined" ? undefined : document,
});

/**
 * Copies `text`: the async Clipboard API first (secure contexts), then the hidden-textarea + `execCommand("copy")`
 * fallback (file:// previews, older WebViews). Resolves `true` when something copied, never throws.
 */
export async function copyText(text: string, env: ClipboardEnv = defaultEnv()): Promise<boolean> {
  const write = env.navigator?.clipboard?.writeText;
  if (write) {
    try {
      await write.call(env.navigator!.clipboard, text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  const doc = env.document;
  if (!doc?.body) return false;
  try {
    const area = doc.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.setAttribute("aria-hidden", "true");
    area.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none";
    doc.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = doc.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export interface Clipboard {
  /** true for `resetMs` after a successful copy */
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  /** clears `copied` early */
  reset: () => void;
}

/** Copy-to-clipboard with a `copied` flag that clears itself after `resetMs` (and on unmount). */
export function useClipboard(resetMs = 2000): Clipboard {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setCopied(false);
  }, []);

  const copy = useCallback(
    async (text: string) => {
      const ok = await copyText(text);
      clearTimeout(timer.current);
      setCopied(ok);
      if (ok) timer.current = setTimeout(() => setCopied(false), resetMs);
      return ok;
    },
    [resetMs],
  );

  return { copied, copy, reset };
}
