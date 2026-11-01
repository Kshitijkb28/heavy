import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";
import { SECTION_ORDER } from "@/lib/contracts";
import { NAME_ROWS } from "@/data/derived";
import { SITE, content, education, experience, facts, links, profile, projects, sections as sectionMeta, skills, stats } from "@/data/resume";
import { deriveView } from "@/data/view";
import { Experience } from "./Experience";
import { Projects } from "./Projects";
import { Education } from "./Education";
import { Contact } from "./Contact";

const decode = (s: string) =>
  s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The page as the server sends it (no browser globals may be touched during render, or this throws). */
const html = decode(renderToStaticMarkup(createElement(Page)));
const text = html.replace(/<[^>]+>/g, "");
const slice = (fromId: string, toId: string) => html.slice(html.indexOf(`id="${fromId}"`), html.indexOf(`id="${toId}"`));

describe("sections DOM", () => {
  it("renders every section in order with data-section, ids and labelled headings", () => {
    const order = [...html.matchAll(/data-section="([a-z]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...SECTION_ORDER]);
    for (const id of SECTION_ORDER) expect(html).toContain(`id="${id}"`);
    const labelled = [...html.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(labelled).toHaveLength(7);
    for (const target of labelled) expect(html).toContain(`id="${target}"`);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<h2\b/g)).toHaveLength(6);
  });

  it("keeps the footer outside main as a contentinfo landmark", () => {
    expect(html.indexOf("</main>")).toBeGreaterThan(0);
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
    expect(html).toContain('<main id="content" class="page" tabindex="-1">');
  });

  it("contains every résumé string verbatim", () => {
    const strings = [
      ...NAME_ROWS,
      profile.name,
      profile.role,
      profile.eyebrow,
      profile.hook,
      ...profile.summary,
      profile.nowLine,
      profile.email,
      profile.phone,
      profile.location,
      ...facts.flatMap((f) => [f.label, f.value]),
      ...stats.flatMap((s) => [s.label, "caption" in s ? s.caption : ""]),
      ...experience.flatMap((j) => [j.index, j.company, j.role, j.location, j.period, ...j.bullets, ...j.tags]),
      ...projects.flatMap((p) => [p.index, p.name, p.domain, p.period, p.blurb, ...p.bullets, ...p.tags]),
      ...skills.flatMap((g) => [g.label, ...g.items]),
      ...education.flatMap((e) => [e.school, e.degree, e.field, e.score, e.period]),
      ...sectionMeta.flatMap((s) => [s.index, s.label, s.title.join(" "), s.annotation ?? ""]),
      String(SITE.year),
      links.site.label,
    ].filter(Boolean);
    for (const s of strings) expect(text, s).toContain(s);
  });

  it("lists every chip of every skill group (repeats included) in indexed rows", () => {
    const stack = slice("stack", "education");
    expect(stack.match(/class="chip"/g)).toHaveLength(skills.reduce((n, g) => n + g.items.length, 0));
    skills.forEach((_, i) => expect(stack).toContain(`data-row-index="${i}"`));
    expect(stack).not.toContain(`data-row-index="${skills.length}"`);
    expect(stack).toContain("data-stack-rows");
  });

  it("marks one stop per project and the hero band for the scene", () => {
    projects.forEach((_, i) => expect(html).toContain(`data-project-stop="${i}"`));
    expect(html).not.toContain(`data-project-stop="${projects.length}"`);
    for (const p of projects) expect(html).toContain(`data-project="${p.id}" data-initial="${p.initial}"`);
    expect(html).toContain("data-hero-band");
  });

  it("links every destination, external ones safely, the PDF through withBase", () => {
    for (const m of html.matchAll(/<a\b[^>]*>/g)) {
      const tag = m[0];
      if (/href="https?:/.test(tag)) {
        expect(tag, tag).toContain('target="_blank"');
        expect(tag, tag).toContain('rel="noopener noreferrer"');
      }
    }
    const hrefs = [
      links.linkedin.href,
      links.github.href,
      links.site.href,
      profile.now?.href,
      ...experience.map((j) => j.href),
      ...projects.map((p) => p.href),
      `mailto:${profile.email}`,
      profile.phoneHref,
      profile.resumePdf,
      "#projects",
      "#hero",
    ];
    for (const href of hrefs.filter(Boolean)) expect(html, href).toContain(`href="${href}"`);
  });

  it("gives every reveal target the hold class and gates nothing in the hero", () => {
    const reveals = [...html.matchAll(/<[a-z0-9]+\b[^>]*data-reveal[^>]*>/g)];
    // at least the two title parts of the six headed sections; the rest grows with the content
    expect(reveals.length).toBeGreaterThanOrEqual(12);
    for (const m of reveals) expect(m[0]).toMatch(/class="[^"]*\bhold\b/);
    expect(slice("hero", "about")).not.toMatch(/class="[^"]*\bhold\b/);
  });

  it("renders the live clock empty on the server and the hint visible", () => {
    expect(html).not.toContain("<time");
    expect(html).toContain("Hold a letter to grab it");
    expect(html).toMatch(/<button type="button" class="push-button[ "]/);
  });
});

describe("sections without the optional values", () => {
  const bare = structuredClone(content);
  delete (bare.experience[0] as { href?: string }).href;
  delete (bare.projects[0] as { href?: string }).href;
  delete (bare.profile as { phone?: string }).phone;
  delete (bare.education[0] as { score?: string }).score;
  const view = deriveView(bare);
  const render = (el: Parameters<typeof renderToStaticMarkup>[0]) => decode(renderToStaticMarkup(el));

  it("names a company without a website as text, not as a link", () => {
    const html = render(createElement(Experience, { view }));
    const first = html.slice(html.indexOf(`id="experience-${bare.experience[0].id}"`), html.indexOf("</article>"));
    expect(first).toContain(bare.experience[0].company);
    expect(first).not.toContain("<a ");
  });

  it("shows a project without a website with no domain line and no Visit button", () => {
    const html = render(createElement(Projects, { view }));
    const first = html.slice(html.indexOf(`id="project-${bare.projects[0].id}"`), html.indexOf("</article>"));
    expect(first).toContain(bare.projects[0].name);
    expect(first).not.toContain("Visit");
  });

  it("leaves out the phone row and an empty score", () => {
    expect(render(createElement(Contact, { view }))).not.toContain(">Phone<");
    const edu = render(createElement(Education, { view }));
    const start = edu.indexOf(`data-education="${bare.education[0].id}"`);
    expect(edu.slice(start, edu.indexOf("</li>", start))).not.toContain(">Score<");
  });
});
