/** The page's sections rendered from the draft (no reveal holds: React re-renders this text as you type), each with its Edit button. */
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { Stack } from "@/components/sections/Stack";
import { Education } from "@/components/sections/Education";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";
import type { SiteView } from "@/data/view";
import type { PanelId } from "@/lib/content-diff";
import { useEditor } from "@/store/editor";
import type { SlotId } from "./slots";
import styles from "./editor.module.css";

let opener: HTMLElement | null = null;

/** Whatever opened a panel outside the sections (the edit bar's Site button) gets focus back too. */
export function rememberOpener(el: HTMLElement | null): void {
  opener = el;
}

/** The Edit button that opened the current panel, for focus to return to when it closes. */
export function takeOpener(): HTMLElement | null {
  const el = opener;
  opener = null;
  return el;
}

function EditButton({ panel, label }: { panel: PanelId; label: string }) {
  const open = useEditor((s) => s.panel === panel);
  const setPanel = useEditor((s) => s.setPanel);
  return (
    <button
      type="button"
      className={styles.editButton}
      aria-expanded={open}
      aria-controls="editor-panel"
      data-edit-panel={panel}
      onClick={(e) => {
        opener = e.currentTarget;
        setPanel(open ? null : panel);
      }}
    >
      <span aria-hidden="true">✎</span> Edit {label}
    </button>
  );
}

/** One section from the draft view (registered with `setPreview`; returns elements, calls no hooks). */
export function renderPreview(id: SlotId, view: SiteView) {
  switch (id) {
    case "hero":
      return <Hero view={view} reveal={false} action={<EditButton panel="hero" label="intro" />} />;
    case "about":
      return <About view={view} reveal={false} action={<EditButton panel="about" label="about" />} />;
    case "experience":
      return <Experience view={view} reveal={false} action={<EditButton panel="experience" label="experience" />} />;
    case "projects":
      return <Projects view={view} reveal={false} action={<EditButton panel="projects" label="projects" />} />;
    case "stack":
      return <Stack view={view} reveal={false} action={<EditButton panel="stack" label="stack" />} />;
    case "education":
      return <Education view={view} reveal={false} action={<EditButton panel="education" label="education" />} />;
    case "contact":
      return <Contact view={view} reveal={false} action={<EditButton panel="contact" label="contact" />} />;
    default:
      return <Footer view={view} reveal={false} />;
  }
}
