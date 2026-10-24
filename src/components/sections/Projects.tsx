import clsx from "clsx";
import { projects } from "@/data/resume";
import { EXTERNAL, visitLabel } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

/**
 * t = 3 … 3.99. Three stops, one per project, each a full viewport (`[data-project-stop]`) so the sub-stops 3.0 / 3.33
 * / 3.66 land on each card; the iron initials Y, R, S hang in the right half on desktop and above the cards on phones.
 */
export function Projects() {
  return (
    <section id="projects" data-section="projects" aria-labelledby="projects-title" className={clsx("section", styles.projects, styles.split)}>
      <div className={clsx(styles.colLeft, styles.projectList)}>
        {projects.map((project, i) => (
          <div key={project.id} className={styles.projectBlock} data-project-stop={i}>
            {i === 0 ? (
              <div className={clsx("ink-well", styles.projectsHead)}>
                <SectionHeading id="projects" />
              </div>
            ) : null}
            <article id={`project-${project.id}`} className={clsx("card", styles.project)} data-project={project.id} data-initial={project.initial}>
              <p className={clsx("mono", styles.projectTop)}>
                <span>{project.index}</span>
                <span>{project.period}</span>
              </p>
              <h3 className={clsx("hold", styles.projectName)} data-reveal="">
                {project.name}
              </h3>
              <p className={clsx("mono", styles.projectDomain)}>{project.domain}</p>
              <p className={clsx("hold", styles.blurb)} data-reveal="">
                {project.blurb}
              </p>
              <ul className={styles.bullets}>
                {project.bullets.map((bullet) => (
                  <li key={bullet} className="hold" data-reveal="">
                    {bullet}
                  </li>
                ))}
              </ul>
              <ul className={styles.tags} aria-label={`${project.name} tools`}>
                {project.tags.map((tag) => (
                  <li key={tag} className="chip">
                    {tag}
                  </li>
                ))}
              </ul>
              <a href={project.href} className={clsx("btn btn--ghost", styles.visit)} {...EXTERNAL}>
                {visitLabel(project.domain)}
                <span aria-hidden="true" className={styles.arrow}>
                  ↗
                </span>
                <NewTab />
              </a>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}
