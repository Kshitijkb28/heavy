import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 (`npm run build:static`, the GitHub Pages workflow) writes a fully static site to `out/`; without it the
 * default output is used (Vercel / `next start`). NEXT_PUBLIC_BASE_PATH="/repo" serves a GitHub *project* page; raw hrefs
 * (the résumé PDF) go through `withBase()` from `src/lib/base.ts` because only next/link and next/image prefix automatically.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(basePath ? { basePath } : {}),
  ...(isStaticExport ? { output: "export" as const, images: { unoptimized: true } } : {}),
  turbopack: {
    rules: {
      // Tailwind v4 processes the global stylesheet only. CSS Modules must stay modules: running them through the loader
      // with `as: "*.css"` turns every *.module.css into plain global CSS (unhashed selectors, empty imports).
      "*.css": {
        condition: { all: [{ not: "foreign" }, { not: { path: /\.module\.css$/ } }] },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
