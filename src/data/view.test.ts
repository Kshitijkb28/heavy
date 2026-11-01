import { describe, expect, it } from "vitest";
import snapshot from "@/data/fixtures/content.base.json";
import type { Content } from "./schema";
import { captionList, defaultDomain, defaultInitial, deriveView, formatPeriod, phoneHref } from "./view";

/** the content as of the editor's first release, frozen: these tests pin the derivation, not today's content.json */
const content = snapshot as unknown as Content;
const view = deriveView(content);

/** A deep copy of the committed content to vary one thing at a time. */
const variant = (edit: (c: Content) => void): Content => {
  const c = structuredClone(content);
  edit(c);
  return c;
};

describe("deriveView — today's strings, derived instead of typed", () => {
  it("numbers and dates the experience entries", () => {
    expect(view.experience.map((j) => [j.index, j.period])).toEqual([
      ["01", "Jan 2026 – Present"],
      ["02", "Aug 2023 – Oct 2025"],
    ]);
  });

  it("numbers, dates, skins and labels the projects", () => {
    expect(view.projects.map((p) => [p.index, p.period, p.skin, p.initial, p.domain])).toEqual([
      ["01", "Jan 2025 – Oct 2025", "surface", "Y", "fuse.systems"],
      ["02", "Oct 2024 – Dec 2025", "tangerine", "R", "remodely.com"],
      ["03", "Oct 2023 – Oct 2024", "mint", "S", "app.servicepoints.nl"],
    ]);
  });

  it("dates the education rows", () => {
    expect(view.education.map((e) => e.period)).toEqual(["Jul 2019 – Jun 2023", "Mar 2018 – Mar 2019"]);
  });

  it("writes the section annotations from the lists", () => {
    expect(view.sections.experience.annotation).toBe("2 roles · 2023 — present");
    expect(view.sections.projects.annotation).toBe("3 products · 2023 — 2025");
    expect(view.sections.stack.annotation).toBe("17 tools · 5 layers");
    for (const id of ["about", "education", "contact"] as const) expect(view.sections[id].annotation).toBeUndefined();
  });

  it("keeps the section index, label and two-part title", () => {
    expect(Object.values(view.sections).map((s) => [s.id, s.index, s.label, s.title.join(" ")])).toEqual([
      ["about", "01", "About", "Full stack by trade."],
      ["experience", "02", "Experience", "Where I have shipped."],
      ["projects", "03", "Projects", "Selected work."],
      ["stack", "04", "Stack", "Tools I reach for."],
      ["education", "05", "Education", "Where it started."],
      ["contact", "06", "Contact", "Let's build something."],
    ]);
  });

  it("counts the stats and lists their captions", () => {
    expect(view.stats).toEqual([
      { value: 3, suffix: " yrs", label: "Hands-on experience" },
      { value: 2, suffix: "", label: "Companies", caption: "Ethara AI · Mind2web LLP" },
      { value: 3, suffix: "", label: "Products", caption: "Yot Ecommerce · Remodely · Service Points" },
    ]);
  });

  it("takes Now from the current role", () => {
    expect(view.profile.now).toEqual({ label: "Now", role: "Software Engineer", company: "Ethara AI", href: "https://www.ethara.ai/" });
  });

  it("builds the phone link, hero calls to action, contact rows and footer links", () => {
    expect(view.profile.phoneHref).toBe("tel:+919729916844");
    expect(view.hero.nameRows).toEqual(["KSHITIJ", "BHARDWAJ"]);
    expect(view.hero.ctas.map((c) => [c.label, c.href, c.variant, !!c.external])).toEqual([
      ["View projects", "#projects", "primary", false],
      ["Email", "mailto:Kshitijbhardwajkb28@gmail.com", "ghost", false],
      ["Résumé (PDF)", "/Kshitij-Bhardwaj-Resume.pdf", "link", true],
    ]);
    expect(view.contactRows.map((r) => [r.label, r.value, r.href, r.external])).toEqual([
      ["Email", "Kshitijbhardwajkb28@gmail.com", "mailto:Kshitijbhardwajkb28@gmail.com", false],
      ["Phone", "9729916844", "tel:+919729916844", false],
      ["LinkedIn", "linkedin.com/in/kshitij-bhardwaj-067240232", "https://www.linkedin.com/in/kshitij-bhardwaj-067240232", true],
      ["GitHub", "github.com/Kshitijkb28", "https://github.com/Kshitijkb28", true],
    ]);
    expect(view.footerLinks.map((l) => l.label)).toEqual(["LinkedIn", "GitHub", "kshitijkb28.github.io"]);
  });
});

describe("deriveView — what changes when the content does", () => {
  it("adds a role at the top: renumbers, recounts, moves Now", () => {
    const v = deriveView(
      variant((c) => {
        c.experience[0].end = "2026-09";
        c.experience.unshift({
          id: "acme",
          company: "Acme Labs",
          href: "https://acme.dev",
          location: "Remote",
          role: "Staff Engineer",
          start: "2026-10",
          end: "present",
          bullets: ["Leads the platform team."],
          tags: [],
        });
      }),
    );
    expect(v.experience.map((j) => j.index)).toEqual(["01", "02", "03"]);
    expect(v.sections.experience.annotation).toBe("3 roles · 2023 — present");
    expect(v.stats[1]).toEqual({ value: 3, suffix: "", label: "Companies", caption: "Acme Labs · Ethara AI · Mind2web LLP" });
    expect(v.profile.now).toEqual({ label: "Now", role: "Staff Engineer", company: "Acme Labs", href: "https://acme.dev" });
  });

  it("has no Now when no role is current, and closes the range on the last year", () => {
    const v = deriveView(variant((c) => (c.experience[0].end = "2026-09")));
    expect(v.profile.now).toBeNull();
    expect(v.sections.experience.annotation).toBe("2 roles · 2023 — 2026");
  });

  it("uses the singular for one of a kind", () => {
    const v = deriveView(
      variant((c) => {
        c.experience.splice(1);
        c.projects.splice(1);
        c.skills.splice(1);
        c.skills[0].items.splice(1);
      }),
    );
    expect(v.sections.experience.annotation).toBe("1 role · 2026 — present");
    expect(v.sections.projects.annotation).toBe("1 product · 2025");
    expect(v.sections.stack.annotation).toBe("1 tool · 1 layer");
  });

  it("counts a company once even with two roles there", () => {
    const v = deriveView(variant((c) => c.experience.push({ ...c.experience[1], id: "mind2web-intern", role: "Intern" })));
    expect(v.stats[1].value).toBe(2);
  });

  it("cycles the card skins past three projects", () => {
    const v = deriveView(variant((c) => c.projects.push({ ...c.projects[0], id: "fourth" })));
    expect(v.projects.map((p) => p.skin)).toEqual(["surface", "tangerine", "mint", "surface"]);
  });

  it("prefers an explicit initial and domain", () => {
    const v = deriveView(variant((c) => Object.assign(c.projects[0], { initial: "F", domain: "fuse.systems/shop" })));
    expect([v.projects[0].initial, v.projects[0].domain]).toEqual(["F", "fuse.systems/shop"]);
  });

  it("leaves out what has no value: no website, no phone, no score", () => {
    const v = deriveView(
      variant((c) => {
        delete (c.experience[0] as { href?: string }).href;
        delete (c.projects[0] as { href?: string }).href;
        delete (c.profile as { phone?: string }).phone;
        delete (c.education[0] as { score?: string }).score;
      }),
    );
    expect(v.projects[0].domain).toBeUndefined();
    expect(v.projects[0].href).toBeUndefined();
    expect(v.profile.now).toEqual({ label: "Now", role: "Software Engineer", company: "Ethara AI" });
    expect(v.profile.phoneHref).toBeUndefined();
    expect(v.contactRows.map((r) => r.label)).toEqual(["Email", "LinkedIn", "GitHub"]);
    expect(v.education[0].score).toBeUndefined();
  });

  it("links the company inside the Now line only when the line mentions it", () => {
    expect(view.about.nowParts).toEqual([
      "Today at ",
      "Ethara AI",
      " I build Python backends for AI-powered products and contribute to LLM post-training — dataset preparation, evaluation pipelines and response-quality work.",
    ]);
    expect(deriveView(variant((c) => (c.profile.nowLine = "Freelancing for now."))).about.nowParts).toBeNull();
  });
});

describe("view helpers", () => {
  it("formats periods with an en dash", () => {
    expect(formatPeriod("2019-07", "2023-06")).toBe("Jul 2019 – Jun 2023");
    expect(formatPeriod("2026-01", "present")).toBe("Jan 2026 – Present");
  });
  it("lists up to three names, then counts the rest", () => {
    expect(captionList(["A", "B", "C"])).toBe("A · B · C");
    expect(captionList(["A", "B", "C", "D", "E"])).toBe("A · B · C +2 more");
  });
  it("derives a glyph-safe initial and a bare domain", () => {
    expect(defaultInitial("yot ecommerce")).toBe("Y");
    expect(defaultInitial("#1 tracker")).toBe("1");
    expect(defaultInitial("—")).toBeNull();
    expect(defaultDomain("https://www.ethara.ai/careers")).toBe("ethara.ai");
    expect(defaultDomain("https://app.servicepoints.nl")).toBe("app.servicepoints.nl");
  });
  it("dials the country code before the digits", () => {
    expect(phoneHref("+91", "97299 16844")).toBe("tel:+919729916844");
  });
});
