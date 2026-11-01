/**
 * What a draft changes against the published content, in words: the editor's "N changes", the publish confirmation and
 * the commit message. Entries are matched by id (added / removed / edited / reordered); plain fields are grouped by the
 * panel that edits them. Pure: unit tested.
 */
import type { Content } from "@/data/schema";

/** The editor's panels, in page order. */
export type PanelId = "hero" | "about" | "experience" | "projects" | "stack" | "education" | "contact" | "site";

export interface Change {
  section: PanelId;
  label: string;
}

/** JSON with object keys sorted: key order is not a change (the editor re-adds a cleared optional key at the end). */
function stable(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v,
  );
}

const same = (a: unknown, b: unknown) => stable(a) === stable(b);

interface ListSpec {
  section: PanelId;
  key: "experience" | "projects" | "skills" | "education";
  one: string;
  many: string;
  heading: string;
  name: (entry: Record<string, unknown>) => string;
}

const LISTS: readonly ListSpec[] = [
  { section: "experience", key: "experience", one: "role", many: "roles", heading: "Experience", name: (e) => String(e.company ?? "") },
  { section: "projects", key: "projects", one: "project", many: "projects", heading: "Projects", name: (e) => String(e.name ?? "") },
  { section: "stack", key: "skills", one: "skill group", many: "skill groups", heading: "Stack", name: (e) => String(e.label ?? "") },
  { section: "education", key: "education", one: "school", many: "schools", heading: "Education", name: (e) => String(e.school ?? "") },
];

const quoted = (name: string) => `"${name.trim() || "untitled"}"`;

function listChanges(spec: ListSpec, base: Content, draft: Content): Change[] {
  const before = base[spec.key] as unknown as Record<string, unknown>[];
  const after = draft[spec.key] as unknown as Record<string, unknown>[];
  const out: Change[] = [];
  if (!same(base.titles[spec.section as keyof Content["titles"]], draft.titles[spec.section as keyof Content["titles"]])) {
    out.push({ section: spec.section, label: `Edited the ${spec.heading} heading` });
  }
  const beforeById = new Map(before.map((e) => [e.id as string, e]));
  const afterIds = new Set(after.map((e) => e.id as string));
  for (const e of after) {
    const old = beforeById.get(e.id as string);
    if (!old) out.push({ section: spec.section, label: `Added ${spec.one} ${quoted(spec.name(e))}` });
    else if (!same(old, e)) out.push({ section: spec.section, label: `Edited ${spec.one} ${quoted(spec.name(e))}` });
  }
  for (const e of before) if (!afterIds.has(e.id as string)) out.push({ section: spec.section, label: `Removed ${spec.one} ${quoted(spec.name(e))}` });
  const kept = (list: Record<string, unknown>[], other: Set<string>) => list.map((e) => e.id as string).filter((id) => other.has(id));
  if (!same(kept(before, afterIds), kept(after, new Set(before.map((e) => e.id as string))))) {
    out.push({ section: spec.section, label: `Reordered ${spec.many}` });
  }
  return out;
}

export function diffContent(base: Content, draft: Content): Change[] {
  const changes: Change[] = [];
  const p0 = base.profile;
  const p1 = draft.profile;
  const changed = (keys: readonly (keyof Content["profile"])[]) => keys.some((k) => !same(p0[k], p1[k]));

  if (changed(["eyebrow", "hook", "role", "name", "firstName", "lastName", "initials"])) changes.push({ section: "hero", label: "Edited the hero" });
  if (changed(["summary", "nowLine", "yearsExperience"]) || !same(base.facts, draft.facts) || !same(base.titles.about, draft.titles.about)) {
    changes.push({ section: "about", label: "Edited About" });
  }
  for (const spec of LISTS) changes.push(...listChanges(spec, base, draft));
  if (changed(["email", "phone", "phoneCountryCode", "location", "city", "timezone", "resumePdf"]) || !same(base.links, draft.links) || !same(base.titles.contact, draft.titles.contact)) {
    changes.push({ section: "contact", label: "Edited Contact" });
  }
  if (!same(base.site, draft.site)) changes.push({ section: "site", label: "Edited site settings" });

  // page order: hero, about, the lists, contact, site
  const order: readonly PanelId[] = ["hero", "about", "experience", "projects", "stack", "education", "contact", "site"];
  return changes.map((c, i) => ({ c, i })).sort((a, b) => order.indexOf(a.c.section) - order.indexOf(b.c.section) || a.i - b.i).map(({ c }) => c);
}

/** One line (≤ 72 characters) for the commit: "content: Added role "Acme"; Edited About (+2 more)". */
export function commitMessage(changes: readonly Change[], pdfReplaced: boolean): string {
  const parts = changes.map((c) => c.label);
  if (pdfReplaced) parts.push("Replaced the résumé PDF");
  if (parts.length === 0) return "content: update";
  const head = "content: ";
  let message = head + parts[0];
  let used = 1;
  while (used < parts.length) {
    const rest = parts.length - used - 1;
    const candidate = `${message}; ${parts[used]}`;
    const tail = rest > 0 ? ` (+${rest} more)` : "";
    if ((candidate + tail).length > 72) break;
    message = candidate;
    used++;
  }
  if (used < parts.length) message += ` (+${parts.length - used} more)`;
  if (message.length > 72) message = `${message.slice(0, 69)}…`;
  return message;
}
