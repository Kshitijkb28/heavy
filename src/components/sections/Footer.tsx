import clsx from "clsx";
import { SITE, links, profile } from "@/data/resume";
import { EXTERNAL } from "./content";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

const footerLinks = [links.linkedin, links.github, links.site] as const;

/** t = 7, the last mark on the track: name · role, location · ©, links, Back to top (a real `contentinfo`, outside `main`). */
export function Footer() {
  return (
    <footer id="footer" data-section="footer" className={clsx("footer", styles.footer)}>
      <div className={clsx("ink-well", styles.footerInner)}>
        <div className={styles.footerId}>
          <p className={styles.footerName}>
            {profile.name}
            <span className={styles.footerRole}> · {profile.role}</span>
          </p>
          <p className={clsx("mono", styles.footerMeta)}>
            {profile.location} · © {SITE.year}
          </p>
        </div>
        <ul className={styles.footerLinks}>
          {footerLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={clsx("btn btn--link", styles.footerLink)} {...EXTERNAL}>
                {link.label}
                <span aria-hidden="true" className={styles.arrow}>
                  ↗
                </span>
                <NewTab />
              </a>
            </li>
          ))}
        </ul>
        <a href="#hero" className={clsx("btn btn--ghost", styles.toTop)}>
          Back to top
          <span aria-hidden="true" className={styles.arrow}>
            ↑
          </span>
        </a>
      </div>
    </footer>
  );
}
