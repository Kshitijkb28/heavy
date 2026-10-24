"use client";

import clsx from "clsx";
import { useUI } from "@/store/ui";
import styles from "./sections.module.css";

/** "Hold a letter to grab it" under the hanging name; U3 dismisses it after the first grab, the poster hides it. */
export function HeroHint() {
  const dismissed = useUI((s) => s.hintDismissed);
  const poster = useUI((s) => s.poster);
  const hidden = dismissed || poster;
  return (
    <p className={clsx("hero-hint mono", styles.hint)} data-hidden={hidden ? "true" : undefined} aria-hidden={hidden || undefined}>
      Hold a letter to grab it
    </p>
  );
}
