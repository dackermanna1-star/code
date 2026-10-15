# RESUME GUIDE — read this first when continuing development

Development was **paused on 2026-10-15 at about 17:30 UTC** at the user's request. Everything is committed on branch
`claude/sharp-davinci-elfv12`. At pause time the whole project typechecks (`npx tsc --noEmit`, 0 errors) and
`npx vitest run` passes 75/75 tests.

**To continue, tell Claude:** *"Read docs/RESUME.md and continue the development."*

---

## 1. What this project is
A single-player PUBG-style battle royale for the browser. The stack is Three.js r186 (WebGL2), Rapier 0.21 physics, TypeScript and Vite.
Read these in order: `docs/ARCHITECTURE.md` (module layout, contracts, conventions, testing), `docs/DESIGN.md`
(gameplay numbers), `docs/ASSETS.md` (asset conventions), then `docs/progress/<module>.md` (per-module reports, APIs, QA notes).

```
npm install
npm run dev                       # http://localhost:5173
#   /?quick=1&debug=1             -> boots straight onto the island (no menu/plane), perf overlay
#   /?flycam=1                    -> free-fly debug camera
#   /sandbox/characters.html      -> character test arena (?count=80, ?fpp, ?world=real)
#   /sandbox/world.html           -> world viewer with fly camera
npx tsc --noEmit                  # typecheck
npx vitest run                    # unit tests
node tools/shot.mjs <url> <out.png> <waitMs> --eval "<js>"   # headless Chromium screenshot + eval
```

## 2. Status at pause

### Code modules (`tools/workflows/build-modules.js`, built in waves; each module is implemented, then independently QA'd)
| Wave | Module | State |
|---|---|---|
| 0 | core (`src/core`, `src/game`) | ✅ done (engine loop, contracts, input, settings, assets, physics, events, debug API) |
| 1 | **characters** (`src/characters`) | ✅ implemented **and QA'd** (14 defects fixed; tools/characters-*.mjs evidence scripts) |
| 1 | **world + render** (`src/world`, `src/render`) | ✅ implemented. ⚠️ **QA was interrupted midway.** The code review and some fixes are done and committed, but the visual review, final checks and QA notes in docs/progress/world.md are unfinished. **Re-run world QA (verify-only).** |
| 2 | combat, items | ⏳ not started (stubs in place) |
| 3 | buildings, vegetation | ⏳ not started |
| 4 | fx, vehicles | ⏳ not started |
| 5 | match, ui | ⏳ not started (the UI stub shows a PLAY button) |
| 6 | ai, audio | ⏳ not started |
| 7 | integration, full-match playtests, profiling, polish | ⏳ not started (no script yet; see §4) |

### Assets (`tools/workflows/acquire-assets.js`, under `public/assets/`, 132 MB at pause)
| Category | State |
|---|---|
| characters + anims | ✅ delivered: 12 Rocketbox variants + LOD1, 148 clips, weapon sockets. ⏳ verifier not run |
| weapons (30 guns) | ✅ delivered (authored in Blender). ⏳ verifier not run |
| equipment (attachments, melee, throwables, gear, items, reticles) | ✅ delivered (55 GLBs). ⏳ verifier not run |
| textures + HDRIs | ✅ delivered (170 files, 77.8 MB, CC0). ⏳ verifier not run. **Not yet used by the world renderer**: it was finished before the textures arrived and uses procedural fallbacks. Its keyword matching (src/world `TerrainTextures`) should pick them up, so verify that. |
| vehicles + aircraft | ⚠️ **interrupted**. The Blender authoring kit is committed in `tools/assets/vehicles/` (vkit.py, build.py, models/, post.mjs, preview/). No GLBs were exported yet. Continue from the kit. |
| environment (vegetation, rocks, props, furniture) | ⏳ not started |
| audio | ⏳ not started |

## 3. Resume steps (in order)

**Step 0: environment.** The cloud container is fresh each session, so scratch files are gone.
- `npm install`
- Blender 4.5 LTS headless is needed by the asset pipelines. Download it into the *new* session's scratchpad:
  `curl -sSo blender.tar.xz https://download.blender.org/release/Blender4.5/blender-4.5.9-linux-x64.tar.xz && tar xf blender.tar.xz && mv blender-4.5.9-linux-x64 <SCRATCHPAD>/tools/blender`
- The workflow scripts take `args.sp` = the new scratchpad path (raw downloads, Blender, screenshots go there).
- WebGL works in headless Chromium via SwiftShader (`tools/shot.mjs`). The machine has 4 cores. Run at most two workflows at once
  (each runs 2 agents concurrently). More than that saturated the box (load 15+).

**Step 1: finish wave 1 and the asset verifiers.** These can run in parallel as two workflows.
```js
// World QA only (implementation already done):
Workflow({ scriptPath: 'tools/workflows/build-modules.js',
  args: { sp: '<SCRATCHPAD>', modules: ['world'], verifyOnly: ['world'], built: ['characters', 'world'],
          notes: 'Resume: world QA was interrupted. Also integrate the now-delivered public/assets/textures (+hdri) into the terrain/road/water materials and check the visuals.' } })

// Assets: verify the 4 delivered categories, finish vehicles, then environment + audio:
Workflow({ scriptPath: 'tools/workflows/acquire-assets.js',
  args: { sp: '<SCRATCHPAD>',
          categories: ['characters', 'weapons', 'equipment', 'textures', 'vehicles', 'environment', 'audio'],
          verifyOnly: ['characters', 'weapons', 'equipment', 'textures'],
          notes: { vehicles: 'Resume: the Blender vehicle kit already exists in tools/assets/vehicles (vkit.py, build.py, models/). Read it and continue: author UAZ, Dacia, buggy, motorcycle, pickup, boat, then the C-130 aircraft (prop_1..4, ramp), wrecks, manifest, README, contact sheet.' } } })
```
(Before scripting, check that `args` arrays are passed as real JSON arrays, not strings.)

**Step 2: waves 2–6.** Run one workflow per wave and review each wave's screenshots and report before starting the next.
Always pass `built` = every finished module and `sp`.
```js
Workflow({ scriptPath: 'tools/workflows/build-modules.js', args: { sp: '<SCRATCHPAD>', modules: ['combat', 'items'],      built: ['characters','world'], notes: '...' } })
Workflow({ scriptPath: 'tools/workflows/build-modules.js', args: { sp: '<SCRATCHPAD>', modules: ['buildings', 'vegetation'], built: [...], notes: '...' } })
Workflow({ scriptPath: 'tools/workflows/build-modules.js', args: { sp: '<SCRATCHPAD>', modules: ['fx', 'vehicles'],        built: [...], notes: '...' } })
Workflow({ scriptPath: 'tools/workflows/build-modules.js', args: { sp: '<SCRATCHPAD>', modules: ['match', 'ui'],           built: [...], notes: '...' } })
Workflow({ scriptPath: 'tools/workflows/build-modules.js', args: { sp: '<SCRATCHPAD>', modules: ['ai', 'audio'],           built: [...], notes: '...' } })
```
The full per-module specs (deliverables, sandboxes and evidence required) are the `SPECS` object inside `build-modules.js`.

**Step 3: integration (wave 7).** Write a new workflow for this:
- Full-match automated playtests: menu → plane → drop → loot → fight → zone → win/lose, at time-scale, with 80 combatants.
- Hunt bugs with multiple finders, then adversarially verify and fix them.
- Profile performance (draw calls, triangles, sim ms), tune graphics presets, check AI fairness and difficulty, and polish visuals and audio.
- Final docs.

After each wave: `npx tsc --noEmit && npx vitest run`, commit, push.

## 4. Known issues to carry forward (from the QA reports)
- **Characters**
  - The `use_item` clip reads as "searching pockets", so a better bandage/heal clip is wanted.
  - The grenade cook pose has the arm straight up, and the climb hand plants are approximate.
  - The hitbox debug overlay leads the interpolated mesh by up to 0.1 m (display only).
  - Gear GLBs now exist in `public/assets/gear/`. Confirm the character module picks them up instead of its procedural proxies. The parachute canopy is procedural; a `gear/parachute.glb` now exists.
- **Weapons assets**
  - Several guns (SCAR-L, AUG, M416) have a solid rear-sight block on the `sight_eye` line. The camera lifts the eye up to 24 mm; an open aperture would be cleaner.
  - Melee and throwable GLBs live in `public/assets/weapons/` but are listed in the gear manifest, not the weapons manifest.
- **World**
  - The 60 fps target is unverified on a real GPU (only SwiftShader is available here).
  - `getSurface` reports forest floor and fields as `dirt`.
  - The terrain collider is only raycastable after the first physics step. During install, use `ctx.world.getHeight`.
- **Licensing**: most character animations are Mixamo clips taken from public GitHub repos (see `tools/assets/characters/anim_sources.tsv`).
  This is fine for this private build, but they must be re-downloaded via a Mixamo account before any public release. Everything else is CC0/MIT/authored.

## 5. Where things live
- Contracts between modules: `src/core/contracts.ts` (additive changes are logged in the ARCHITECTURE.md changelog).
- Per-module progress, API notes and QA notes: `docs/progress/characters.md`, `docs/progress/world.md`.
- Asset manifests and READMEs: `public/assets/<category>/manifest.json` and `README.md`. Asset build scripts: `tools/assets/<category>/`.
- Asset contact sheets (if exported): `docs/asset-previews/`.
- Workflow scripts: `tools/workflows/acquire-assets.js` and `tools/workflows/build-modules.js`.
