import content from "@content";
import { parseContent } from "@/data/schema";
import { deriveView } from "@/data/view";
import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { Stack } from "@/components/sections/Stack";
import { Education } from "@/components/sections/Education";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";
import { EditSlot } from "@/components/editor/EditSlot";

/** Checked once per build: an invalid `content.json` fails here, so a bad edit never deploys (the live site keeps the last good one). */
const view = deriveView(parseContent(content));

/**
 * Server component: the whole page is static DOM over the fixed stage mounted by the layout. The seven places live in
 * `<main class="page">` (pointer policy: only text and controls catch the pointer, so grabs reach the canvas); the
 * footer sits after `main` so it is a real `contentinfo` landmark and still carries `data-section="footer"` (t = 7).
 * Each section sits in an `EditSlot`: no extra DOM; while the in-page editor is open it renders the draft instead.
 */
export default function Page() {
  return (
    <>
      {/* tabIndex -1: the skip link moves focus here, not only the scroll position */}
      <main id="content" className="page" tabIndex={-1}>
        <EditSlot id="hero">
          <Hero view={view} />
        </EditSlot>
        <EditSlot id="about">
          <About view={view} />
        </EditSlot>
        <EditSlot id="experience">
          <Experience view={view} />
        </EditSlot>
        <EditSlot id="projects">
          <Projects view={view} />
        </EditSlot>
        <EditSlot id="stack">
          <Stack view={view} />
        </EditSlot>
        <EditSlot id="education">
          <Education view={view} />
        </EditSlot>
        <EditSlot id="contact">
          <Contact view={view} />
        </EditSlot>
      </main>
      <EditSlot id="footer">
        <Footer view={view} />
      </EditSlot>
    </>
  );
}
