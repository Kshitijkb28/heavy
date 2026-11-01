import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Modules every visitor downloads (the page's client components and what they import) must not import a value from
 * the validator (`src/data/schema.ts`): a bundler keeps a shared module whole, so one value import ships `parseContent`
 * and every message to every visit. They import from `src/data/contract.ts` instead; `import type` is erased and fine.
 * (verify:publish also greps the built eager chunks.)
 */
const VISITOR_MODULES = [
  "src/data/view.ts",
  "src/data/resume.ts",
  "src/data/derived.ts",
  "src/store/editor.ts",
  "src/components/editor/slots.ts",
  "src/components/editor/token.ts",
  "src/components/editor/EditSlot.tsx",
  "src/components/editor/EditEntry.tsx",
  "src/components/scene/world/layout.ts",
];

const valueImports = (source: string) =>
  [...source.matchAll(/^import\s+(?!type\s)([\s\S]*?)\s+from\s+"([^"]+)";/gm)]
    .filter(([, what]) => !/^\{\s*(type\s+\w+\s*,?\s*)+\}$/.test(what.trim()))
    .map(([, , from]) => from);

describe("the visitor bundle stays free of the validator", () => {
  for (const file of VISITOR_MODULES) {
    it(`${file} imports no value from schema.ts`, () => {
      const source = readFileSync(path.resolve(process.cwd(), file), "utf8");
      expect(valueImports(source).filter((from) => /(^|\/)schema$/.test(from))).toEqual([]);
    });
  }
});
