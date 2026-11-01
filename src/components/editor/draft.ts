/**
 * Pure edits on the draft content for the in-page editor: set a value by path, insert / remove / move list items, new
 * blank entries with unique ids, and the validation issues that belong to one field. No React, no DOM: unit tested.
 */
import type { Content, ContentIssue, EducationEntry, ExperienceEntry, Fact, ProjectEntry, SkillGroupEntry } from "@/data/schema";

export type Path = readonly (string | number)[];

/** `obj` with the value at `path` replaced (copying only the objects and arrays on the way); `undefined` deletes a key. */
export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (path.length === 0) return value as T;
  const [key, ...rest] = path;
  if (Array.isArray(obj)) {
    const copy = obj.slice();
    copy[key as number] = setIn(copy[key as number], rest, value);
    return copy as T;
  }
  const source = (obj ?? {}) as Record<string, unknown>;
  const next = setIn(source[key as string], rest, value);
  const copy = { ...source };
  if (next === undefined && rest.length === 0) delete copy[key as string];
  else copy[key as string] = next;
  return copy as T;
}

export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const copy = list.slice();
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
  return copy;
}

export function removeAt<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** The list with item `from` moved to position `to`; out-of-range moves leave it as it is. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return list.slice();
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** "Café & Co." → "cafe-co" (the id pattern of `src/data/schema.ts`). */
export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

/** A slug of `name` (or `fallback`) that is not in `taken`: "acme", "acme-2", "acme-3" … */
export function uniqueId(name: string, taken: Iterable<string>, fallback = "entry"): string {
  const used = new Set(taken);
  const base = slugify(name) || fallback;
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export type ListKind = "experience" | "projects" | "skills" | "education" | "facts";
type EntryOf<K extends ListKind> = K extends "experience"
  ? ExperienceEntry
  : K extends "projects"
    ? ProjectEntry
    : K extends "skills"
      ? SkillGroupEntry
      : K extends "education"
        ? EducationEntry
        : Fact;

const monthOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/**
 * A new, empty entry for a list: blank text (validation flags it until it is filled in), this month as the start, an
 * id no other entry of the list has (fixed once created, so anchors and the iron initial's registry group stay put).
 */
export function blankEntry<K extends ListKind>(kind: K, content: Content, now: Date = new Date()): EntryOf<K> {
  const month = monthOf(now);
  switch (kind) {
    case "experience":
      return { id: uniqueId("role", content.experience.map((e) => e.id)), company: "", location: "", role: "", start: month, end: "present", bullets: [""], tags: [] } as ExperienceEntry as EntryOf<K>;
    case "projects":
      return { id: uniqueId("project", content.projects.map((e) => e.id)), name: "", start: month, end: month, blurb: "", bullets: [""], tags: [] } as ProjectEntry as EntryOf<K>;
    case "skills":
      return { id: uniqueId("group", content.skills.map((e) => e.id)), label: "", items: [""] } as SkillGroupEntry as EntryOf<K>;
    case "education":
      return { id: uniqueId("school", content.education.map((e) => e.id)), school: "", degree: "", field: "", start: month, end: month } as EducationEntry as EntryOf<K>;
    default:
      return { label: "", value: "" } as Fact as EntryOf<K>;
  }
}

/** The issues at `path` or inside it ("experience[0]" matches "experience[0].company", not "experience[10]"). */
export function issuesUnder(issues: readonly ContentIssue[], path: string): ContentIssue[] {
  return issues.filter((i) => i.path === path || i.path.startsWith(`${path}.`) || i.path.startsWith(`${path}[`));
}
