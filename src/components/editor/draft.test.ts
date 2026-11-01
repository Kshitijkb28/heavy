import { describe, expect, it } from "vitest";
import snapshot from "@/data/fixtures/content.base.json";
import { validateContent, type Content } from "@/data/schema";
import { blankEntry, insertAt, issuesUnder, moveItem, removeAt, setIn, slugify, uniqueId } from "./draft";

/** a frozen copy of the content: the edits below name its entries */
const content = snapshot as unknown as Content;

describe("setIn", () => {
  it("replaces one value by path and copies only the objects on the way", () => {
    const next = setIn(content, ["experience", 1, "company"], "Mind2web");
    expect(next.experience[1].company).toBe("Mind2web");
    expect(content.experience[1].company).toBe("Mind2web LLP");
    expect(next.experience[0]).toBe(content.experience[0]);
    expect(next.projects).toBe(content.projects);
    expect(next.experience).not.toBe(content.experience);
  });
  it("deletes an optional key when given undefined", () => {
    const withInitial = setIn(content, ["projects", 0, "initial"], "F");
    expect(withInitial.projects[0].initial).toBe("F");
    expect("initial" in setIn(withInitial, ["projects", 0, "initial"], undefined).projects[0]).toBe(false);
  });
});

describe("list edits", () => {
  it("inserts, removes and moves without touching the original", () => {
    const list = ["a", "b", "c"];
    expect(insertAt(list, 0, "z")).toEqual(["z", "a", "b", "c"]);
    expect(removeAt(list, 1)).toEqual(["a", "c"]);
    expect(moveItem(list, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(list, 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveItem(list, 0, -1)).toEqual(["a", "b", "c"]);
    expect(list).toEqual(["a", "b", "c"]);
  });
});

describe("ids", () => {
  it("slugifies names and keeps them unique", () => {
    expect(slugify("Mind2web LLP")).toBe("mind2web-llp");
    expect(slugify("Café & Co.")).toBe("cafe-co");
    expect(slugify("—")).toBe("");
    expect(uniqueId("Acme Labs", ["acme-labs"])).toBe("acme-labs-2");
    expect(uniqueId("Acme Labs", ["acme-labs", "acme-labs-2"])).toBe("acme-labs-3");
    expect(uniqueId("", [], "project")).toBe("project");
  });
});

describe("blankEntry", () => {
  it("starts a new role today, still running, with an id no other role has", () => {
    const job = blankEntry("experience", content, new Date("2026-10-31T12:00:00Z"));
    expect(job).toMatchObject({ start: "2026-10", end: "present", bullets: [""], tags: [] });
    expect(content.experience.map((j) => j.id)).not.toContain(job.id);
  });
  it("is flagged by validation until it is filled in (blank text), and only there", () => {
    const draft = { ...content, experience: [blankEntry("experience", content), ...content.experience] };
    const paths = validateContent(draft).map((i) => i.path);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith("experience[0]."))).toBe(true);
  });
  it("makes valid ids for every kind", () => {
    for (const kind of ["experience", "projects", "skills", "education"] as const) {
      const entry = blankEntry(kind, content) as { id: string };
      expect(entry.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
    expect(blankEntry("facts", content)).toEqual({ label: "", value: "" });
  });
});

describe("issuesUnder", () => {
  it("keeps the issues at or below a path", () => {
    const issues = [
      { path: "experience[0].company", message: "a" },
      { path: "experience[10].company", message: "b" },
      { path: "experience", message: "c" },
      { path: "projects[0].name", message: "d" },
    ];
    expect(issuesUnder(issues, "experience[0]").map((i) => i.message)).toEqual(["a"]);
    expect(issuesUnder(issues, "experience").map((i) => i.message)).toEqual(["a", "b", "c"]);
  });
});
