import clsx from "clsx";
import { facts, profile, stats } from "@/data/resume";
import { EXTERNAL, splitOnce } from "./content";
import { SectionHeading } from "./SectionHeading";
import styles from "./sections.module.css";

/** t = 1. Summary, the Now line (company linked in place), facts 2×2 and stats; right 55 % on desktop, under the lamp on phones. */
export function About() {
  const now = splitOnce(profile.nowLine, profile.now.company);
  return (
    <section id="about" data-section="about" aria-labelledby="about-title" className={clsx("section", styles.about, styles.split)}>
      <div className={clsx("ink-well", styles.colLeft, styles.aboutCol)}>
        <SectionHeading id="about" />
        <div className={styles.prose}>
          {profile.summary.map((paragraph) => (
            <p key={paragraph} className="hold" data-reveal="">
              {paragraph}
            </p>
          ))}
        </div>
        <p className={styles.now}>
          <span className={clsx("mono", styles.nowLabel)}>{profile.now.label}</span>
          <span className="hold" data-reveal="">
            {now ? (
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
          {facts.map((fact) => (
            <div key={fact.label} className={styles.fact}>
              <dt className={clsx("mono", styles.factLabel)}>{fact.label}</dt>
              <dd className={styles.factValue}>{fact.value}</dd>
            </div>
          ))}
        </dl>
        <ul className={styles.stats}>
          {stats.map((stat) => (
            <li key={stat.label} className={styles.stat}>
              <span className={styles.statValue}>
                {stat.value}
                {stat.suffix ? <span className={styles.statSuffix}>{stat.suffix}</span> : null}
              </span>
              <span className={clsx("mono", styles.statLabel)}>{stat.label}</span>
              {"caption" in stat ? <span className={styles.statCaption}>{stat.caption}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
