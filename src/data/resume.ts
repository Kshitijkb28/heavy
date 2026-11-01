/**
 * Portfolio content for the chrome and the stage, under the names they have always imported. Every fact lives in
 * `src/data/content.json` (`@content`), the single source of truth that the in-page editor changes; this module is a
 * typed view of it through `deriveView`. Sections render from `src/app/page.tsx`, which is also where an invalid file
 * fails the build (`parseContent`), so a bad edit never deploys.
 */
import content from "@content";
import type { SkillGroupEntry } from "./contract";
import { deriveView, type SectionMeta, type Stat, type ViewEducation, type ViewExperience, type ViewProject } from "./view";

export { content };
export type { SectionMeta };

/** The published content, derived (numbering, periods, annotations, stats, Now). */
export const view = deriveView(content);

export const SITE = view.site;
export const profile = view.profile;
export const links = view.links;

export type SkillGroup = SkillGroupEntry;
/** One group per row of the Stack section, top → bottom. */
export const skills: SkillGroup[] = view.skills;
export const allSkills: string[] = Array.from(new Set(skills.flatMap((g) => g.items)));

export type Experience = ViewExperience;
export const experience: Experience[] = view.experience;

export type Project = ViewProject;
export const projects: Project[] = view.projects;

export type Education = ViewEducation;
export const education: Education[] = view.education;

export const facts = view.facts;
export const stats: Stat[] = view.stats;

export const sections: SectionMeta[] = Object.values(view.sections);
export const sectionMeta = view.sections as Record<string, SectionMeta>;

/** Desktop top-nav links. */
export const navLinks = [
  { id: "about", label: "About" },
  { id: "experience", label: "Experience" },
  { id: "projects", label: "Projects" },
  { id: "stack", label: "Stack" },
  { id: "contact", label: "Contact" },
] as const;

/** Mobile bottom tab bar (5 items, thumb reach). */
export const tabs = [
  { id: "top", label: "Home", icon: "home" },
  { id: "about", label: "About", icon: "user" },
  { id: "experience", label: "Exp.", icon: "briefcase" },
  { id: "projects", label: "Projects", icon: "layers" },
  { id: "contact", label: "Contact", icon: "mail" },
] as const;

/** Sections that have no tab map to the nearest one. */
export const tabForSection: Record<string, string> = {
  top: "top",
  about: "about",
  experience: "experience",
  projects: "projects",
  stack: "projects",
  education: "contact",
  contact: "contact",
};

/** The slab colour ramp shared by the hero tower, skills rows, monogram ring, progress bar and favicon. */
export const ramp = {
  tangerine: "#FF6B2C",
  amber: "#FFB86B",
  mint: "#7EF2C5",
} as const;
