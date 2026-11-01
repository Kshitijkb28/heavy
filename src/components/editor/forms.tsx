/** One form per editor panel. Fields edit the draft by path; limits come from `LIMITS` (src/data/schema.ts). */
import { useState, type ComponentType } from "react";
import { LIMITS, type TitledSectionId } from "@/data/schema";
import { defaultDomain, defaultInitial } from "@/data/view";
import type { PanelId } from "@/lib/content-diff";
import { useEditor } from "@/store/editor";
import { blankEntry } from "./draft";
import { ListEditor, MonthField, NumberField, TagsField, TextField, useDraft } from "./fields";
import styles from "./editor.module.css";

const T = LIMITS.text;
/** a replacement résumé may be at most this large (the GitHub API takes it as one base64 blob) */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024;

function TitleFields({ id }: { id: TitledSectionId }) {
  return (
    <div className={styles.row}>
      <TextField path={["titles", id, 0]} label="Heading, light" max={T.titlePart} />
      <TextField path={["titles", id, 1]} label="Heading, bold" max={T.titlePart} />
    </div>
  );
}

function Bullets({ path }: { path: (string | number)[] }) {
  return (
    <ListEditor<string> path={path} label="Bullets" noun="bullet" min={LIMITS.bullets.min} max={LIMITS.bullets.max} make={() => ""}>
      {(_, i, p) => <TextField path={p} label={`Bullet ${i + 1}`} max={T.bullet} multiline />}
    </ListEditor>
  );
}

function HeroForm() {
  const { draft } = useDraft();
  return (
    <>
      <p className={styles.note}>
        The iron name <strong>{`${draft.profile.firstName} ${draft.profile.lastName}`}</strong> is cast for the 3D hall and stays as it is.
      </p>
      <TextField path={["profile", "eyebrow"]} label="Line above the name" max={T.eyebrow} />
      <TextField path={["profile", "hook"]} label="Intro" max={T.hook} multiline />
      <TextField path={["profile", "role"]} label="Role" max={T.role} hint="Beside your name in the footer and in search results." />
    </>
  );
}

function AboutForm() {
  const { draft } = useDraft();
  const current = draft.experience.find((j) => j.end === "present");
  const nowHint = !current
    ? "No role runs to the present, so the line shows as plain text."
    : !current.href
      ? `${current.company} has no website in Experience, so the line shows as plain text.`
      : draft.profile.nowLine.includes(current.company)
      ? `"${current.company}" in the line links to its website.`
      : `Mention "${current.company}" to link it to its website.`;
  return (
    <>
      <TitleFields id="about" />
      <ListEditor<string> path={["profile", "summary"]} label="Summary" noun="paragraph" min={LIMITS.summary.min} max={LIMITS.summary.max} make={() => ""}>
        {(_, i, p) => <TextField path={p} label={`Paragraph ${i + 1}`} max={T.summary} multiline />}
      </ListEditor>
      <TextField path={["profile", "nowLine"]} label="Now" max={T.nowLine} multiline hint={nowHint} />
      <NumberField path={["profile", "yearsExperience"]} label="Years of experience" min={LIMITS.years.min} max={LIMITS.years.max} hint="The first stat. Companies and products are counted for you." />
      <ListEditor path={["facts"]} label="Facts" noun="fact" min={LIMITS.facts.min} max={LIMITS.facts.max} make={() => blankEntry("facts", draft)} title={(f) => f.label}>
        {(_, i, p) => (
          <div className={styles.row}>
            <TextField path={[...p, "label"]} label="Label" max={T.factLabel} />
            <TextField path={[...p, "value"]} label="Value" max={T.factValue} />
          </div>
        )}
      </ListEditor>
    </>
  );
}

function ExperienceForm() {
  const { draft } = useDraft();
  return (
    <>
      <TitleFields id="experience" />
      <p className={styles.note}>Newest first. Numbering, dates and the heading&rsquo;s count update by themselves; the first two companies are cast on the iron plates in the hall when you publish.</p>
      <ListEditor path={["experience"]} label="Roles" noun="role" min={LIMITS.experience.min} max={LIMITS.experience.max} addAt="start" make={() => blankEntry("experience", draft)} title={(j) => j.company}>
        {(_, i, p) => (
          <>
            <TextField path={[...p, "company"]} label="Company" max={T.company} />
            <TextField path={[...p, "href"]} label="Company website" type="url" placeholder="https://" max={T.url} optional hint="Optional: without it the name shows as plain text." />
            <div className={styles.row}>
              <TextField path={[...p, "role"]} label="Role" max={T.role} />
              <TextField path={[...p, "location"]} label="Location" max={T.location} />
            </div>
            <div className={styles.row}>
              <MonthField path={[...p, "start"]} label="From" />
              <MonthField path={[...p, "end"]} label="To" allowPresent />
            </div>
            <Bullets path={[...p, "bullets"]} />
            <TagsField path={[...p, "tags"]} label="Tools" max={LIMITS.tags.max} maxLength={T.chip} />
          </>
        )}
      </ListEditor>
    </>
  );
}

function ProjectsForm() {
  const { draft } = useDraft();
  return (
    <>
      <TitleFields id="projects" />
      <p className={styles.note}>Up to {LIMITS.projects.max}: each project hangs an iron initial in the hall, added when you publish.</p>
      <ListEditor path={["projects"]} label="Projects" noun="project" min={LIMITS.projects.min} max={LIMITS.projects.max} addAt="start" make={() => blankEntry("projects", draft)} title={(p) => p.name}>
        {(project, i, p) => (
          <>
            <TextField path={[...p, "name"]} label="Name" max={T.projectName} />
            <TextField path={[...p, "href"]} label="Website" type="url" placeholder="https://" max={T.url} optional hint="Optional: without it there is no Visit button." />
            <div className={styles.row}>
              <TextField
                path={[...p, "initial"]}
                label="Iron initial"
                max={1}
                optional
                normalise={(v) => v.toUpperCase()}
                placeholder={defaultInitial(project.name) ?? "?"}
                hint="Empty: the name's first letter."
              />
              <TextField path={[...p, "domain"]} label="Domain label" max={T.domain} optional placeholder={project.href ? defaultDomain(project.href) : "example.com"} hint="Empty: from the website." />
            </div>
            <div className={styles.row}>
              <MonthField path={[...p, "start"]} label="From" />
              <MonthField path={[...p, "end"]} label="To" allowPresent />
            </div>
            <TextField path={[...p, "blurb"]} label="One-line summary" max={T.blurb} multiline />
            <Bullets path={[...p, "bullets"]} />
            <TagsField path={[...p, "tags"]} label="Tools" max={LIMITS.tags.max} maxLength={T.chip} />
          </>
        )}
      </ListEditor>
    </>
  );
}

function StackForm() {
  const { draft } = useDraft();
  return (
    <>
      <TitleFields id="stack" />
      <p className={styles.note}>One row per group, top to bottom; each group lights one tube in the hall when you publish.</p>
      <ListEditor path={["skills"]} label="Groups" noun="group" min={LIMITS.skills.min} max={LIMITS.skills.max} make={() => blankEntry("skills", draft)} title={(g) => g.label}>
        {(_, i, p) => (
          <>
            <TextField path={[...p, "label"]} label="Group name" max={T.skillLabel} />
            <TagsField path={[...p, "items"]} label="Tools" max={LIMITS.skillItems.max} maxLength={T.chip} />
          </>
        )}
      </ListEditor>
    </>
  );
}

function EducationForm() {
  const { draft } = useDraft();
  return (
    <>
      <TitleFields id="education" />
      <ListEditor path={["education"]} label="Schools" noun="school" min={LIMITS.education.min} max={LIMITS.education.max} addAt="start" make={() => blankEntry("education", draft)} title={(e) => e.school}>
        {(_, i, p) => (
          <>
            <TextField path={[...p, "school"]} label="School" max={T.school} />
            <div className={styles.row}>
              <TextField path={[...p, "degree"]} label="Degree" max={T.degree} />
              <TextField path={[...p, "field"]} label="Field" max={T.field} />
            </div>
            <TextField path={[...p, "score"]} label="Score" max={T.score} optional hint="Optional. Exactly as printed, e.g. 67.4% or 8.2 CGPA." />
            <div className={styles.row}>
              <MonthField path={[...p, "start"]} label="From" />
              <MonthField path={[...p, "end"]} label="To" allowPresent />
            </div>
          </>
        )}
      </ListEditor>
    </>
  );
}

function ResumeField() {
  const mode = useEditor((s) => s.mode);
  const file = useEditor((s) => s.resumeFile);
  const setFile = useEditor((s) => s.setResumeFile);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor="editor-resume">
        Résumé (PDF)
      </label>
      <input
        id="editor-resume"
        className={styles.input}
        type="file"
        accept="application/pdf"
        disabled={mode === "demo"}
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          if (picked && (picked.type !== "application/pdf" || picked.size > RESUME_MAX_BYTES)) {
            setError(`Pick a PDF of at most ${RESUME_MAX_BYTES / 1024 / 1024} MB.`);
            setFile(null);
            e.target.value = "";
            return;
          }
          setError(null);
          setFile(picked);
        }}
      />
      {error ? (
        <p className={styles.error}>{error}</p>
      ) : (
        <p className={styles.hint}>
          {mode === "demo" ? "Demo mode: nothing is uploaded." : file ? `${file.name} replaces the résumé when you publish.` : "Replaces the PDF at the same address, so every link keeps working."}
        </p>
      )}
      {file ? (
        <button type="button" className={`${styles.button} ${styles.quiet}`} onClick={() => setFile(null)}>
          Keep the current PDF
        </button>
      ) : null}
    </div>
  );
}

function ContactForm() {
  return (
    <>
      <TitleFields id="contact" />
      <TextField path={["profile", "email"]} label="Email" type="email" max={T.email} hint="Also the big address on the page." />
      <div className={styles.row}>
        <TextField path={["profile", "phoneCountryCode"]} label="Country code" max={5} placeholder="+91" />
        <TextField path={["profile", "phone"]} label="Phone, as shown" type="tel" max={T.phone} optional hint="Empty hides the phone row." />
      </div>
      <div className={styles.row}>
        <TextField path={["profile", "location"]} label="Location" max={T.location} />
        <TextField path={["profile", "city"]} label="City" max={T.city} hint="For search results." />
      </div>
      <TextField path={["profile", "timezone"]} label="Time zone" max={64} placeholder="Asia/Kolkata" hint="Drives the live local time beside your location." />
      {(["linkedin", "github", "site"] as const).map((key) => (
        <div key={key} className={styles.row}>
          <TextField path={["links", key, "label"]} label={key === "site" ? "Site label" : `${key === "linkedin" ? "LinkedIn" : "GitHub"} label`} max={T.linkLabel} />
          <TextField path={["links", key, "href"]} label="Link" type="url" placeholder="https://" max={T.url} />
        </div>
      ))}
      <ResumeField />
    </>
  );
}

function SiteForm() {
  return (
    <>
      <TextField path={["site", "title"]} label="Page title" max={T.siteTitle} hint="The browser tab and search results." />
      <TextField path={["site", "description"]} label="Description" max={T.description} multiline hint="Search results and link previews." />
      <TagsField path={["site", "keywords"]} label="Keywords" max={LIMITS.keywords.max} maxLength={T.keyword} />
      <NumberField path={["site", "year"]} label="© year" min={LIMITS.copyrightYear.min} max={LIMITS.copyrightYear.max} />
    </>
  );
}

export const PANELS: Record<PanelId, { title: string; Form: ComponentType }> = {
  hero: { title: "Hero", Form: HeroForm },
  about: { title: "About", Form: AboutForm },
  experience: { title: "Experience", Form: ExperienceForm },
  projects: { title: "Projects", Form: ProjectsForm },
  stack: { title: "Stack", Form: StackForm },
  education: { title: "Education", Form: EducationForm },
  contact: { title: "Contact", Form: ContactForm },
  site: { title: "Site settings", Form: SiteForm },
};
