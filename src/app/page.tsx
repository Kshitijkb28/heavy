import { Hero } from "@/components/sections/Hero";
import { About } from "@/components/sections/About";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { Stack } from "@/components/sections/Stack";
import { Education } from "@/components/sections/Education";
import { Contact } from "@/components/sections/Contact";
import { Footer } from "@/components/sections/Footer";

/**
 * Server component: the whole page is static DOM over the fixed stage mounted by the layout. The seven places live in
 * `<main class="page">` (pointer policy: only text and controls catch the pointer, so grabs reach the canvas); the
 * footer sits after `main` so it is a real `contentinfo` landmark and still carries `data-section="footer"` (t = 7).
 */
export default function Page() {
  return (
    <>
      {/* tabIndex -1: the skip link moves focus here, not only the scroll position */}
      <main id="content" className="page" tabIndex={-1}>
        <Hero />
        <About />
        <Experience />
        <Projects />
        <Stack />
        <Education />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
