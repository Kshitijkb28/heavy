/**
 * The content validator. `src/data/content.json` is the single source of truth for every fact on the page; the in-page
 * editor changes it and commits it to GitHub. `validateContent` lists every problem by path ("experience[2].href") so the
 * editor can show it beside the field; `parseContent` throws them all at once (the build calls it, so an invalid file
 * never deploys) and returns a copy in canonical key order without unknown keys; `serializeContent` writes the file the
 * same way every time, so a commit's diff shows only what changed. The types and limits live in `contract.ts` (the
 * visitor bundle uses them without the validator); this module re-exports them for the build, the editor and tests.
 */
import {
  LIMITS,
  TITLED_SECTIONS,
  defaultInitial,
  type Content,
  type EducationEntry,
  type EndMonth,
  type ExperienceEntry,
  type Fact,
  type LinkRef,
  type ProjectEntry,
  type SkillGroupEntry,
  type YearMonth,
} from "./contract";

export * from "./contract";

export interface ContentIssue {
  /** "experience[2].href"; "" for the whole document */
  path: string;
  message: string;
}

export class ContentError extends Error {
  readonly issues: readonly ContentIssue[];
  constructor(issues: readonly ContentIssue[]) {
    super(`content.json has ${issues.length} problem${issues.length === 1 ? "" : "s"}:\n${issues.map((i) => `  ${i.path || "(root)"}: ${i.message}`).join("\n")}`);
    this.name = "ContentError";
    this.issues = issues;
  }
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,18}$/;
const COUNTRY_CODE = /^\+[1-9][0-9]{0,3}$/;
const GLYPH = /^[A-Z0-9]$/;
const PDF_PATH = /^\/[A-Za-z0-9._-]+\.pdf$/;
const NO_SPACE = /^\S+$/;

type Raw = Record<string, unknown>;

/** Collects issues while reading; every reader returns a usable value so later fields are still checked. */
class Reader {
  readonly issues: ContentIssue[] = [];

  fail(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  object(v: unknown, path: string): Raw | null {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) return v as Raw;
    this.fail(path, "must be an object");
    return null;
  }

  text(v: unknown, path: string, max: number, rule?: { pattern: RegExp; message: string }): string {
    if (typeof v !== "string") {
      this.fail(path, "must be text");
      return "";
    }
    if (v.trim() === "") this.fail(path, "must not be blank");
    else if (v.length > max) this.fail(path, `at most ${max} characters (now ${v.length})`);
    else if (rule && !rule.pattern.test(v)) this.fail(path, rule.message);
    return v;
  }

  optionalText(v: unknown, path: string, max: number, rule?: { pattern: RegExp; message: string }): string | undefined {
    return v === undefined ? undefined : this.text(v, path, max, rule);
  }

  int(v: unknown, path: string, min: number, max: number): number {
    if (typeof v !== "number" || !Number.isInteger(v)) {
      this.fail(path, "must be a whole number");
      return min;
    }
    if (v < min || v > max) this.fail(path, `must be between ${min} and ${max}`);
    return v;
  }

  list<T>(v: unknown, path: string, size: { min: number; max: number }, item: (value: unknown, path: string, index: number) => T): T[] {
    if (!Array.isArray(v)) {
      this.fail(path, "must be a list");
      return [];
    }
    if (v.length < size.min) this.fail(path, `needs at least ${size.min}`);
    else if (v.length > size.max) this.fail(path, `at most ${size.max} (now ${v.length})`);
    return v.map((value, i) => item(value, `${path}[${i}]`, i));
  }

  optionalUrl(v: unknown, path: string): string | undefined {
    return v === undefined ? undefined : this.url(v, path);
  }

  url(v: unknown, path: string): string {
    const s = this.text(v, path, LIMITS.text.url);
    if (s && s.trim() && s.length <= LIMITS.text.url && !isHttpUrl(s)) this.fail(path, "must be a full https:// (or http://) link");
    return s;
  }

  ids(): (v: unknown, path: string) => string {
    const seen = new Set<string>();
    return (v, path) => {
      const id = this.text(v, path, LIMITS.text.id, { pattern: SLUG, message: "lower-case letters, digits and dashes only" });
      if (seen.has(id)) this.fail(path, `"${id}" is used twice`);
      seen.add(id);
      return id;
    };
  }

  dates(start: unknown, end: unknown, path: string): { start: YearMonth; end: EndMonth } {
    const s = this.text(start, `${path}.start`, 7, { pattern: MONTH, message: "a month as YYYY-MM" });
    const e = end === "present" ? "present" : this.text(end, `${path}.end`, 7, { pattern: MONTH, message: 'a month as YYYY-MM, or "present"' });
    if (e !== "present" && MONTH.test(s) && MONTH.test(e) && e < s) this.fail(`${path}.end`, "must not be before the start");
    return { start: s, end: e };
  }
}

function isHttpUrl(s: string): boolean {
  if (!/^https?:\/\/\S+$/i.test(s)) return false;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && !!u.hostname;
  } catch {
    return false;
  }
}

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function readLink(r: Reader, v: unknown, path: string): LinkRef {
  const o = r.object(v, path) ?? {};
  return { label: r.text(o.label, `${path}.label`, LIMITS.text.linkLabel), href: r.url(o.href, `${path}.href`) };
}

function read(raw: unknown, r: Reader): Content {
  const root = r.object(raw, "") ?? {};
  if (raw !== null && typeof raw === "object" && root.version !== 1) r.fail("version", "must be 1");
  const T = LIMITS.text;

  const s = r.object(root.site, "site") ?? {};
  const site: Content["site"] = {
    title: r.text(s.title, "site.title", T.siteTitle),
    description: r.text(s.description, "site.description", T.description),
    year: r.int(s.year, "site.year", LIMITS.copyrightYear.min, LIMITS.copyrightYear.max),
    keywords: r.list(s.keywords, "site.keywords", LIMITS.keywords, (v, p) => r.text(v, p, T.keyword)),
  };

  const p = r.object(root.profile, "profile") ?? {};
  const timezone = r.text(p.timezone, "profile.timezone", 64);
  if (timezone.trim() && !isTimeZone(timezone)) r.fail("profile.timezone", "not a time zone (e.g. Asia/Kolkata)");
  const phone = r.optionalText(p.phone, "profile.phone", T.phone, { pattern: PHONE, message: "digits, spaces, dashes and brackets only" });
  const profile: Content["profile"] = {
    name: r.text(p.name, "profile.name", T.name),
    firstName: r.text(p.firstName, "profile.firstName", T.firstName),
    lastName: r.text(p.lastName, "profile.lastName", T.lastName),
    initials: r.text(p.initials, "profile.initials", T.initials),
    role: r.text(p.role, "profile.role", T.role),
    city: r.text(p.city, "profile.city", T.city),
    location: r.text(p.location, "profile.location", T.location),
    timezone,
    email: r.text(p.email, "profile.email", T.email, { pattern: EMAIL, message: "not an email address" }),
    ...(phone !== undefined ? { phone } : {}),
    phoneCountryCode: r.text(p.phoneCountryCode, "profile.phoneCountryCode", 5, { pattern: COUNTRY_CODE, message: "like +91" }),
    yearsExperience: r.int(p.yearsExperience, "profile.yearsExperience", LIMITS.years.min, LIMITS.years.max),
    eyebrow: r.text(p.eyebrow, "profile.eyebrow", T.eyebrow),
    hook: r.text(p.hook, "profile.hook", T.hook),
    summary: r.list(p.summary, "profile.summary", LIMITS.summary, (v, path) => r.text(v, path, T.summary)),
    nowLine: r.text(p.nowLine, "profile.nowLine", T.nowLine),
    resumePdf: r.text(p.resumePdf, "profile.resumePdf", 120, { pattern: PDF_PATH, message: "a PDF at the site root, like /Resume.pdf" }),
  };

  const l = r.object(root.links, "links") ?? {};
  const links: Content["links"] = {
    site: readLink(r, l.site, "links.site"),
    linkedin: readLink(r, l.linkedin, "links.linkedin"),
    github: readLink(r, l.github, "links.github"),
  };

  const bullets = (v: unknown, path: string) => r.list(v, path, LIMITS.bullets, (b, bp) => r.text(b, bp, T.bullet));
  const tags = (v: unknown, path: string) => r.list(v, path, LIMITS.tags, (t, tp) => r.text(t, tp, T.chip));

  const experienceId = r.ids();
  const experience = r.list(root.experience, "experience", LIMITS.experience, (v, path): ExperienceEntry => {
    const o = r.object(v, path) ?? {};
    const id = experienceId(o.id, `${path}.id`);
    const company = r.text(o.company, `${path}.company`, T.company);
    const href = r.optionalUrl(o.href, `${path}.href`);
    return {
      id,
      company,
      ...(href !== undefined ? { href } : {}),
      location: r.text(o.location, `${path}.location`, T.location),
      role: r.text(o.role, `${path}.role`, T.role),
      ...r.dates(o.start, o.end, path),
      bullets: bullets(o.bullets, `${path}.bullets`),
      tags: tags(o.tags, `${path}.tags`),
    };
  });

  const projectId = r.ids();
  const projects = r.list(root.projects, "projects", LIMITS.projects, (v, path): ProjectEntry => {
    const o = r.object(v, path) ?? {};
    const id = projectId(o.id, `${path}.id`);
    const name = r.text(o.name, `${path}.name`, T.projectName);
    const initial = r.optionalText(o.initial, `${path}.initial`, 1, { pattern: GLYPH, message: "one capital letter or digit (A–Z, 0–9)" });
    if (initial === undefined && name.trim() && !defaultInitial(name)) r.fail(`${path}.initial`, "the name has no letter or digit to hang in iron: set an initial");
    const href = r.optionalUrl(o.href, `${path}.href`);
    const domain = r.optionalText(o.domain, `${path}.domain`, T.domain, { pattern: NO_SPACE, message: "no spaces" });
    const dates = r.dates(o.start, o.end, path);
    return {
      id,
      name,
      ...(initial !== undefined ? { initial } : {}),
      ...(href !== undefined ? { href } : {}),
      ...(domain !== undefined ? { domain } : {}),
      ...dates,
      blurb: r.text(o.blurb, `${path}.blurb`, T.blurb),
      bullets: bullets(o.bullets, `${path}.bullets`),
      tags: tags(o.tags, `${path}.tags`),
    };
  });

  const skillId = r.ids();
  const skills = r.list(root.skills, "skills", LIMITS.skills, (v, path): SkillGroupEntry => {
    const o = r.object(v, path) ?? {};
    return {
      id: skillId(o.id, `${path}.id`),
      label: r.text(o.label, `${path}.label`, T.skillLabel),
      items: r.list(o.items, `${path}.items`, LIMITS.skillItems, (t, tp) => r.text(t, tp, T.chip)),
    };
  });

  const educationId = r.ids();
  const education = r.list(root.education, "education", LIMITS.education, (v, path): EducationEntry => {
    const o = r.object(v, path) ?? {};
    const id = educationId(o.id, `${path}.id`);
    const school = r.text(o.school, `${path}.school`, T.school);
    const degree = r.text(o.degree, `${path}.degree`, T.degree);
    const field = r.text(o.field, `${path}.field`, T.field);
    const score = r.optionalText(o.score, `${path}.score`, T.score);
    return {
      id,
      school,
      degree,
      field,
      ...(score !== undefined ? { score } : {}),
      ...r.dates(o.start, o.end, path),
    };
  });

  const facts = r.list(root.facts, "facts", LIMITS.facts, (v, path): Fact => {
    const o = r.object(v, path) ?? {};
    return { label: r.text(o.label, `${path}.label`, T.factLabel), value: r.text(o.value, `${path}.value`, T.factValue) };
  });

  const t = r.object(root.titles, "titles") ?? {};
  const titles = Object.fromEntries(
    TITLED_SECTIONS.map((id) => {
      const path = `titles.${id}`;
      const parts = Array.isArray(t[id]) ? (t[id] as unknown[]) : (r.fail(path, "must be two parts: light and bold"), []);
      return [id, [r.text(parts[0], `${path}[0]`, T.titlePart), r.text(parts[1], `${path}[1]`, T.titlePart)]];
    }),
  ) as Content["titles"];

  return { version: 1, site, profile, links, experience, projects, skills, education, facts, titles };
}

/** Every problem in `raw`, by path; empty when it is valid content. */
export function validateContent(raw: unknown): ContentIssue[] {
  const r = new Reader();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    r.fail("", "must be an object");
    return r.issues;
  }
  read(raw, r);
  return r.issues;
}

/** Valid content in canonical key order, without unknown keys; throws a `ContentError` listing every problem. */
export function parseContent(raw: unknown): Content {
  const r = new Reader();
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new ContentError([{ path: "", message: "must be an object" }]);
  const content = read(raw, r);
  if (r.issues.length) throw new ContentError(r.issues);
  return content;
}

/** The file as committed: two-space JSON in canonical key order with a trailing newline. */
export function serializeContent(content: Content): string {
  return `${JSON.stringify(content, null, 2)}\n`;
}
