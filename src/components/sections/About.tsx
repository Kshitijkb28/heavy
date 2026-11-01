import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { EXTERNAL, holds } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/** t = 1. Summary, the Now line (company linked in place), facts 2×2 and stats; right 55 % on desktop, under the lamp on phones. */
export function About({ view, reveal = true, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  const { profile } = view;
  const now = view.about.nowParts;
  const r = holds(reveal);
  return (
    <section id="about" data-section="about" aria-labelledby="about-title" className={clsx("section", styles.about, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.aboutCol)}>
        <SectionHeading id="about" meta={view.sections.about} reveal={reveal} action={action} />
        <div className={styles.prose}>
          {profile.summary.map((paragraph, i) => (
            <p key={i} className={r.cls} {...r.at()}>
              {paragraph}
            </p>
          ))}
        </div>
        <p className={styles.now}>
          <span className={clsx("mono", styles.nowLabel)}>{profile.now?.label ?? "Now"}</span>
          <span className={r.cls} {...r.at()}>
            {now && profile.now?.href ? (
              <>
                {now[0]}
                {/* inside a verbatim résumé sentence: the new-tab note is a description, not extra words in the sentence */}
                <a href={profile.now.href} className={styles.link} {...EXTERNAL} aria-describedby="about-now-newtab">
                  {now[1]}
                </a>
                {now[2]}
              </>
            ) : (
              profile.nowLine
            )}
          </span>
        </p>
          <span id="about-now-newtab" hidden>
            Opens in a new tab
          </span>
        <dl className={styles.facts}>
          {view.facts.map((fact, i) => (
            <div key={i} className={styles.fact}>
              <dt className={clsx("mono", styles.factLabel)}>{fact.label}</dt>
              <dd className={styles.factValue}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <ul className={styles.stats}>
          {view.stats.map((stat) => (
            <li key={stat.label} className={styles.stat}>
              <span className={styles.statValue}>
                {stat.value}
                {stat.suffix ? <span className={styles.statSuffix}>{stat.suffix}</span> : null}
              </span>
              <span className={clsx("mono", styles.statLabel)}>{stat.label}</span>
              {stat.caption ? <span className={styles.statCaption}>{stat.caption}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
