# Resume notes — development paused

> **Update 2026-10-17:** development resumed; Phase B relaunched from `tools/workflows/phase-b-layouts.js`
> (avenue + blocks_west, blocks_east + north). If this note is still here, check whether those
> packages have catalogs in `docs/catalog/` and are still in the `WIP` set.

Paused 2026-10-16, partway through **Phase B (district layouts)**. Everything is committed on the
branch `claude/pensive-johnson-vg5dgw`. Read this note first, then `docs/PLAN.md`.

## Where things stand

| Phase | State |
|---|---|
| Research → `docs/ATMOSPHERE.md`, `docs/research/*.md` | ✅ done |
| Engine (`src/core`, `src/render`, `src/player`, `src/audio`, `src/game`, `src/ui`) | ✅ done |
| **Phase A** content packages: `residential`, `public`, `street`, `nature`, `vehicles`, `metro`, `audio`, `phone`, `life` | ✅ each built + art-directed; catalogs in `docs/catalog/<pkg>.md` |
| **Phase B** district layouts: `avenue`, `blocks_west`, `blocks_east`, `north` | ⏸ **interrupted mid-build** (see below) |
| Integration QA, perf pass, scripted walkthrough | ⏳ not started |
| Publish playable single-file build | ⏳ not started |

### Phase B: what is on disk
The four layout agents were stopped while still writing their first pass (no review pass ran):

| Package | State on disk |
|---|---|
| `src/content/avenue/` | ~1150 lines, has `index.js`, unreviewed, no catalog |
| `src/content/blocks_west/` | ~930 lines, has `index.js`, unreviewed, no catalog |
| `src/content/blocks_east/` | ~1180 lines, has `index.js`, unreviewed, no catalog |
| `src/content/north/` | ~720 lines, **no `index.js` yet** (only `lib.js`, `models.js`) |

They are **gated** in `src/content/index.js` (the `WIP` set): the game skips them unless you open
it with `?wip=1` or name them in `?only=…`. So the game currently loads base + Phase A only, an
empty snow field with the systems running. `npm run build` passes.

Until the layouts are done, `metro` and `vehicles` carve stand-in roads and pits themselves.
Their catalogs explain how they hand over to `avenue` and `north` once those exist.

## How to resume

1. `npm install`, then `npm run dev` (play) or `npx vite build` (check).
2. **Finish Phase B.** Re-run the layout workflow script stored in `tools/workflows/phase-b-layouts.js`:
   in Claude Code, `Workflow({ scriptPath: 'tools/workflows/phase-b-layouts.js', args: { packages: ['avenue','blocks_west'] } })`
   and a second run with `['blocks_east','north']` (each workflow runs 2 agents at a time). The
   agents read `docs/specs/_layout_common.md` and `docs/specs/<pkg>.md`. They will find the partial
   files and can continue from them, or start a package over if they judge that better.
   - Remove each finished package from the `WIP` set in `src/content/index.js`.
   - Alternatively, write the layouts by hand: same specs, same APIs (`docs/catalog/*.md`).
3. **Integration** (lead work, after Phase B):
   - Full-city load test: errors, load time, draw calls and triangles at several viewpoints (`tools/shot.mjs --at …`).
   - A QA pass walking routes at dusk, night, day and in heavy snow. Fix problems in the package that owns them.
   - A scripted walkthrough (spawn → home courtyard → stairwell and lift → shop → underpass and metro) to catch collision snags.
   - Verify the open items listed below.
4. **Publish:** `npm run build:single` → `dist-single/index.html` (one self-contained file).

## Open items to verify or fix at integration
Some of these may already be fixed by the Phase A review passes. Check each before working on it.
- vehicles: parked cars may render lit headlights; parked cars should have dark lenses unless warm/idling.
- life: people's coat colours read too maroon/red; aim for dark greys, black, navy, brown, dull green.
- residential: check stairwell exposure (eye adaptation is in place); ceilings can read like tiles.
- metro: underpass tubes were overexposed (the metro review reported adding an underground bloom/fog override; verify); the view from inside a train car looked washed out (zone coverage).
- Audio levels were set by measurement only (headless Chromium has no audio output). **Listen to everything once**, especially the footstep balance.
- Engine requests from agents: `docs/catalog/_phaseA_reports_*.md` (`engineRequests` sections). The recurring ones:
  - a per-model `voxelScale` (nature, vehicles and life work around it)
  - emissive groups per placement
  - per-zone fog/bloom overrides (metro patches these on the instance)
  - a `Terrain.holeRect` depth option
  - runtime-updatable signs

## Decisions made (don't revisit without the owner)
- **Anomalies are out of scope** (owner's request). No uncanny events. The mood comes only from
  emptiness, repetition, fog, silence and long waits. Residential's `loopStairs` code is dead and unused.
- The metro station «Заречная» is an ordinary terminus. Trains arrive and leave, and you can't ride them.
- Block F repeats Block D's layout with its own address (д. 14). It is not a doppelgänger.

## Working environment gotchas

- Memory: the container has a ~16 GB cgroup limit and each headless Chromium renderer with the full
  city uses 1–1.3 GB; with 4 agents each running several renders at once the kernel OOM-kills
  renderers (seen 2026-10-17). Keep SHOT_SLOTS ≤ 3 and avoid loading the whole city when a district
  with ?only=… suffices.
- `tools/shot.mjs` renders headless with software WebGL (SwiftShader). A shot takes 10–60 s. A
  machine-wide queue allows 2 concurrent renders (`SHOT_SLOTS`). On a 4-core box, many parallel
  agents rendering at once thrash the CPU.
- Content agents must not run git; the lead commits.
- `src/content/zz_leadtest/` is the lead's private art-tuning scene. It is git-ignored and active only with `?leadtest=1`.
- `tools/out/` is git-ignored scratch output (screenshots, test builds).
- Workflow scripts used so far are kept in `tools/workflows/`: `research.js`, `phase-a-packages.js` and `phase-b-layouts.js`.
