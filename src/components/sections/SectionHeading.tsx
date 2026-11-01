import clsx from "clsx";
import type { ReactNode } from "react";
import type { SectionId } from "@/lib/contracts";
import type { SectionMeta } from "@/data/view";
import { holds } from "./content";
import styles from "./sections.module.css";

export type ContentSectionId = Exclude<SectionId, "hero" | "footer">;

/**
 * Index · label, the two-tone Anton title (the h2 is the section's `aria-labelledby` target, id `<section>-title`)
 * and the mono annotation, laid out with U1's `.section__head/__index/__title/__annotation` contract. Each title part
 * is its own block reveal (U7 `data-reveal="block"`, the second 40 ms later) so no SplitText runs over nested spans.
 * `action` is the editor's Edit button (preview only).
 */
export function SectionHeading({
  id,
  meta,
  reveal = true,
  action,
  className,
}: {
  id: ContentSectionId;
  meta: SectionMeta;
  reveal?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  const [light, bold] = meta.title;
  const r = holds(reveal);
  return (
    <header className={clsx("section__head", styles.head, className)}>
      <p className={clsx("section__index mono", styles.headIndex)}>
        <span className={styles.headCode}>{meta.index}</span>
        <span className={styles.headLabel}>{meta.label}</span>
      </p>
      <h2 id={`${id}-title`} className={clsx("section__title", styles.title)}>
        <span className={clsx(r.cls, styles.titleA)} {...r.at("block")}>
          {light}
        </span>{" "}
        <span className={clsx(r.cls, styles.titleB)} {...r.at("block", 40)}>
          {bold}
        </span>
      </h2>
      {meta.annotation ? <p className={clsx("section__annotation mono", styles.annotation)}>{meta.annotation}</p> : null}
      {action}
    </header>
  );
}
