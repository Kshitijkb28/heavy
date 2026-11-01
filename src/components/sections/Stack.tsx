import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/**
 * t = 4. One row per skill group (chips may repeat across groups, as JavaScript does on the résumé). Each row is
 * `li[data-row-index]` inside `[data-stack-rows]`; on desktop the rows share the column height evenly so U4's tubes
 * (one per group) sit beside them.
 */
export function Stack({ view, reveal = true, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  return (
    <section id="stack" data-section="stack" aria-labelledby="stack-title" className={clsx("section", styles.stack, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.stackCol)}>
        <SectionHeading id="stack" meta={view.sections.stack} reveal={reveal} action={action} />
        <ol className={styles.rows} data-stack-rows="">
          {view.skills.map((group, i) => (
            <li key={group.id} className={styles.rowItem} data-row-index={i} data-skill={group.id}>
              <h3 className={styles.rowLabel}>
                <span className={clsx("mono", styles.rowIndex)}>{String(i + 1).padStart(2, "0")}</span>
                {group.label}
              </h3>
              <ul className={styles.tags} aria-label={`${group.label} tools`}>
                {group.items.map((item, j) => (
                  <li key={j} className="chip">
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
