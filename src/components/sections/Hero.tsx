import clsx from "clsx";
import type { ReactNode } from "react";
import type { SiteView } from "@/data/view";
import { EXTERNAL } from "./content";
import { HeroHint } from "./HeroHint";
import { PushButton } from "@/components/scene/physics/PushButton";
import styles from "./sections.module.css";
import { NewTab } from "./NewTab";

/**
 * t = 0. The h1 is server text and the LCP; it fades under `html[data-handoff="on"]` (U7) once the iron letters have
 * dropped, and stays in the DOM. The band (`[data-hero-band]`) is the space reserved for the 3D name: top 58 % on
 * desktop, top 55svh on phones. Hook + CTAs sit bottom-left on an ink well; the push button bottom-right.
 * Nothing in the hero is a reveal hold, so `reveal` changes nothing here; `action` is the editor's Edit button.
 */
export function Hero({ view, action }: { view: SiteView; reveal?: boolean; action?: ReactNode }) {
  const { profile, hero } = view;
  return (
    <section id="hero" data-section="hero" aria-labelledby="hero-title" className={clsx("section hero", styles.hero)}>
      <div className={styles.band} data-hero-band="">
        <p className={clsx("eyebrow", styles.eyebrow)}>{profile.eyebrow}</p>
        <h1 id="hero-title" className={clsx("hero-name", styles.name)}>
          <span className="hero-line">{hero.nameRows[0]}</span>
          <span className="hero-line">{hero.nameRows[1]}</span>
        </h1>
        <div className={styles.tools}>
          <HeroHint />
          <PushButton />
        </div>
      </div>
      <div className={clsx("ink-well", styles.copy)}>
        {action}
        <p className={clsx("hero-hook", styles.hook)}>{profile.hook}</p>
        <div className={clsx("hero-ctas", styles.ctas)}>
          {hero.ctas.map((cta, i) => (
            <a
              key={cta.label}
              id={`hero-cta-${i + 1}`}
              href={cta.href}
              className={clsx("btn", `btn--${cta.variant}`, styles.cta)}
              {...(cta.external ? EXTERNAL : {})}
            >
              {cta.label}
              {cta.external ? (
                <span aria-hidden="true" className={styles.arrow}>
                  ↗
                </span>
              ) : null}
              {cta.external ? <NewTab /> : null}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
