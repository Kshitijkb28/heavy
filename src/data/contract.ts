/**
 * The content contract: the shape of `src/data/content.json`, the limits it is held to and the little the page derives
 * from it without the validator. Visitor code (view.ts, resume.ts, the stage, the editor's slots) imports from here;
 * the validator (`schema.ts`) stays in the build and in the editor chunk. No imports: Node scripts read this module too.
 */

/** "2026-01" */
export type YearMonth = string;
/** a month, or "present" for an ongoing role */
export type EndMonth = YearMonth | "present";

export interface LinkRef {
  label: string;
  href: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  /** the company's website; without one the name shows as text */
  href?: string;
  location: string;
  role: string;
  start: YearMonth;
  end: EndMonth;
  bullets: string[];
  tags: string[];
}

export interface ProjectEntry {
  id: string;
  name: string;
  /** the iron initial hung for the project; defaults to the first letter or digit of the name */
  initial?: string;
  /** without a public website the card has no domain line and no Visit button */
  href?: string;
  /** the label under the name and on the Visit button; defaults to the link's host */
  domain?: string;
  start: YearMonth;
  end: EndMonth;
  blurb: string;
  bullets: string[];
  tags: string[];
}

export interface SkillGroupEntry {
  id: string;
  label: string;
  items: string[];
}

export interface EducationEntry {
  id: string;
  school: string;
  degree: string;
  field: string;
  /** exactly as printed on the résumé ("67.4%"); optional */
  score?: string;
  start: YearMonth;
  end: EndMonth;
}

export interface Fact {
  label: string;
  value: string;
}

/** Sections with a two-tone heading, in page order. */
export const TITLED_SECTIONS = ["about", "experience", "projects", "stack", "education", "contact"] as const;
export type TitledSectionId = (typeof TITLED_SECTIONS)[number];

export interface Content {
  version: 1;
  site: {
    title: string;
    description: string;
    /** the © year in the footer */
    year: number;
    keywords: string[];
  };
  profile: {
    name: string;
    firstName: string;
    lastName: string;
    initials: string;
    role: string;
    city: string;
    location: string;
    timezone: string;
    email: string;
    /** as displayed ("9729916844"); the tel: link adds `phoneCountryCode`; without it there is no phone row */
    phone?: string;
    phoneCountryCode: string;
    yearsExperience: number;
    eyebrow: string;
    hook: string;
    summary: string[];
    nowLine: string;
    /** root-relative path of the PDF in `public/` */
    resumePdf: string;
  };
  links: {
    site: LinkRef;
    linkedin: LinkRef;
    github: LinkRef;
  };
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  skills: SkillGroupEntry[];
  education: EducationEntry[];
  facts: Fact[];
  /** light part (weight 200) + bold part (weight 800) of each section heading */
  titles: Record<TitledSectionId, [string, string]>;
}

/**
 * Counts and lengths the layout is proven against (the max fixture fills every one; `verify:overflow` runs on it).
 * Chips and buttons never wrap, so their text limits are what keep 320 px phones free of horizontal scroll.
 */
export const LIMITS = {
  experience: { min: 1, max: 8 },
  /** each project hangs an iron initial in the hall */
  projects: { min: 1, max: 6 },
  skills: { min: 1, max: 8 },
  skillItems: { min: 1, max: 12 },
  education: { min: 1, max: 4 },
  facts: { min: 2, max: 6 },
  summary: { min: 1, max: 4 },
  bullets: { min: 1, max: 8 },
  tags: { min: 0, max: 10 },
  keywords: { min: 0, max: 20 },
  text: {
    id: 40,
    siteTitle: 80,
    description: 300,
    keyword: 40,
    name: 40,
    firstName: 20,
    lastName: 20,
    initials: 3,
    role: 40,
    city: 32,
    location: 32,
    email: 40,
    phone: 20,
    /** two lines at 320 px: one more pushes the hero buttons below a 320 × 568 screen (verify:overflow hero fit) */
    eyebrow: 44,
    hook: 160,
    summary: 400,
    nowLine: 240,
    linkLabel: 28,
    url: 200,
    company: 32,
    projectName: 32,
    domain: 48,
    blurb: 160,
    bullet: 280,
    chip: 24,
    skillLabel: 16,
    school: 64,
    degree: 48,
    field: 40,
    score: 8,
    factLabel: 16,
    factValue: 40,
    titlePart: 22,
  },
  years: { min: 0, max: 60 },
  copyrightYear: { min: 2000, max: 2100 },
} as const;

/** The first letter or digit of a name, upper-cased (the baked Anton set is A–Z and 0–9); null when there is none. */
export function defaultInitial(name: string): string | null {
  const m = /[A-Za-z0-9]/.exec(name);
  return m ? m[0].toUpperCase() : null;
}
