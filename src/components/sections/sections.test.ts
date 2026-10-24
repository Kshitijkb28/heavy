import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "@/app/page";
import { SECTION_ORDER } from "@/lib/contracts";
import { NAME_ROWS } from "@/data/derived";
import { SITE, education, experience, facts, links, profile, projects, sections as sectionMeta, skills, stats } from "@/data/resume";

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

  it("lists JavaScript twice in the stack and 17 chips in five indexed rows", () => {
    const stack = slice("stack", "education");
    expect(stack.match(/>JavaScript</g)).toHaveLength(2);
    expect(stack.match(/class="chip"/g)).toHaveLength(17);
    for (let i = 0; i < 5; i++) expect(stack).toContain(`data-row-index="${i}"`);
    expect(stack).toContain("data-stack-rows");
  });

  it("marks the three project stops and the hero band for the scene", () => {
    for (let i = 0; i < 3; i++) expect(html).toContain(`data-project-stop="${i}"`);
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
      profile.now.href,
      ...experience.map((j) => j.href),
      ...projects.map((p) => p.href),
      `mailto:${profile.email}`,
      profile.phoneHref,
      profile.resumePdf,
      "#projects",
      "#hero",
    ];
    for (const href of hrefs) expect(html, href).toContain(`href="${href}"`);
  });

  it("gives every reveal target the hold class and gates nothing in the hero", () => {
    const reveals = [...html.matchAll(/<[a-z0-9]+\b[^>]*data-reveal[^>]*>/g)];
    expect(reveals.length).toBeGreaterThan(20);
    for (const m of reveals) expect(m[0]).toMatch(/class="[^"]*\bhold\b/);
    expect(slice("hero", "about")).not.toMatch(/class="[^"]*\bhold\b/);
  });

  it("renders the live clock empty on the server and the hint visible", () => {
    expect(html).not.toContain("<time");
    expect(html).toContain("Hold a letter to grab it");
    expect(html).toMatch(/<button type="button" class="push-button[ "]/);
  });
});
