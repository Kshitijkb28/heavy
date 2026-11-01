# HEAVY — Kshitij Bhardwaj, portfolio v3

*Everything here has weight.* The name is cast in iron and hung on chains inside one black soundstage. You can grab,
swing, throw and snap the letters (real rigid-body physics); the whole site is one camera dolly through the stage, from
the rig where the name hangs, past a hanging lamp, two lit bays, three hanging initials, a wall of tubes and a door with
light pouring in, to a look back at the lit name. Two colours of light in a black world: cold mercury from above and a
red beacon that sweeps the iron, the floor and the page.

Every fact on the page comes from `src/data/content.json`, which mirrors `public/Kshitij-Bhardwaj-Resume.pdf` and can
be edited on the live site (see [Editing the site](#editing-the-site)).

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

## Editing the site

Open the live site with `?edit` (https://kshitijkb28.github.io/heavy/?edit).

1. **Sign in.** Create a fine-grained token on GitHub (Settings → Developer settings → Personal access tokens →
   Fine-grained tokens): repository access **only this repository**, permission **Contents: Read and write** (add
   **Actions: Read-only** to see when a publish is live), expiry 90 days. Paste it into the dialog. It is only ever sent
   to api.github.com and is kept for that tab until you close it or sign out, so the top bar shows **Edit** there.
   Tick **Remember on this device** to keep it in the browser for good. Every `*.github.io` page of the account shares
   one storage, so your other Pages sites could read a remembered token: leave it off on shared computers. **Sign out**
   in the edit bar removes the token. Visitors never see any of this, and none of the editor's code loads for them.
2. **Edit.** Every section gets an Edit button. Its panel (a side panel on desktop, a bottom sheet on phones) has the
   fields, and add / remove / reorder for every list. The page updates as you type: numbering, dates, the section
   counts, the stats and the Now link follow by themselves. A field with a problem is marked where it is, and Publish
   waits until it is fixed. Websites (of a role or a project), the phone number and an education score are optional:
   without them the name shows as text, the Visit button, the phone row or the score is left out. The draft is kept in
   the browser until you publish or discard it; the next time you open the editor it offers to restore it.
3. **Publish.** One commit to `main` (`content: …`, the draft as `src/data/content.json` plus a replacement résumé PDF if
   you picked one); the Pages workflow rebuilds and the edit bar says when the site is live (about two minutes). Every
   publish is a commit, so history and rollbacks are plain git. If `content.json` changed somewhere else in between, the
   editor stops before writing anything.

What follows the content on its own: the 3D hall (one iron initial per project, up to six; the two latest companies
on the bay plates; one tube per skill group), the share image (rebuilt by the workflow) and the sitemap date. What
stays fixed: the name (the iron letters and the hero camera are measured for it) and the order and labels of the
sections. Counts and lengths are capped by `LIMITS` in `src/data/schema.ts`, the sizes the layout is proven against
from 320 px up; the build checks the file with the same rules, so an invalid commit never deploys.

Without GitHub: `npm run dev`, then http://localhost:3200/?edit=demo edits a draft that cannot publish (demo mode also
works in a build made with `NEXT_PUBLIC_EDITOR_DEMO=1`, never on the deployed site).

## Verification

```bash
npm run verify:overflow    # 11 viewports × 5 stops: no horizontal overflow, hero fit, 44 px tap targets, clean console
npm run verify:contrast    # every text/background token pair ≥ 4.5:1 (text on ink wells ≥ 13:1)
npm run verify:budget      # draw calls, triangles, bodies, frame time at each place (needs ?debug=stats)
npm run verify:lighthouse  # mobile (devtools throttling) + desktop per tier; run against the served static export
npm run verify:stops       # screenshots of the bays, every project stop and the tubes, phone + desktop (--shots=dir)
npm run verify:editor      # the editor in demo mode (a NEXT_PUBLIC_EDITOR_DEMO=1 build): every panel, live edits
npm run verify:publish     # the editor's GitHub flow against a scripted api.github.com (nothing reaches GitHub)
```

The scripts drive the system Chrome through `playwright-core` because headless Chromium's software GPU starves
`requestAnimationFrame`. `node tools/static-serve.mjs out 3201` serves the static export with brotli for Lighthouse.

Content stress tests: `src/data/fixtures/content.max.json` fills every limit and `content.min.json` keeps one of
everything. `CONTENT_FIXTURE=src/data/fixtures/content.max.json npm run build:static` builds the site from one (the
`@content` alias in `next.config.ts`); run the checks above on it. Remove `.next` before a verification build:
Turbopack's build cache can keep an old `globals.css`.

## Deploy

- **Vercel:** import the folder as a project; defaults work.
- **GitHub Pages:** push to a repository and enable Pages → "GitHub Actions". `.github/workflows/deploy.yml` builds the
  static export with the base path reported by `actions/configure-pages`, so the same workflow serves a user site
  (`<owner>.github.io`) or a project site (`<owner>.github.io/<repo>`).

## Browser support

Evergreen Chrome, Edge, Firefox and Safari 16.4+. The stage needs WebGL2; without it (or with reduced motion) the page
renders on a static poster and stays fully readable.
