import clsx from "clsx";
import { links, profile } from "@/data/resume";
import { withBase } from "@/lib/base";
import { EXTERNAL, prettyUrl } from "./content";
import { EmailButton } from "./EmailButton";
import { LocalTime } from "./LocalTime";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

const rows = [
  { label: "Email", value: profile.email, href: `mailto:${profile.email}`, external: false },
  { label: "Phone", value: profile.phone, href: profile.phoneHref, external: false },
  { label: "LinkedIn", value: prettyUrl(links.linkedin.href), href: links.linkedin.href, external: true },
  { label: "GitHub", value: prettyUrl(links.github.href), href: links.github.href, external: true },
] as const;

/** t = 6. The giant email (copy → toast → mail), the contact rows with live IST, and the résumé button. */
export function Contact() {
  return (
    <section id="contact" data-section="contact" aria-labelledby="contact-title" className={clsx("section", styles.contact)}>
      <div className={clsx("ink-well", styles.contactHead)}>
        <SectionHeading id="contact" />
      </div>
      <div className={clsx("ink-well", styles.emailWrap)}>
        <EmailButton email={profile.email} />
      </div>
      <div className={clsx(styles.split, styles.contactGrid)}>
        <ul className={clsx("ink-well", styles.colLeft, styles.contactRows)}>
          {rows.map((row) => (
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
          <a href={withBase(profile.resumePdf)} className="btn btn--primary" {...EXTERNAL}>
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
