# Resume notes — development paused

Paused **2026-10-17** at the owner's request, partway through **Phase B (district layouts)**.
Everything is committed on the branch `claude/pensive-johnson-vg5dgw`. Read this note first, then
`docs/PLAN.md`.

## Where things stand

| Phase | State |
|---|---|
| Research → `docs/ATMOSPHERE.md`, `docs/research/*.md` | ✅ done |
| Engine (`src/core`, `src/render`, `src/player`, `src/audio`, `src/game`, `src/ui`) | ✅ done |
| **Phase A** content packages: `residential`, `public`, `street`, `nature`, `vehicles`, `metro`, `audio`, `phone`, `life` | ✅ each built + art-directed; catalogs in `docs/catalog/<pkg>.md` |
| **Phase B** district layouts: `avenue`, `blocks_west`, `blocks_east`, `north` | 🟡 **first pass mostly done, review passes not run** (see below) |
| QA tooling: `tools/walk.mjs` (scripted walkthroughs), `--profile` frame profiler | ✅ done |
| **Phase C** integration QA (`tools/workflows/phase-c-qa.js`) | ⏳ written, not run |
| Publish | 🟡 a WIP test build was published (see below); no final build yet |

Overall: roughly **70%** of the planned work.

### Phase B: what is on disk
The second Phase B run (2026-10-17) was stopped by the owner:

| Package | State |
|---|---|
| `src/content/north/` (park, ул. Заводская, industry, railway) | ~2300 lines; first pass **finished**, review pass **interrupted** midway |
| `src/content/avenue/` (проспект Строителей, south strip, bus terminal) | ~1180 lines; first pass nearly done (catalog written), no review |
| `src/content/blocks_west/` (ул. Берёзовая, Blocks A, D = home, F) | ~1100 lines; first pass nearly done (catalog written), no review |
| `src/content/blocks_east/` (Blocks B, C, E, the shop) | ~1330 lines; first pass nearly done (catalog written), no review |

All four load without errors and the city is walkable. Known rough spots that the review passes
were meant to fix: misplaced tyre-track paint near the spawn, blobby snow mounds and benches in
places, some district seams, and an over-bright light patch to the right of the spawn view.

The four packages are still in the **`WIP` set** in `src/content/index.js`. A normal build skips them,
which gives an empty snow field. Load them with `?wip=1`, by naming them in `?only=…`, or by building
with `VITE_WIP=1` (which is how the test build was made). Remove a package from `WIP` once it has been
reviewed.

### Test build
- `VITE_WIP=1 npm run build:single && node tools/artifact.mjs` makes `dist-single/index.html`
  (standalone) and the page form for publishing.
- The owner received a WIP test build on 2026-10-17 (claude.ai artifact
  `https://claude.ai/artifact/Jdr4BayBGz9zNXKDrx2ZyV`). It predates the propped-door change below.
  Rebuild and republish it to the same artifact to update it.
- Verified headlessly: loads to the title with all 14 packages, no build/content errors, JS heap
  ~190 MB, the player walks. The spawn view is heavy: ~2 M triangles and ~530 draw calls.

### Enterable places (for testing)
- Home: Block D, ул. Берёзовая 12 корп. 2 подъезд 3, door (227.5, 350) facing south. Stairwell + lift.
- Tower «3-й Молодёжный пр. 8 корп. 2» подъезд 1, door (381, 352). Stairwell + lift to the 17th floor.
- Block F, ул. Берёзовая 14 корп. 2 подъезд 2, door (539.5, 350).
- Shops «ПРОДУКТЫ 24 ЧАСА» at (419.3, 474.5) (Block E) and (455.5, 574.3) (avenue south strip); the
  pharmacy at (474.6, 573.9), open 8–22.
- Enterable entrance doors now **rest propped ajar on a brick, with a warm light spill** from
  dusk (residential runtime `DOOR_REST`). Before this change players could not tell them from the ~60 locked ones.
- `tools/walks/home_door.json` checks the home and tower doors in the full city; it passes.

## How to resume

1. `npm install`, then `npm run dev` and open with `?wip=1`, or `npx vite build` to check the build.
2. **Finish Phase B.** Run the review passes. The simplest way is the layout workflow
   `tools/workflows/phase-b-layouts.js`: `Workflow({ scriptPath: 'tools/workflows/phase-b-layouts.js', args: { packages: ['avenue','blocks_west'] } })`
   and a second run with `['blocks_east','north']`. Its first stage continues from the files on disk,
   and the second stage is the review. To run only reviews, edit the script so the pipeline skips
   the layout stage. Then remove the finished packages from `WIP`.
3. **Phase C QA:** `Workflow({ scriptPath: 'tools/workflows/phase-c-qa.js' })`. Five route critics
   and three lens critics (performance, interactions, art) report findings, which are grouped by
   package; then one fixer per package verifies and fixes them.
4. **Performance:** reduce the spawn view's triangles and draw calls (LOD distances, `maxDistance`,
   tree counts) and run `tools/shot.mjs --profile`.
5. **Publish:** `npm run build:single`, then `node tools/artifact.mjs` and republish the artifact above.

## Open items to verify or fix at integration
- Audio levels were set by measurement only (headless Chromium has no audio output). **Listen to everything once**, especially the footstep balance.
- metro: check underground exposure and the view from inside a train car.
- residential: stairwell ceilings can read like tiles.
- Engine requests from agents: `docs/catalog/_phaseA_reports_*.md` (`engineRequests` sections). The recurring ones:
  - a per-model `voxelScale` (nature, vehicles and life work around it)
  - emissive groups per placement
  - per-zone fog/bloom overrides (metro patches these on the instance)
  - a `Terrain.holeRect` depth option
  - runtime-updatable signs
- Already resolved: parked-car headlights and coat colours (Phase A reviews); geometry memory
  (CPU copies are released after GPU upload, with 16-bit indices); the load hanging when workers are blocked.

## Decisions made (don't revisit without the owner)
- **Anomalies are out of scope** (owner's request). No uncanny events. The mood comes only from
  emptiness, repetition, fog, silence and long waits. Residential's `loopStairs` code is dead and unused.
- The metro station «Заречная» is an ordinary terminus. Trains arrive and leave, and you can't ride them.
- Block F repeats Block D's layout with its own address (д. 14). It is not a doppelgänger.

## Working environment gotchas
- Memory: the container has a ~16 GB cgroup limit. A headless Chromium renderer with the full city used
  2–4 GB before the geometry-memory fix. With 4 agents rendering at once, the kernel OOM-kills
  renderers, and agents then waste time retrying. Run at most two agents that render, keep `SHOT_SLOTS ≤ 3`,
  and use `?only=…` for district work.
- `tools/shot.mjs` renders headless with software WebGL (SwiftShader). A shot takes 10–60 s; the
  full running game can take 30+ s per frame. A machine-wide queue allows 2 concurrent renders
  (`SHOT_SLOTS`). `tools/walk.mjs` simulates without rendering and is much faster for gameplay checks.
- Agents sometimes leave orphaned screenshot scripts (`ms.mjs`, `multishot.mjs`) running. Kill them
  with `pkill -f 'ms.mjs|multishot.mjs|headless_shell'` and remove `/tmp/liminal-shot-slot-*.lock`.
- Content agents must not run git; the lead commits.
- `src/content/zz_leadtest/` is the lead's private art-tuning scene. It is git-ignored and active only with `?leadtest=1`.
- `tools/out/` is git-ignored scratch output (screenshots, test builds).
- Workflow scripts are kept in `tools/workflows/`: `research.js`, `phase-a-packages.js`, `phase-b-layouts.js` and `phase-c-qa.js`.
