import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { holds } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/** t = 5. One row per entry: period, school, degree · field, score — text in the left half; the door at the far wall lights the right. */
export function Education({ view, reveal = true, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  const r = holds(reveal);
  return (
    <section id="education" data-section="education" aria-labelledby="education-title" className={clsx("section", styles.education, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.eduCol)}>
        <SectionHeading id="education" meta={view.sections.education} reveal={reveal} action={action} />
        <ol className={styles.eduRows}>
          {view.education.map((entry) => (
            <li key={entry.id} className={styles.eduRow} data-education={entry.id}>
              <p className={clsx("mono", styles.eduPeriod)}>{entry.period}</p>
              <h3 className={clsx(r.cls, styles.eduSchool)} {...r.at()}>
                {entry.school}
              </h3>
              <p className={styles.eduDegree}>
                {entry.degree} · {entry.field}
              </p>
              {entry.score ? (
                <p className={styles.eduScore}>
                  <span className={clsx("mono", styles.eduScoreLabel)}>Score</span>
                  {entry.score}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
