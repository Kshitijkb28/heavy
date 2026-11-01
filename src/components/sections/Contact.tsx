import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { EXTERNAL } from "./content";
import { EmailButton } from "./EmailButton";
import { LocalTime } from "./LocalTime";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

/** t = 6. The giant email (copy → toast → mail), the contact rows with live local time, and the résumé button. */
export function Contact({ view, reveal = true, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  const { profile } = view;
  return (
    <section id="contact" data-section="contact" aria-labelledby="contact-title" className={clsx("section", styles.contact)}>
      <div className={clsx("ink-well", styles.contactHead)}>
        <SectionHeading id="contact" meta={view.sections.contact} reveal={reveal} action={action} />
      </div>
      <div className={clsx("ink-well", styles.emailWrap)}>
        <EmailButton email={profile.email} />
      </div>
      <div className={clsx(styles.split, styles.contactGrid)}>
        <ul className={clsx("ink-well", styles.colLeft, styles.contactRows)}>
          {view.contactRows.map((row) => (
            <li key={row.label} className={clsx("row", styles.contactRow)}>
              <span className={clsx("mono", styles.contactLabel)}>{row.label}</span>
              <a href={row.href} className={styles.contactValue} {...(row.external ? EXTERNAL : {})}>
                {row.value}
                {row.external ? (
                  <span aria-hidden="true" className={styles.arrow}>
                    ↗
                  </span>
                ) : null}
                {row.external ? <NewTab /> : null}
              </a>
            </li>
          ))}
          <li className={clsx("row", styles.contactRow)}>
            <span className={clsx("mono", styles.contactLabel)}>Location</span>
            <span className={styles.contactValue}>
              {profile.location}
              <LocalTime timeZone={profile.timezone} className={clsx("mono", styles.time)} />
            </span>
          </li>
        </ul>
        <div className={clsx("ink-well", styles.colRight, styles.contactActions)}>
          <a href={view.resumeHref} className="btn btn--primary" {...EXTERNAL}>
            Résumé (PDF)
            <span aria-hidden="true" className={styles.arrow}>
              ↗
            </span>
            <NewTab />
          </a>
        </div>
      </div>
    </section>
  );
}
