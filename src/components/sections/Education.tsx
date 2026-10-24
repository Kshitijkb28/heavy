import clsx from "clsx";
import { education } from "@/data/resume";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/** t = 5. Two rows: period, school, degree · field, score — text in the left half; the door at the far wall lights the right. */
export function Education() {
  return (
    <section id="education" data-section="education" aria-labelledby="education-title" className={clsx("section", styles.education, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.eduCol)}>
        <SectionHeading id="education" />
        <ol className={styles.eduRows}>
          {education.map((entry) => (
            <li key={entry.id} className={styles.eduRow} data-education={entry.id}>
              <p className={clsx("mono", styles.eduPeriod)}>{entry.period}</p>
              <h3 className={clsx("hold", styles.eduSchool)} data-reveal="">
                {entry.school}
              </h3>
              <p className={styles.eduDegree}>
                {entry.degree} · {entry.field}
              </p>
              <p className={styles.eduScore}>
                <span className={clsx("mono", styles.eduScoreLabel)}>Score</span>
                {entry.score}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
