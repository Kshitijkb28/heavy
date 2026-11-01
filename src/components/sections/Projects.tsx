import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { EXTERNAL, holds, visitLabel } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

/**
 * t = 3 … 3.99. One stop per project, each a full viewport (`[data-project-stop]`), so the sub-stops 3 + i/n land on
 * each card; the iron initials hang in the right half on desktop and above the cards on phones.
 */
export function Projects({ view, reveal = true, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  const r = holds(reveal);
  return (
    <section id="projects" data-section="projects" aria-labelledby="projects-title" className={clsx("section", styles.projects, styles.split)}>
      <div className={clsx(styles.colLeft, styles.projectList)}>
        {view.projects.map((project, i) => (
          <div key={project.id} className={styles.projectBlock} data-project-stop={i}>
            {i === 0 ? (
              <div className={clsx("ink-well", styles.projectsHead)}>
                <SectionHeading id="projects" meta={view.sections.projects} reveal={reveal} action={action} />
              </div>
            ) : null}
            <article id={`project-${project.id}`} className={clsx("card", styles.project)} data-project={project.id} data-initial={project.initial}>
              <p className={clsx("mono", styles.projectTop)}>
                <span>{project.index}</span>
                <span>{project.period}</span>
              </p>
              <h3 className={clsx(r.cls, styles.projectName)} {...r.at()}>
                {project.name}
              </h3>
              {project.domain ? <p className={clsx("mono", styles.projectDomain)}>{project.domain}</p> : null}
              <p className={clsx(r.cls, styles.blurb)} {...r.at()}>
                {project.blurb}
              </p>
              <ul className={styles.bullets}>
                {project.bullets.map((bullet, j) => (
                  <li key={j} className={r.cls} {...r.at()}>
                    {bullet}
                  </li>
                ))}
              </ul>
              <ul className={styles.tags} aria-label={`${project.name} tools`}>
                {project.tags.map((tag, j) => (
                  <li key={j} className="chip">
                    {tag}
                  </li>
                ))}
              </ul>
              {project.href ? (
                <a href={project.href} className={clsx("btn btn--ghost", styles.visit)} {...EXTERNAL}>
                  {visitLabel(project.domain ?? project.name)}
                  <span aria-hidden="true" className={styles.arrow}>
                    ↗
                  </span>
                  <NewTab />
                </a>
              ) : null}
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
