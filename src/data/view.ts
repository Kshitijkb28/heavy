/**
 * What the page shows, derived from the content (U6 renders it; the editor previews a draft through it). Pure: no DOM,
 * no store. Numbering, date ranges, section annotations, stats, the Now link, contact rows and the hero calls to action
 * are computed here, so adding a role or a project updates every place that mentions it.
 */
import { withBase } from "@/lib/base";
import { prettyUrl, splitOnce } from "@/components/sections/content";
import {
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
  type TitledSectionId,
  type YearMonth,
} from "./contract";

export { defaultInitial };

export interface Cta {
  label: string;
  href: string;
  variant: "primary" | "ghost" | "link";
  external?: boolean;
}

export interface Now {
  label: string;
  role: string;
  company: string;
  /** the company's website, when the role has one */
  href?: string;
}

export interface ViewProfile extends Readonly<Content["profile"]> {
  /** tel: link; absent without a phone number */
  phoneHref?: string;
  /** the current role (the first one that runs to the present); null when there is none */
  now: Now | null;
}

export interface ViewExperience extends ExperienceEntry {
  index: string;
  period: string;
}

/** Card skin: alternates for rhythm. */
export type ProjectSkin = "surface" | "tangerine" | "mint";

export interface ViewProject extends ProjectEntry {
  index: string;
  period: string;
  skin: ProjectSkin;
  /** giant letter of the card artwork and the iron initial in the hall */
  initial: string;
  /** the label under the name and on the Visit button; absent without a website or an explicit label */
  domain?: string;
}

export interface ViewEducation extends EducationEntry {
  period: string;
}

export interface Stat {
  value: number;
  suffix: string;
  label: string;
  caption?: string;
}

export interface SectionMeta {
  id: TitledSectionId;
  index: string;
  label: string;
  /** Contrast-word title: light part (weight 200) + bold part (weight 800). */
  title: [string, string];
  annotation?: string;
}

export interface ContactRow {
  label: string;
  value: string;
  href: string;
  external: boolean;
}

export interface SiteView {
  site: { url: string; name: string; title: string; description: string; year: number; keywords: readonly string[] };
  profile: ViewProfile;
  links: Content["links"];
  hero: { nameRows: [string, string]; ctas: Cta[] };
  /** the Now line split around the company it links ([before, company, after]); null when it does not name it */
  about: { nowParts: [string, string, string] | null };
  experience: ViewExperience[];
  projects: ViewProject[];
  skills: SkillGroupEntry[];
  education: ViewEducation[];
  facts: Fact[];
  stats: Stat[];
  sections: Record<TitledSectionId, SectionMeta>;
  contactRows: ContactRow[];
  footerLinks: LinkRef[];
  /** the résumé PDF with the base path (GitHub project pages) */
  resumeHref: string;
}

/** Labels of the headed sections; the two-digit index is their place on the dolly track (hero = 00). */
export const SECTION_LABELS: Record<TitledSectionId, string> = {
  about: "About",
  experience: "Experience",
  projects: "Projects",
  stack: "Stack",
  education: "Education",
  contact: "Contact",
};

const SKINS: readonly ProjectSkin[] = ["surface", "tangerine", "mint"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n: number) => String(n).padStart(2, "0");
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** "2026-01" → "Jan 2026" */
export function formatMonth(month: YearMonth): string {
  const [year, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${year}`;
}

/** "Jan 2026 – Present" (en dash, as on the résumé) */
export function formatPeriod(start: YearMonth, end: EndMonth): string {
  return `${formatMonth(start)} – ${end === "present" ? "Present" : formatMonth(end)}`;
}

/** "2023 — present" / "2023 — 2025" / "2025" over a list of date ranges (em dash, as in the section annotations). */
function yearSpan(ranges: readonly { start: YearMonth; end: EndMonth }[]): string {
  const first = Math.min(...ranges.map((r) => Number(r.start.slice(0, 4))));
  if (ranges.some((r) => r.end === "present")) return `${first} — present`;
  const last = Math.max(...ranges.map((r) => Number((r.end as string).slice(0, 4))));
  return first === last ? String(first) : `${first} — ${last}`;
}

/** Up to three names joined by " · ", then "+N more". */
export function captionList(names: readonly string[], max = 3): string {
  const shown = names.slice(0, max).join(" · ");
  return names.length > max ? `${shown} +${names.length - max} more` : shown;
}

/** "https://www.ethara.ai/careers" → "ethara.ai" */
export function defaultDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return prettyUrl(href);
  }
}

/** tel: link: the country code, then the displayed number's digits. */
export function phoneHref(countryCode: string, phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.trim().startsWith("+") ? `tel:+${digits}` : `tel:${countryCode}${digits}`;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kshitijkb28.github.io";

export function deriveView(content: Content): SiteView {
  const { profile, links } = content;
  const current = content.experience.find((j) => j.end === "present");
  const now: Now | null = current ? { label: "Now", role: current.role, company: current.company, ...(current.href ? { href: current.href } : {}) } : null;
  const resumeHref = withBase(profile.resumePdf);

  const companies: string[] = [];
  for (const j of content.experience) {
    if (!companies.some((c) => c.toLowerCase() === j.company.trim().toLowerCase())) companies.push(j.company.trim());
  }
  const chips = content.skills.reduce((n, g) => n + g.items.length, 0);
  const years = profile.yearsExperience;

  const annotations: Partial<Record<TitledSectionId, string>> = {
    experience: `${content.experience.length} ${plural(content.experience.length, "role")} · ${yearSpan(content.experience)}`,
    projects: `${content.projects.length} ${plural(content.projects.length, "product")} · ${yearSpan(content.projects)}`,
    stack: `${chips} ${plural(chips, "tool")} · ${content.skills.length} ${plural(content.skills.length, "layer")}`,
  };
  const sections = Object.fromEntries(
    TITLED_SECTIONS.map((id, i): [TitledSectionId, SectionMeta] => {
      const meta: SectionMeta = { id, index: pad2(i + 1), label: SECTION_LABELS[id], title: content.titles[id] };
      const annotation = annotations[id];
      return [id, annotation ? { ...meta, annotation } : meta];
    }),
  ) as Record<TitledSectionId, SectionMeta>;

  return {
    site: { url: SITE_URL, name: profile.name, title: content.site.title, description: content.site.description, year: content.site.year, keywords: content.site.keywords },
    profile: { ...profile, ...(profile.phone ? { phoneHref: phoneHref(profile.phoneCountryCode, profile.phone) } : {}), now },
    links,
    hero: {
      nameRows: [profile.firstName.toUpperCase(), profile.lastName.toUpperCase()],
      ctas: [
        { label: "View projects", href: "#projects", variant: "primary" },
        { label: "Email", href: `mailto:${profile.email}`, variant: "ghost" },
        { label: "Résumé (PDF)", href: resumeHref, variant: "link", external: true },
      ],
    },
    about: { nowParts: now ? splitOnce(profile.nowLine, now.company) : null },
    experience: content.experience.map((j, i) => ({ ...j, index: pad2(i + 1), period: formatPeriod(j.start, j.end) })),
    projects: content.projects.map((p, i) => ({
      ...p,
      index: pad2(i + 1),
      period: formatPeriod(p.start, p.end),
      skin: SKINS[i % SKINS.length],
      initial: p.initial ?? defaultInitial(p.name) ?? "?",
      ...(p.domain ? { domain: p.domain } : p.href ? { domain: defaultDomain(p.href) } : {}),
    })),
    skills: content.skills,
    education: content.education.map((e) => ({ ...e, period: formatPeriod(e.start, e.end) })),
    facts: content.facts,
    stats: [
      { value: years, suffix: years === 1 ? " yr" : " yrs", label: "Hands-on experience" },
      { value: companies.length, suffix: "", label: plural(companies.length, "Company", "Companies"), caption: captionList(companies) },
      { value: content.projects.length, suffix: "", label: plural(content.projects.length, "Product"), caption: captionList(content.projects.map((p) => p.name)) },
    ],
    sections,
    contactRows: [
      { label: "Email", value: profile.email, href: `mailto:${profile.email}`, external: false },
      ...(profile.phone ? [{ label: "Phone", value: profile.phone, href: phoneHref(profile.phoneCountryCode, profile.phone), external: false }] : []),
      { label: "LinkedIn", value: prettyUrl(links.linkedin.href), href: links.linkedin.href, external: true },
      { label: "GitHub", value: prettyUrl(links.github.href), href: links.github.href, external: true },
    ],
    footerLinks: [links.linkedin, links.github, links.site],
    resumeHref,
  };
}
