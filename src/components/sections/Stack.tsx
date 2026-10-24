import clsx from "clsx";
import { skills } from "@/data/resume";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/**
 * t = 4. Five rows, one per skill group (17 chips; JavaScript twice, as on the résumé). Each row is
 * `li[data-row-index="0…4"]` inside `[data-stack-rows]`; on desktop the rows share the column height evenly so U4's
 * five tubes can sit level with them (row i's centre ≈ (i + 0.5) / 5 of the list height).
 */
export function Stack() {
  return (
    <section id="stack" data-section="stack" aria-labelledby="stack-title" className={clsx("section", styles.stack, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.stackCol)}>
        <SectionHeading id="stack" />
        <ol className={styles.rows} data-stack-rows="">
          {skills.map((group, i) => (
            <li key={group.id} className={styles.rowItem} data-row-index={i} data-skill={group.id}>
              <h3 className={styles.rowLabel}>
                <span className={clsx("mono", styles.rowIndex)}>{String(i + 1).padStart(2, "0")}</span>
                {group.label}
              </h3>
              <ul className={styles.tags} aria-label={`${group.label} tools`}>
                {group.items.map((item, j) => (
                  <li key={`${item}-${j}`} className="chip">
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
