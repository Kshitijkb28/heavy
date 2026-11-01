# HEAVY — design spec (portfolio v3)

*Everything here has weight.* Kshitij's name is cast in iron and hung on chains inside one black soundstage. You grab, swing, throw and snap the letters. The whole site is one camera dolly through that stage, from the rig where the name hangs to a door at the far end, and back. Nothing floats and nothing eases weightlessly: things drop, swing, clatter and settle.

Why this exists: v1 (warm glass tower) is live; v2 (ivory flip-dot board) was rejected by the owner ("i dont like full white designs and also u can built something better"). The owner chose a new concept, dark, with all four of: cinematic 3D scenes and shaders · playable physical interaction · giant typographic motion · immersive continuous-scroll storytelling. Content comes only from `src/data/resume.ts` (verbatim from the résumé PDF). Phones must be flawless. Decide everything; never ask the owner.

## 1. Art direction — "Night Rig"

| Token | Value | Use |
|---|---|---|
| `--void` | `#050507` | page, world, canvas clear colour |
| `--floor` | `#0B0C10` | wet concrete |
| `--iron` | `#2A2D34` | cast-iron letters (material base colour) |
| `--steel` | `#596270` | hairlines, chains, rail |
| `--text` | `#E8ECF2` | body text (≥ 13:1 on void) |
| `--muted` | `#9AA3AF` | secondary text (7.9:1 on void) |
| `--mercury` | `#D7E6FF` | key-light white; h1, big titles, giant email |
| `--signal` | `#FF3355` | beacon red; accent text only at ≥ 16 px / 500 (5.6:1), focus ring, track marker, primary button fill (void text) |
| `--signal-deep` | `#7A0F23` | glows and scrims only, never text |
| `--seam` | `rgba(232,236,242,.08)` | borders |

Two colours of light in a black world: cold mercury from above, red from a turning beacon. Dark only, no theme toggle.

**Type** (next/font/google, latin): **Anton** 400 — h1, h2, index numerals, the giant email, and the 3D iron glyphs (same face in DOM and metal; `font-kerning: none`, `letter-spacing: .02em`, uppercase). **Geist** variable — body and UI. **Geist Mono** — eyebrow, dates, labels, the track. Scale: `--t-hero clamp(3.4rem, 15vw, 15rem)`, `--t-1`, `--t-2`, `--t-body`, `--t-small`, `--t-mono` (see `globals.css`).

**Materials.** Cast iron (MeshPhysicalMaterial: color `--iron`, metalness .9, roughness .45, bevelled edges; anisotropy .6 on high; `emissive` `--signal` used only as the heat pulse). Black steel chain links (metalness 1, roughness .35). Wet polished concrete (CSM over MeshStandardMaterial: procedural roughness noise, wetness darkening, beacon rake). Exponential black haze `FogExp2(#050507, .045)`.

**Signature effects.** (1) **Beacon sweep** — a red point light on a mast turns once every 9 s; its angle is written to `--beacon` (0 → 1 per turn) so DOM headings and the rail marker glint when it passes. (2) **Hand light** — on fine pointers a small cold point light rides 0.6 u in front of the pointer's world position, raking highlights across the iron. (3) **Heat** — a contact above threshold flashes a signal-red emissive pulse on the letter's bevels (decays over 400 ms) plus a 120 ms additive flash sprite at the contact point.

**Motion language.** Gravity, not easing curves: drops with a bounce (`--ease-drop`), swings that damp, hoists that are deliberate; DOM reveals are "weight drops" (SplitText lines fall 12 px into place, 500 ms, 40 ms stagger). Never a fade-in-from-nowhere for anything heavy.

**Why unmistakable.** v1 was warm pastel glass you lean and spin under a navy sky; v2 was ivory paper and a binary flip-dot machine. HEAVY is a black film set with iron, chains, cold light and one red beacon; the name is the physics toy; navigation is a dolly track.

## 2. The experience (first paint to footer)

Black page, the name set large in white Anton under a cold pool of light — readable at 0 ms (the h1 is the LCP). Within a second the letters drop from the ceiling on chains, catch with a bounce, sway, mirrored in the wet floor; dust drifts through the light cone; the beacon starts to turn. Grab the B, throw it, it clatters into the H; thrown hard its chain snaps, it falls and lies on the floor until, six seconds later, it is hoisted back up. Scrolling, the camera dollies past the rig to a hanging work lamp (About) you can push, swinging real light across the text; down the hall two steel bays glow for Ethara AI and Mind2web; three iron initials Y, R, S hang beside their projects; five fluorescent tubes flicker on, one per skill group; at the far wall a door stands ajar with light pouring in (Education); the camera pushes through, turns, and looks back down the hall at the lit name (Contact) while the email, in giant type, is raked by the beacon. The footer is the last mark on the track; Back to top flies you home through the hall.

## 3. World, units and the journey

World units: metres. Floor at y = 0, the hall runs along −z for 70 m, x spans ±12 m. The hero rig (rail at y 5.2, letters hanging at rows y 3.1 / 1.7) is centred at z = 0. Camera fov 32° by default; `frame.ts` (U5) solves the camera distance so the name block spans 72 % of the viewport width on landscape and 88 % on portrait.

Journey parameter `t ∈ [0, 7]` = section index + local progress (`sceneState.t`, written only by U5's scroll writer from the measured `[data-section]` rects). The camera follows a Catmull-Rom spline through `places.ts` keyframes (U5; one table per aspect), damped with λ = 4 so it lags like a dolly on rails.

| t | Place | Camera | Lit thing (U4 unless noted) | DOM composition (U6) |
|---|---|---|---|---|
| 0 | Hero | front, low, looking up at the rig | the name on chains (U2/U3) | eyebrow, h1, hook + CTAs bottom-left on a scrim (phones: letters top 55svh, text below) |
| 1 | About | dollies right and closer; rig slides out left | hanging work lamp, pushable damped pendulum, its spotlight moves | `summary`, `nowLine` + Ethara link, `facts` 2×2, `stats`; right 55 % desktop, under the lamp on phones |
| 2 | Experience | along the hall | two recessed steel bays, each with a cold tube and an iron plate ETHARA AI / MIND2WEB LLP (merged TextGeometry); the bay nearest the viewport centre lights | entries in résumé order: index, company link, role, location, period, bullets, tags; sticky left column desktop |
| 3–3.99 | Projects | three sub-stops framing each initial at NDC (0.55, 0.05) desktop / (0, 0.45) phones | iron Y, R, S on chains at z −24 / −30 / −36 (U3, same system as the name) | card: index, name, period, domain, blurb, bullets, tags, Visit domain ↗ |
| 4 | Stack | faces the right wall | five tubes flicker on in order as the section enters | five rows level with their tube: label + chips (17 entries; JavaScript twice, as on the résumé) |
| 5 | Education | approaches the far wall | a 3.2 m door ajar, light pouring in (cone, dust, bloom) | two rows: school, degree · field, score, period |
| 6 | Contact | through the door, turns 180°, looks back at the lit name | the whole hall far and small; the beacon rakes the email | giant `profile.email` (Anton, mercury; click copies + toast), rows Email / Phone / LinkedIn / GitHub / Location + IST time, Résumé button |
| 7 | Footer | holds | — | name · role, location · © 2026, LinkedIn, GitHub, site, Back to top |

**Readability rules.** Every DOM text block sits in an `.ink-well` (scrim `#050507` 92 % → 0 over 24 px); lit objects are framed in the half (desktop) or third (phone) of the viewport the text does not use; fog darkens everything behind text; no text over the key-light pool; measured text contrast ≥ 13:1 on the brightest scrim pixel; accent red only ≥ 16 px/500. **Anchors.** Section ids with `scroll-margin-top`; `/#projects` resolves on mount with an instant jump (`t` set directly, no fly-through); track/sheet links `replaceState` the hash and scroll (Lenis on desktop, native smooth on phones): the dolly flight is the transition.

## 4. Hero mechanics

- **3D type.** `public/fonts/anton.typeface.json` (baked by `scripts/bake-typeface.mjs`, 43 glyphs: A–Z, 0–9, `.@-&'? `). `TextGeometry` per letter (size 1, depth .35, bevelEnabled, bevelThickness .04, bevelSize .03, bevelSegments 2, curveSegments from `TierConfig`), extruded three glyphs per frame on mount so nothing blocks. Each letter is centred on its own origin (bounding box centre) so bodies rotate about their centre. Reflection: a mirrored clone (scale.y −1, clipped at y ≤ 0, alpha fades with depth via CSM) on tiers with `reflections`.
- **Lighting.** Key spotlight (`--mercury`, 38° cone, position (0, 7, 4), penumbra .5, shadows on high, 1024 PCFSoft); beacon point light on a mast at (−6, 4.5, −3); hemisphere fill (sky `#1a1d26`, ground `#050507`, .35); hand light (fine pointers, `--mercury`, intensity 4, distance 6); `Environment` with two `Lightformer`s (overhead mercury strip, red side strip), resolution 64, once.
- **Physics.** `@react-three/rapier` 2.2.0 (`@dimforge/rapier3d-compat` 0.19.2, ≈ 1 MB brotli): loaded lazily — desktop at idle after LCP (≤ 1.5 s), phones at idle when `navigator.connection.effectiveType === "4g"` and not saveData, otherwise on the first canvas `pointerdown`. Until it lands: scripted kinematic sway + a fake hover spring. World gravity (0, −9.81, 0). Letters: dynamic, hull collider from ≤ 64 sampled glyph vertices, mass 12, restitution .15, friction .6, linear damping .25, angular damping .4, `canSleep`. Each letter hangs from a fixed anchor body by a **rope joint** (`useRopeJoint`, length 1.8–2.4, slack allowed, so a letter thrown upward goes slack then snaps taut). Chains: one `InstancedMesh` of torus links (10 per letter) laid along anchor → letter each frame (150 instances, one draw call). Static floor collider at y 0 and invisible walls at the viewport edges (rebuilt on resize) so nothing leaves the screen.
- **Grab / throw.** Desktop: `pointerdown` raycasts the registered grabbables; while held, a hand-spring impulse at the grab point toward the pointer projected onto the camera-facing plane through that point (k = 60·mass, c = 8·mass, capped); release keeps the body's velocity (the throw); cursors `grab` / `grabbing`. Touch: canvas `touch-action: pan-y`; a grab starts only on **hold ≥ 180 ms with < 6 px movement** or a horizontal move > 8 px with |dx| > |dy|; only then `setPointerCapture` and a non-passive `touchmove` `preventDefault` while the grab is live; `pointercancel` drops it; a plain tap nudges. **Vertical pan always scrolls.**
- **Break / hoist.** Rope tension or contact impulse above 1.4× the letter's weight snaps the rope (joint removed; the top link flies; the letter falls and lies on the floor as a free body you can keep kicking). After 6 s without interaction a hoist lerps it kinematically home (1.2 s, `--ease-out`) and the joint re-attaches. Contacts above threshold fire the heat pulse + flash sprite (U2 material API + U3 handler).
- **Idle.** A small breeze impulse every 4 s keeps the rig swaying; the beacon turns; dust drifts. After 8 s without input and all bodies asleep → render every other frame; 60 s → demand mode, woken by any input (U5 `loop.ts`).
- **Keyboard.** A real 44 px `<button>` "Give the letters a push" (quiet style, bottom-right of the hero) applies random impulses (`pushAll()`); Space/arrows while it is focused push again / bias direction.
- **Entrance.** 0 ms: SSR paints the CSS spot pool, the h1 and the copy (no gating of hero text). ~120 ms: fonts swap with size-adjusted fallbacks (CLS 0). ~700–1000 ms: three chunk + typeface + scene mount; the letters **drop** from the rail (physical if Rapier is ready, scripted bounce otherwise) and catch at rope length in 0.9 s while the DOM h1 fades to opacity 0 over 300 ms (it stays in the DOM; `sceneState.entered = true` when settled); dust and cone fade in; T+1.2 s the beacon spins up. All live by ≤ 3 s. If the visitor scrolls before T, the drop is skipped (letters start hanging).

## 5. Navigation and chrome (U1)

Top: "Kshitij Bhardwaj" left (home link, mono — the name is always readable as text) and "Résumé ↗" right; 44 px targets; safe-area insets; a top scrim gradient instead of a bar. Desktop (≥ 1024 px): **the Dolly Track** — fixed bottom rail: 1 px `--steel` hairline, seven station ticks HOME … CONTACT in mono, a `--signal` marker sliding with scroll progress (`sceneState.t / 6`), the active tick lit; `<nav aria-label="Sections">` of real links. Phone: a 48 px round **stage counter** bottom-right ("03", mono) opening a bottom-sheet `<dialog>` (`showModal`: focus trap, Esc, backdrop click) with 56 px rows for the seven places plus Résumé, LinkedIn, GitHub, email; `overscroll-behavior: contain`; body scroll locked while open. Cursor: native (`grab`/`grabbing` over iron). No sound. Toast: polite status at the bottom centre, above the safe area.

## 6. Rendering architecture

- **Canvas** (I1 `Stage.tsx`): fixed, `100vw × 100lvh`, `z-index 0`, behind `<main class="page">` (`z-index 1`, `pointer-events: none` except text and controls — see `.page` in `globals.css`). R3F `<Canvas dpr={cfg.dpr} gl={{ antialias: cfg.antialias, powerPreference: "high-performance", stencil: false, alpha: false }} camera={{ fov: 32, near: .1, far: 120 }} shadows={cfg.shadows} frameloop="always">`; `scene.background` void, `scene.fog` FogExp2; ACES tone mapping. The canvas is `aria-hidden` and never in the tab order. Mounted only when `tier !== "low"`, via `next/dynamic({ ssr: false })` requested at idle (≤ 1.2 s cap).
- **Scene graph:** `<Stage>` → `<Physics timeStep={1/60} updateLoop="independent" interpolate paused={!active}>` → `<Rig>` (U3: letters, anchors, chains, walls, floor collider) + `<Initials>` (U3); `<World>` (U4: floor, walls, bays, tubes, door, mast); `<Lights>`, `<Lamp>`, `<Beacon>`, `<HandLight>`, `<Volumes>` (U4); `<CameraRig>` (U5); `<Effects>` (U8, high only).
- **Shaders (U4 unless noted):** VolumeCone (fresnel × height falloff × 2-octave hash noise, additive, `depthWrite: false`, ≈ 0.3 ms/phone, ≤ 2 cones); Dust (points, soft disc, drift); Floor CSM (U2 `materials.ts`); ReflectionFade CSM (U2); GlowSprite (≤ 10 additive radial quads standing in for bloom on mid).
- **Post (U8, high only):** `EffectComposer multisampling={0}` → Bloom (mipmapBlur, luminanceThreshold .8, intensity .6) → SMAA → Vignette (offset .2, darkness .55) → ChromaticAberration (.0008) → ToneMapping. ≈ 2.5 ms at 1440p.
- **Scroll ↔ scene:** `src/lib/scene-state.ts` is the single source of truth; written by U5's scroll writer, U3's input layer, U4's beacon, U5's loop, U8's tier/ladder; read in `useFrame` only. `store/ui.ts` (zustand) holds tier, active section, sheet open, hint, toast, physics status, poster.
- **Stepping and pausing (U5 `loop.ts`):** physics steps with a fixed 1/60 accumulator, max 3 substeps, dt clamped to 1/30 after a hidden tab; hidden tab → `frameloop="never"` and physics paused; 8 s idle → half rate; 60 s → demand. **Context loss (U8):** `webglcontextlost` → preventDefault, poster shown, one remount retry after 1 s, else the poster stays. **Runtime ladder (U8 `useFrameGuard.ts`, never promotes):** 60-frame rolling mean > 22 ms for 2 s → high: drop post → drop shadows → dpr −0.25 (floor 1) → mid; mid: dpr 1 → drop reflections → drop cones → poster.

## 7. Device tiers (`src/lib/contracts.ts` TIER_CONFIGS; `src/lib/tier.ts` detectTier)

| Tier | Who | dpr | Tris | Draw calls | Bodies | Post | Shadows | Texture mem |
|---|---|---|---|---|---|---|---|---|
| high | fine pointer, deviceMemory ≥ 8, cores ≥ 6, hardware WebGL2 | min(2, dpr) (1.5 above 1920 px) | ≤ 120k | ≤ 110 (measured ≈ 95) | 19 | yes | 1024 spot | ≤ 8 MB |
| mid | every coarse-pointer device; fine pointer with deviceMemory ≤ 4 or < 6 cores | min(1.5, dpr) | ≤ 60k | ≤ 75 (measured ≈ 63) | 19 | none | blob sprites | ≤ 3 MB |
| low | reduced motion, saveData, ≤ 2 GB, no hardware WebGL2, small textures, `?tier=low` | — | 0 | 0 | 0 | — | — | CSS poster |

Phone layout: single column 320–430 (16/20 px gutters); hero letters in the top 55svh, CTA stack below; project initials above their cards; chips wrap inside 44 px rows; email `overflow-wrap: anywhere`; counter button above `env(safe-area-inset-bottom)`; hero `100svh`, canvas `100lvh` never rebuilt on toolbar collapse; `overflow-x: clip`; nothing wider than 320.

## 8. Accessibility, reduced motion, SEO, no-JS

All content is real DOM text: skip link → top bar → push button → hero CTAs → sections → track. Landmarks: `header`, `nav`, `main`, `section[aria-labelledby]`, `footer`; canvas `aria-hidden`; focus ring 2 px `--signal` / 2 px offset; dialog traps focus; targets ≥ 44 px; the h1 stays in the DOM after the handoff (opacity 0) and the top bar keeps the name as text. Reduced motion = low tier: CSS poster, no drop/sweep/reveals, instant anchors. Metadata (layout.tsx): title/description from `SITE`, canonical, OG/Twitter `public/og.png` 1200×630 (U8 `scripts/make-og.mjs`), icons `src/app/icon.png` + `apple-icon.png` (U8), JSON-LD Person. `robots.ts` / `sitemap.ts` are `force-static`. No-JS: the SSR page is complete on the poster; reveal holds exist only under `html[data-js]` (pre-paint script in layout.tsx).

## 9. DOM / CSS / event conventions (frozen)

- `html[data-js="pending"|"ready"]` (pre-paint script → U7 flips to ready), `html[data-motion="full"|"calm"]`, `html[data-tier="high"|"mid"|"low"]` (Providers).
- `section[data-section="<SectionId>"]` on every section and the footer (U6); U5 measures these for the scroll map; U1 derives the active station.
- `.page` (main, z 1, pointer-events policy) and `.stage` (fixed canvas host, z 0) — see `globals.css`; `.ink-well` for text blocks; `.hold` for reveal targets (U7).
- `--beacon` custom property on `:root` (0 → 1 per turn) written by U4 each frame.
- Scene → DOM events: `window` CustomEvents `heavy:grab|release|snap|hoist|contact|physics-ready|poster` via `emitScene()` (registry.ts).
- Registries (`src/lib/registry.ts`): `registerGrabbable` / `getGrabbables` / `pushAll` (U3 registers letters + initials); `setSectionRects` / `getSectionRects` (U5 writes, U1 reads).
- URL switches: `?tier=high|mid|low`; `?debug=stats` (U8 overlay: fps, draw calls, triangles, bodies, dpr, t).
- Base path: raw hrefs go through `withBase()` (`src/lib/base.ts`).

## 10. Verification (U8 scripts + integrator)

Overflow + tap targets at 320×568, 360×740, 375×667, 390×844, 412×915, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080 × 5 scroll stops; hero fit at 320×568; per-place screenshots on desktop and phone (lit object outside the text column; text ≥ 13:1); `?tier=` runs for dpr/post/shadow flags; frame guard under 6× CPU throttle demotes within 3 s; physics budget (≤ 19 bodies, step ≤ 2 ms on the phone profile); touch: vertical pan never blocked during a grab attempt; keyboard order, dialog trap/Esc, push button; accessibility tree reads the name once; console clean under Strict Mode; WebGL disabled → poster; JS disabled → readable page; Lighthouse (system Chrome, compressed static server, quiet machine) mobile ≥ 85, desktop ≥ 95, a11y/BP/SEO 100, LCP = h1; static export served from `out/` with `/#projects`, the PDF, icons and OG, and with `NEXT_PUBLIC_BASE_PATH=/x`. Browser checks use the system Chrome via playwright-core with `--use-angle=metal --ignore-gpu-blocklist`.

## 11. Integration notes (as built, 2026-10-25)

What changed from the plan above while integrating, and why — read this before tuning anything.

- **Loading and shader warm-up.** Profiling showed the load cost is almost entirely GPU program linking that three waits on at the first draw of each material (≈ 3.4 s of blocked main thread on desktop). The stage now requests the scene chunk only after `load` + `document.fonts.ready` + an idle slot (inside `startTransition`), mounts the whole scene at once (so the light set never changes later — adding a light recompiles every lit material), keeps the camera on an empty layer, and links every program with `renderer.compileAsync` once the letters and the environment map exist. On the high tier the EffectComposer mounts first and the scene compiles against its half-float target; the screen-path and no-shadow variants the frame guard's first rungs need are linked too. The reveal (`src/lib/scene/reveal.ts`) then starts the entrance, the poster fade, the key-cone fade, the beacon spin-up and the frame guard. Lighthouse (static export, quiet machine): desktop 99–100 on every tier; phones (mid) 79–85 depending on the run; a11y / best practices / SEO 100.
- **Physics.** Snap thresholds were recalibrated: rope tension > 3.2 × weight (a fling: ≈ 6–8 m/s), contact > 30 × weight (a violent hit); heat flashes from 6 × weight. The push button gives ≈ 1.8 m/s. A rope attached or re-attached gets 400 ms without snapping, bodies take their mass from the collider before the first step (`recomputeMassPropertiesFromColliders`), the layout scale is baked into the hulls, and letters are rebuilt (not dragged) when the layout changes (phone rotation). The invisible side walls follow the real hero framing (`heroVisibleWidth`).
- **Composition.** Every content place puts the copy on the left and the lit object on the right. The work lamp hangs right of the rig (pivot x 5.5, z −3) with its own swinging light cone; the five Stack tubes are a vertical ladder on the right wall at z −44 (one per skill row); the project initials hang from short beams at x 2.6, scale 2.2, lit by a follow spot plus a cold fill. Hero framing: the scroll writer measures the room for the name — the DOM h1's box, extended down to 12 px above the grab hint where the layout leaves a gap (phones) — and `heroGeometry` fits the rows into it as they hang, projected through the hero camera (the top row hangs 0.7 m in front of the bottom one, so from the low camera it looks bigger and higher than a flat block would; `WORLD.name.rows` holds the measured extents and a test ties them to the real glyphs): top edge on the room's top (the eyebrow sits 10–14 px above), centred, as large as fits. Desktop is height-bound (≈ 50 % of the width at 1440×900), phones width-bound (85 % at 390). Before the measure: ≤ 62 % × 38 % with the top 19 % down on landscape, NDC 0.34 at 7.5 m on portrait.
- **Beacon at the frame edge.** Depending on the window's aspect the mast head lands anywhere from inside the hero frame (16:9 windows, ultrawide) to just outside it (16:10); half-cut by the edge, the emissive lens read as a glitch. The lens and its flare go dark as the head nears the edge (NDC 0.92 → 0.975); the light and the soft beam stay, so the red still sweeps in from off-screen.
- **Frame caps.** Chrome's Energy Saver (laptops on battery) and iOS Low Power Mode hold pages at 30 fps. The first ladder walked every such visitor down to the poster in about 30 s, since no rung can beat a cap (Chrome on Windows showed the static page while Brave on the same machine ran the scene). Now a step that does not make frames at least 10 % faster is given back (post, dpr, reflections and cones can be; shadows and the tier change cannot) and the guard holds; it only keeps stepping, and only takes the poster, below ~22 fps (45 ms). `html[data-tier-reason]` records why the tier was chosen (`software-webgl` = graphics acceleration off or the GPU blocklisted), and `?debug=stats` shows it, the steps and "guard holds", also on the poster.
- **Budgets.** Draw calls were re-based on the built scene (high ≤ 110, mid ≤ 75; per-letter materials and reflections); 19 bodies = 15 letters + 3 initials + the shared static anchor body. Everything holds 60 fps in headless Chrome at 1440×900 (high) and 390×844 (mid).
- **Removed.** The lab routes (`src/app/lab`), U6's contract-fallback stylesheet, and U2's unused `letters/layout.ts` + `letters/Chains.tsx` (the physics keeps its own layout and chain links).
- **Content editor (2026-10-31).** Content moved from `resume.ts` to `src/data/content.json`. It is checked by `src/data/schema.ts` at build time and derived for display by `src/data/view.ts` (numbering, periods, annotations, stats, Now). `resume.ts` is a typed view of it under the old names. The in-page editor (`src/components/editor`, loaded only in edit mode) commits the file through the GitHub API. The hall follows the published counts:
  - **Initials:** placed by `initialZs(n)` (the designed −24 / −30 / −36 for up to three; four to six over −21 … −37).
  - **Project sub-stops:** at t = 3 + i/n, landing on the measured card tops (scroll-map sub-anchors). Before, uneven cards drifted the stops by up to 0.09.
  - **Phone project camera:** now sits 3.8 m off the initials' line like landscape. Straight down the line it sat 1 m behind the nearer initial at R and S and flew through initials between stops.
  - **Bay plates:** the two latest companies, never wider than MIND2WEB LLP (2.4 m).
  - **Tubes:** one per skill group over the same ladder height.
  - **Bodies:** 15 + one initial per project + 1 ≤ 22.
  - **Layout safety:** text that can be edited breaks long words (`overflow-wrap: anywhere`); facts lay out for odd counts; the eyebrow is capped at 44 characters to keep the 320 × 568 hero fit.
