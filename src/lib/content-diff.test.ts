import { describe, expect, it } from "vitest";
import snapshot from "@/data/fixtures/content.base.json";
import type { Content } from "@/data/schema";
import { commitMessage, diffContent } from "./content-diff";

/** a frozen copy of the content: the changes below name its entries */
const content = snapshot as unknown as Content;

const variant = (edit: (c: Content) => void): Content => {
  const c = structuredClone(content);
  edit(c);
  return c;
};
const labels = (draft: Content) => diffContent(content, draft).map((c) => c.label);

describe("diffContent — what changed, in words", () => {
  it("finds nothing in an unchanged draft", () => {
    expect(diffContent(content, structuredClone(content))).toEqual([]);
  });

  it("names added, removed and edited entries by their name", () => {
    expect(
      labels(
        variant((c) => {
          c.experience.unshift({ ...c.experience[0], id: "acme", company: "Acme Labs" });
        }),
      ),
    ).toEqual(['Added role "Acme Labs"']);
    expect(labels(variant((c) => c.projects.splice(1, 1)))).toEqual(['Removed project "Remodely"']);
    expect(labels(variant((c) => (c.experience[0].bullets[1] = "Shorter.")))).toEqual(['Edited role "Ethara AI"']);
    expect(labels(variant((c) => c.skills[4].items.push("GCP")))).toEqual(['Edited skill group "Cloud"']);
  });

  it("ignores key order (an optional field cleared and typed again comes back last)", () => {
    // canonical: id, name, initial, href, … — the editor re-adds a cleared key at the end
    const canonical = variant((c) => {
      const { id, name, ...rest } = c.projects[0];
      c.projects[0] = { id, name, initial: "Y", ...rest };
    });
    const typedAgain = variant((c) => (c.projects[0] = { ...c.projects[0], initial: "Y" }));
    expect(JSON.stringify(canonical)).not.toBe(JSON.stringify(typedAgain));
    expect(diffContent(canonical, typedAgain)).toEqual([]);
  });

  it("reports a new order once", () => {
    expect(labels(variant((c) => c.projects.reverse()))).toEqual(["Reordered projects"]);
  });

  it("groups plain fields by the panel that edits them", () => {
    const changes = diffContent(
      content,
      variant((c) => {
        c.profile.hook = "New hook.";
        c.profile.eyebrow = "New eyebrow";
        c.facts[0].value = "4 years";
        c.links.github.href = "https://github.com/someone";
        c.site.year = 2027;
        c.titles.stack = ["Tools I", "use."];
      }),
    );
    expect(changes).toEqual([
      { section: "hero", label: "Edited the hero" },
      { section: "about", label: "Edited About" },
      { section: "stack", label: "Edited the Stack heading" },
      { section: "contact", label: "Edited Contact" },
      { section: "site", label: "Edited site settings" },
    ]);
  });
});

describe("commitMessage", () => {
  it("summarises the changes on one line, with a résumé note when the PDF is replaced", () => {
    const draft = variant((c) => c.experience.unshift({ ...c.experience[0], id: "acme", company: "Acme Labs" }));
    expect(commitMessage(diffContent(content, draft), false)).toBe('content: Added role "Acme Labs"');
    expect(commitMessage([], true)).toBe("content: Replaced the résumé PDF");
    const many = Array.from({ length: 12 }, (_, i) => ({ section: "about" as const, label: `Change number ${i}` }));
    expect(commitMessage(many, false).length).toBeLessThanOrEqual(72);
    expect(commitMessage(many, false)).toMatch(/\(\+\d+ more\)$/);
  });
});
