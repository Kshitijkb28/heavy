import clsx from "clsx";
import type { SectionId } from "@/lib/contracts";
import { placeById } from "@/data/derived";
import styles from "./sections.module.css";

export type ContentSectionId = Exclude<SectionId, "hero" | "footer">;

/**
 * Index · label, the two-tone Anton title (the h2 is the section's `aria-labelledby` target, id `<section>-title`)
 * and the mono annotation, laid out with U1's `.section__head/__index/__title/__annotation` contract. Each title part
 * is its own block reveal (U7 `data-reveal="block"`, the second 40 ms later) so no SplitText runs over nested spans.
 */
export function SectionHeading({ id, className }: { id: ContentSectionId; className?: string }) {
  const place = placeById[id];
  const meta = place.meta;
  const [light, bold] = meta?.title ?? [place.label, ""];
  return (
    <header className={clsx("section__head", styles.head, className)}>
      <p className={clsx("section__index mono", styles.headIndex)}>
        <span className={styles.headCode}>{place.code}</span>
        <span className={styles.headLabel}>{meta?.label ?? place.label}</span>
      </p>
      <h2 id={`${id}-title`} className={clsx("section__title", styles.title)}>
        <span className={clsx("hold", styles.titleA)} data-reveal="block">
          {light}
        </span>{" "}
        <span className={clsx("hold", styles.titleB)} data-reveal="block" data-reveal-delay="40">
          {bold}
        </span>
      </h2>
      {meta?.annotation ? <p className={clsx("section__annotation mono", styles.annotation)}>{meta.annotation}</p> : null}
    </header>
  );
}
