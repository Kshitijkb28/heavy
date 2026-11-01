import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import live from "@content";
import snapshot from "./fixtures/content.base.json";
import { ContentError, LIMITS, parseContent, serializeContent, validateContent, type Content } from "./schema";

/** a frozen, valid copy to break one thing at a time (the live file is only checked for validity and form) */
const content = snapshot as unknown as Content;

const variant = (edit: (c: Content) => void): unknown => {
  const c = structuredClone(content);
  edit(c);
  return c;
};
const pathsOf = (raw: unknown) => validateContent(raw).map((i) => i.path);

describe("content.json", () => {
  it("is valid", () => {
    expect(validateContent(live)).toEqual([]);
    expect(parseContent(live)).toEqual(live);
    expect(validateContent(content)).toEqual([]);
  });

  it("is stored in canonical form (key order, two-space indent, trailing newline)", () => {
    const file = readFileSync(path.resolve(import.meta.dirname, "content.json"), "utf8");
    expect(serializeContent(parseContent(JSON.parse(file)))).toBe(file);
  });
});

describe("validateContent — one issue per problem, by path", () => {
  it("rejects links that are not http(s)", () => {
    expect(pathsOf(variant((c) => (c.experience[0].href = "javascript:alert(1)")))).toEqual(["experience[0].href"]);
    expect(pathsOf(variant((c) => (c.links.github.href = "github.com/x")))).toEqual(["links.github.href"]);
  });

  it("caps list sizes (projects hang iron initials: at most six)", () => {
    const seven = variant((c) => {
      while (c.projects.length < LIMITS.projects.max + 1) c.projects.push({ ...c.projects[0], id: `p${c.projects.length}` });
    });
    const issues = validateContent(seven);
    expect(issues.map((i) => i.path)).toEqual(["projects"]);
    expect(issues[0].message).toMatch(/at most 6/);
    expect(pathsOf(variant((c) => (c.experience = [])))).toEqual(["experience"]);
  });

  it("caps text lengths where the layout needs it", () => {
    expect(pathsOf(variant((c) => (c.profile.hook = "x".repeat(LIMITS.text.hook + 1))))).toEqual(["profile.hook"]);
    expect(pathsOf(variant((c) => (c.profile.hook = "x".repeat(LIMITS.text.hook))))).toEqual([]);
    expect(pathsOf(variant((c) => (c.skills[0].items[0] = "x".repeat(LIMITS.text.chip + 1))))).toEqual(["skills[0].items[0]"]);
  });

  it("requires unique, slug-shaped ids", () => {
    expect(pathsOf(variant((c) => (c.projects[1].id = c.projects[0].id)))).toEqual(["projects[1].id"]);
    expect(pathsOf(variant((c) => (c.education[0].id = "Not A Slug")))).toEqual(["education[0].id"]);
  });

  it("only accepts initials the iron typeface has", () => {
    expect(pathsOf(variant((c) => (c.projects[0].initial = "é")))).toEqual(["projects[0].initial"]);
    expect(pathsOf(variant((c) => (c.projects[0].name = "— —")))).toEqual(["projects[0].initial"]);
    expect(pathsOf(variant((c) => Object.assign(c.projects[0], { name: "— —", initial: "Q" })))).toEqual([]);
  });

  it("checks months and their order", () => {
    expect(pathsOf(variant((c) => (c.experience[1].start = "2023-13")))).toEqual(["experience[1].start"]);
    expect(pathsOf(variant((c) => (c.experience[1].end = "2022-01")))).toEqual(["experience[1].end"]);
    expect(pathsOf(variant((c) => (c.education[0].end = "present")))).toEqual([]);
  });

  it("checks the timezone, email and phone", () => {
    expect(pathsOf(variant((c) => (c.profile.timezone = "Mars/Olympus")))).toEqual(["profile.timezone"]);
    expect(pathsOf(variant((c) => (c.profile.email = "not-an-email")))).toEqual(["profile.email"]);
    expect(pathsOf(variant((c) => (c.profile.phone = "call me")))).toEqual(["profile.phone"]);
  });

  it("refuses blank text and missing parts", () => {
    expect(pathsOf(variant((c) => (c.experience[0].bullets[0] = "   ")))).toEqual(["experience[0].bullets[0]"]);
    expect(pathsOf(variant((c) => (c.titles.about = ["Full stack"] as unknown as [string, string])))).toEqual(["titles.about[1]"]);
    expect(pathsOf(null)).toEqual([""]);
  });
});

describe("optional fields", () => {
  it("accepts a role and a project without a website, no phone number and a school without a score", () => {
    const raw = variant((c) => {
      delete (c.experience[0] as { href?: string }).href;
      delete (c.projects[0] as { href?: string }).href;
      delete (c.profile as { phone?: string }).phone;
      delete (c.education[0] as { score?: string }).score;
    });
    expect(validateContent(raw)).toEqual([]);
    expect("href" in parseContent(raw).projects[0]).toBe(false);
  });
  it("still checks them when they are there", () => {
    expect(pathsOf(variant((c) => (c.projects[0].href = "")))).toEqual(["projects[0].href"]);
    expect(pathsOf(variant((c) => (c.profile.phone = "call me")))).toEqual(["profile.phone"]);
  });
});

describe("parseContent", () => {
  it("throws every issue at once", () => {
    const raw = variant((c) => {
      c.profile.email = "nope";
      c.projects[0].href = "ftp://x";
    });
    expect(() => parseContent(raw)).toThrow(ContentError);
    expect(() => parseContent(raw)).toThrow(/profile\.email[\s\S]*projects\[0\]\.href/);
  });

  it("drops unknown keys and trims nothing it was not asked to", () => {
    const parsed = parseContent(variant((c) => Object.assign(c.profile, { extra: 1 })));
    expect("extra" in parsed.profile).toBe(false);
    expect(parsed.profile.hook).toBe(content.profile.hook);
  });
});

describe("layout fixtures (src/data/fixtures, built with CONTENT_FIXTURE for verify:overflow)", () => {
  const read = (name: string): Content => JSON.parse(readFileSync(path.resolve(import.meta.dirname, "fixtures", name), "utf8"));

  it("are valid content", () => {
    expect(validateContent(read("content.max.json"))).toEqual([]);
    expect(validateContent(read("content.min.json"))).toEqual([]);
  });

  it("max fills every list to its limit (facts one short, to test an odd count)", () => {
    const max = read("content.max.json");
    expect(max.experience).toHaveLength(LIMITS.experience.max);
    expect(max.projects).toHaveLength(LIMITS.projects.max);
    expect(max.skills).toHaveLength(LIMITS.skills.max);
    expect(max.skills.every((g) => g.items.length === LIMITS.skillItems.max)).toBe(true);
    expect(max.education).toHaveLength(LIMITS.education.max);
    expect(max.facts).toHaveLength(LIMITS.facts.max - 1);
    expect(max.profile.hook).toHaveLength(LIMITS.text.hook);
  });

  it("min keeps one of everything", () => {
    const min = read("content.min.json");
    expect([min.experience.length, min.projects.length, min.skills.length, min.education.length, min.facts.length]).toEqual([1, 1, 1, 1, LIMITS.facts.min]);
  });
});
