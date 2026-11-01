import { profile } from "@/data/resume";
import { EditEntry } from "@/components/editor/EditEntry";
import s from "./TopBar.module.css";

/**
 * Fixed top chrome on a scrim gradient (no bar): the name as text — always readable, the home link — and "Résumé ↗".
 * 44 px targets, safe-area insets. Server component: the home link is a plain anchor the SmoothScroll delegate flies.
 * `EditEntry` is the owner's "Edit" (nothing for visitors); the edit bar replaces this bar while editing.
 */
export function TopBar({ resumeHref }: { resumeHref: string }) {
  return (
    <header className={s.bar} data-topbar="">
      <a href="#hero" className={`mono ${s.link}`}>
        <span className={s.lamp} aria-hidden="true" />
        {profile.name}
      </a>
      <EditEntry className={`mono ${s.link} ${s.edit}`} />
      <a href={resumeHref} className={`mono ${s.link} ${s.resume}`} target="_blank" rel="noopener noreferrer">
        Résumé
        <span className={s.arrow} aria-hidden="true">
          ↗
        </span>
        <span className="sr-only">(PDF, opens in a new tab)</span>
      </a>
    </header>
  );
}
