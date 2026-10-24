"use client";

import clsx from "clsx";
import { useCallback } from "react";
import { useClipboard } from "@/hooks/useClipboard";
import { useUI } from "@/store/ui";
import { splitEmail } from "./content";
import styles from "./sections.module.css";

const ARM_MS = 6000;

/**
 * The giant email (Anton, mercury, raked by the beacon via U1's `.giant-email`): the first click copies the address and
 * toasts "Email copied"; a second click within 6 s opens the mail app. If the clipboard is unavailable it opens mail
 * straight away. The text content is exactly `profile.email`; a `<wbr>` lets the @ break on phones.
 */
export function EmailButton({ email }: { email: string }) {
  const { copied, copy, reset } = useClipboard(ARM_MS);
  const showToast = useUI((s) => s.showToast);
  const { local, domain } = splitEmail(email);
  const mailto = `mailto:${email}`;

  const onClick = useCallback(async () => {
    if (copied) {
      reset();
      window.location.href = mailto;
      return;
    }
    const ok = await copy(email);
    if (ok) showToast("Email copied");
    else window.location.href = mailto;
  }, [copied, copy, email, mailto, reset, showToast]);

  return (
    <>
      <button
        type="button"
        className={clsx("giant-email", styles.email)}
        onClick={onClick}
        data-copied={copied ? "true" : undefined}
        aria-describedby="contact-email-hint"
      >
        <span className={styles.emailLocal}>{local}</span>
        <wbr />
        <span className={styles.emailDomain}>@{domain}</span>
      </button>
      <p id="contact-email-hint" className={clsx("mono", styles.emailHint)}>
        {copied ? "Copied — press again to open your mail app" : "Press to copy"}
      </p>
    </>
  );
}
