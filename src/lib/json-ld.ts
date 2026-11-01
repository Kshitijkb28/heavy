/**
 * JSON for a `<script type="application/ld+json">`: `<` is written as `<`, so no value (company names and roles are
 * editable) can close the script element. Same JSON when parsed (node_modules/next/dist/docs/01-app/02-guides/json-ld.md).
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
