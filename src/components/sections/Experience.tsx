import clsx from "clsx";
import { experience } from "@/data/resume";
import { EXTERNAL } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

/** t = 2. Entries in résumé order; the heading column is sticky on desktop, everything stacks on phones. */
export function Experience() {
  return (
    <section
      id="experience"
      data-section="experience"
      aria-labelledby="experience-title"
      className={clsx("section", styles.experience, styles.split)}
    >
      <div className={clsx("ink-well", styles.colLeft, styles.expHead)}>
        <SectionHeading id="experience" />
      </div>
      <ol className={clsx(styles.colLeft, styles.entries)}>
        {experience.map((job) => (
          <li key={job.id}>
            <article id={`experience-${job.id}`} className={clsx("card", styles.entry)} data-experience={job.id}>
              <header className={styles.entryTop}>
                <span className={clsx("mono", styles.entryIndex)}>{job.index}</span>
                {/* block reveal: a line split would clone the link into an empty, focusable copy */}
                <h3 className={clsx("hold", styles.entryCompany)} data-reveal="block">
                  <a href={job.href} className={styles.plain} {...EXTERNAL}>
                    {job.company}
                    <span aria-hidden="true" className={styles.arrow}>
                      ↗
                    </span>
                    <NewTab />
                  </a>
                </h3>
                <p className={styles.entryRole}>{job.role}</p>
                <p className={clsx("mono", styles.entryMeta)}>
                  {job.location} · {job.period}
                </p>
              </header>
              <ul className={styles.bullets}>
                {job.bullets.map((bullet) => (
                  <li key={bullet} className="hold" data-reveal="">
                    {bullet}
                  </li>
                ))}
              </ul>
              <ul className={styles.tags} aria-label={`${job.company} tools`}>
                {job.tags.map((tag) => (
                  <li key={tag} className="chip">
                    {tag}
                  </li>
                ))}
              </ul>
            </article>
          </li>
        ))}
      </ol>
    </section>
  );
}
