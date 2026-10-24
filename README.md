# HEAVY — Kshitij Bhardwaj, portfolio v3

*Everything here has weight.* The name is cast in iron and hung on chains inside one black soundstage. You can grab,
swing, throw and snap the letters (real rigid-body physics); the whole site is one camera dolly through the stage, from
the rig where the name hangs, past a hanging lamp, two lit bays, three hanging initials, a wall of tubes and a door with
light pouring in, to a look back at the lit name. Two colours of light in a black world: cold mercury from above and a
red beacon that sweeps the iron, the floor and the page.

Every fact on the page comes from `src/data/resume.ts`, which mirrors `public/Kshitij-Bhardwaj-Resume.pdf`.

## Run

```bash
npm install
npm run dev          # http://localhost:3200
npm run build        # production build (Vercel / next start)
npm start            # serves the production build on :3200
npm run build:static # static export to out/ (GitHub Pages); honours NEXT_PUBLIC_BASE_PATH and NEXT_PUBLIC_SITE_URL
npm run bake:typeface  # regenerates public/fonts/anton.typeface.json from tools/fonts/Anton-Regular.ttf (OFL)
```

Quality gate: `npx tsc --noEmit && npm run lint && npm test && npm run build`.

## How it is built

| Layer | Where | Notes |
| --- | --- | --- |
| Page, sections, chrome | `src/app`, `src/components/{sections,chrome,motion}` | Next.js 16 App Router, React 19, server-rendered text; readable at 0 ms without JavaScript |
| Stage | `src/components/scene/**`, `src/lib/scene/**` | React Three Fiber canvas behind the page; iron letters (extruded Anton), Rapier physics with rope joints, the hall, lights, volumes, camera dolly, post-processing on the high tier |
| Contracts | `src/lib/{contracts,scene-state,registry}.ts` | Tiers and budgets, the 60 Hz scene state singleton, grabbable and section registries |
| Tokens | `src/app/globals.css` | "Night Rig" palette, Anton / Geist / Geist Mono, reduced-motion rules |

Design spec and as-built notes: `docs/DESIGN.md` (§11 lists what changed while integrating — read it before tuning).

### Loading order

The page is plain server-rendered HTML first (the name is the LCP, over a CSS poster of the stage). After the load
event and the fonts, an idle slot requests the scene chunk; it mounts inside a React transition all at once (the set
of lights never changes afterwards, which would recompile every lit material) while the camera looks at an empty layer
and `renderer.compileAsync` links every shader program in the background, so no load task runs long. Then the camera
sees the hall, the poster fades and the letters drop into the place of the typeset name. The physics engine (Rapier,
WebAssembly) loads with the drop: at idle on desktop and fast phones, on the first touch of the stage otherwise; until
then the letters sway kinematically.

### Tiers and switches

The stage picks a tier from the device (`high`, `mid`, `low`) and steps itself down if frames run long; `low` (reduced
motion, Data Saver, no hardware WebGL2) shows a CSS poster under the same page. URL switches for testing:
`?tier=high|mid|low`, `?debug=stats` (overlay with fps, draw calls, triangles, bodies, dpr, journey position).

## Verification

```bash
npm run verify:overflow    # 11 viewports × 5 stops: no horizontal overflow, hero fit, 44 px tap targets, clean console
npm run verify:contrast    # every text/background token pair ≥ 4.5:1 (text on ink wells ≥ 13:1)
npm run verify:budget      # draw calls, triangles, bodies, frame time at each place (needs ?debug=stats)
npm run verify:lighthouse  # mobile (devtools throttling) + desktop per tier; run against the served static export
```

The scripts drive the system Chrome through `playwright-core` because headless Chromium's software GPU starves
`requestAnimationFrame`. `node tools/static-serve.mjs out 3201` serves the static export with brotli for Lighthouse.

## Deploy

- **Vercel:** import the folder as a project; defaults work.
- **GitHub Pages:** push to a repository and enable Pages → "GitHub Actions". `.github/workflows/deploy.yml` builds the
  static export with the base path reported by `actions/configure-pages`, so the same workflow serves a user site
  (`<owner>.github.io`) or a project site (`<owner>.github.io/<repo>`).

## Browser support

Evergreen Chrome, Edge, Firefox and Safari 16.4+. The stage needs WebGL2; without it (or with reduced motion) the page
renders on a static poster and stays fully readable.
