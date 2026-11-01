/**
 * `@content` is the portfolio content JSON. It resolves to `src/data/content.json`, or to the fixture named by
 * `CONTENT_FIXTURE` at build/test time (`next.config.ts` turbopack.resolveAlias, `vitest.config.mts` alias).
 * It is typed by the contract, not inferred from the file: `parseContent` checks the file at build time.
 */
declare module "@content" {
  const content: import("@/data/contract").Content;
  export default content;
}
