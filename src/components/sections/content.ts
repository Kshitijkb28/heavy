/** Pure helpers for the sections DOM (U6). Content itself lives only in `src/data/resume.ts`. */

/** Splits `text` around the first occurrence of `needle`: [before, needle, after]; null when absent. */
export function splitOnce(text: string, needle: string): [string, string, string] | null {
  const i = needle ? text.indexOf(needle) : -1;
  if (i < 0) return null;
  return [text.slice(0, i), needle, text.slice(i + needle.length)];
}

/** "Kshitijbhardwajkb28@gmail.com" → { local: "Kshitijbhardwajkb28", domain: "gmail.com" } (a `<wbr>` goes between). */
export function splitEmail(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@");
  if (at <= 0) return { local: email, domain: "" };
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Attributes every external link carries (DESIGN.md §8). */
export const EXTERNAL = { target: "_blank", rel: "noopener noreferrer" } as const;

/** "fuse.systems" → "Visit fuse.systems" (the ↗ glyph is added by the markup). */
export function visitLabel(domain: string): string {
  return `Visit ${domain}`;
}

/** "https://www.linkedin.com/in/x/" → "linkedin.com/in/x" for the contact rows (the href stays untouched). */
export function prettyUrl(href: string): string {
  return href.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
