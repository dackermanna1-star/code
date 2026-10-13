# Verification report (Deliverable G)

What was actually implemented, how it was tested, what works, what is incomplete, and the technical risks.
Everything below was run in this repository's container on 2026-10-13 (Linux, Node 22, 4 vCPU, headless
Chromium with SwiftShader software WebGL2 — no GPU).

## How to reproduce

```bash
npm install
npm run typecheck     # TypeScript, whole repo (src + tests + scripts)
npm test              # Vitest: 255 tests in 13 files
npm run bench         # CPU benchmarks (worldgen, meshing, simulation, save/load)
npm run e2e           # builds, serves, plays in headless Chromium, checks IndexedDB save/reload
npm run dev           # play: http://localhost:8080
```

## Results of the final run

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` | ✅ **255 / 255 passed** (13 files, ~4 s) |
| `npm run e2e` | ✅ world created → spawned in **1.2 s** → ~104k triangles / 108 draw calls over 135 meshed chunks → inventory/map opened → `/give` survives **quit → page reload → continue** (IndexedDB) → no page errors |
| Benchmarks | see below |

### Benchmarks (`npm run bench`, single thread, this container)

| Measure | Result |
|---|---|
| World generation | **4.1 ms/chunk** mean, p95 9.2 ms; RLE ≈ 2.1 KB/chunk |
| Meshing (light + greedy faces) | **8.9 ms/chunk** mean (light 4.0 ms), p95 14.0 ms; ~1,900 triangles, 54 KB vertex data per chunk |
| Simulation tick (144 stone pieces, 21 creatures incl. 4 scavengers, 177 chunks) | **0.12 ms mean**, p99 0.58 ms, max 1.3 ms — budget 50 ms |
| Upkeep/decay pass | 0.7 ms |
| Save / load (memory storage) | 1.9 ms / 29 ms, 144/144 pieces restored |

Numbers vary run to run (an earlier run with four agents working in parallel measured worldgen 5.7 ms and
meshing 15 ms). **Not measured:** real-GPU frame times (the container has no GPU; SwiftShader renders ~10–12
fps regardless of scene). IndexedDB save latency on real browsers.

## Test inventory (`tests/`)

| Area | Tests | Highlights |
|---|---|---|
| Chunk codec | 15 | RLE round-trips (random, all run lengths, real chunks), corrupt/truncated/trailing input rejected |
| World gen | 12 | determinism, seed sensitivity, bedrock, sea level, beach spawns, trees consistent across chunk borders, speed |
| Monuments (POIs) | 36 | all 7 kinds: determinism, chunk-boundary consistency, footprint containment, no floating blocks, **every crate/barrel reachable on foot** |
| Movement | 17 | gravity, walls, no tunnelling at 60× speed, jump 1 not 2, crouch edges, water, fall damage, server ignores input floods |
| Inventory | 29 | merge/split/swap/wear rules, quick-move, all-or-nothing removal, **randomized no-duplication fuzz** (40 seeds × 400 ops + 1,500 junk requests) |
| Crafting | 14 | atomic consumption, blueprints, workbench, queue, cancel/death refunds, research |
| Gathering | 17 | tool yields, finishing bonus, durability, felling, claim zones block mining |
| Building | 30 | support rules, stability & collapse, frames, doors, code locks, upgrade/repair/demolish, privilege |
| Raid economy | 19 | charges per tier/door match the design table (2/4/8 breach on stone/metal/armored, wooden door ×2), thrown charges stick |
| Upkeep & decay | 13 | brackets, stocked totem prevents decay, decay rates |
| Persistence | 17 | pieces/doors/locks/boxes/player/terrain/time/corpses survive reload; corrupt records skipped; corrupt chunk regenerated; save-during-save keeps latest state |
| Combat | 17 | projectile hits, walls block, head/legs multipliers, armor, explosions & cover, corpse with full inventory, players who moved are still hittable |
| Survival | 19 | starvation, dehydration, cold (incl. real snow biome at night), heat, bleeding, radiation, healing, raw meat poison |

## Bugs found during verification (all fixed, each has a regression test)

| Bug | Found by | Fix |
|---|---|---|
| Saving while an autosave was in flight silently dropped the newest changes (quit could lose progress) | benchmark (reload restored 0/144 pieces) | fresh snapshot queued after the in-flight save |
| Players never re-bucketed in the spatial index → animals/NPCs/bullets/explosions ignored players who walked away from spawn | code review + QA agent | re-bucket every tick |
| One invalid piece/player record made a whole world unloadable | QA agent | records validated and skipped with a log |
| Craft refunds destroyed on death with a full inventory | QA agent | overflow goes into the corpse / ground |
| Drop request with a non-numeric amount corrupted a stack (`n: NaN`) | QA agent (fuzzing) | rejected |
| `removeAll` not all-or-nothing for duplicate ingredients | QA agent | aggregated check |
| RLE decoder accepted trailing garbage | QA agent | rejected |
| A corrupt chunk threw inside the tick loop (would freeze the world) | review of the above | regenerated from seed + re-saved; tick loop survives system errors |
| 10 monument crates unreachable, floating stairs/lamps | monuments agent's reachability test | layouts rebuilt |
| Scavengers rendered as boars; spawned on roofs/chimneys | models agent / monuments agent | humanoid model; ground-level spawn search |
| Held torch did not light terrain (custom shader ignores Three lights) | screenshot review | hand-light term in the chunk shader |
| Loot pane could re-open right after closing (stale update) | code review | open only after own interact |
| Entities lit brighter than terrain at night | models agent | ambient follows the terrain light curve |

## Feature status

**Implemented and verified (tests and/or e2e/screenshots):** procedural voxel world (13 biomes, rivers,
caves, ores, surface ore boulders, trees), 7 monuments with loot, radiation and scavenger garrisons, chunk
streaming with budgeted generation, worker meshing with flood-fill light/AO/greedy faces, day/night,
weather, survival model, gathering & tree felling, crafting/research/workbenches, furnace & campfire,
modular building with stability/collapse/tiers/doors/code locks, claim totem privilege + upkeep + decay,
explosives & raid damage incl. terrain, firearms/bows/melee with projectile simulation and lag compensation,
armor, wildlife AI, scavenger NPC AI, death/corpses/sleeping-bag respawn, IndexedDB saves (atomic), world
menu, HUD/inventory/crafting/loot/map/minimap/settings (rebinding)/help, procedural textures, models and
audio.

**Partially implemented:**
* Audio: procedural and positional, but simple (no occlusion, no recorded sounds).
* Recoil: per-shot camera kick; no learnable spray patterns.
* Monument containers stacked above ground are decorative; scavengers only fire level (pitch not replicated).
* Item drops on the ground are not saved (they despawn after 5 minutes anyway).
* Explored-map persistence is per browser; your body marker is not remembered after a page reload.

**Not implemented (designed, see DESIGN.md §11 / ROADMAP.md):** NPC raid parties against the player's base,
hard/soft wall sides, electricity, vehicles, keycard puzzles, ladders, tutorial/onboarding, accessibility
options beyond rebinding/sensitivity/FOV/volumes, **multiplayer (deferred by the project owner)**.

## Technical risks needing attention
1. **Real-GPU performance is unmeasured.** Draw calls (~110) and triangles (~100–150k) at render distance 7
   are modest, but frame-time budgets per quality preset must be measured on real hardware.
2. **Meshing cost on edits**: each block edit remeshes 1–4 chunks (~9 ms each in a worker) — fine for
   mining, heavy for large explosions; incremental lighting would help.
3. **Building graph algorithms** are O(n²) in piece count for splits — fine for hundreds, not thousands.
4. **IndexedDB** quota/eviction (private windows, storage pressure); saves are atomic but not exported —
   an export/import backup feature is advisable.
5. **Main-thread GC** during heavy streaming (typed arrays mitigate; not yet profiled in a real browser).
6. Changing world-generation code (e.g. adding monuments) changes untouched areas of existing saves;
   generator versioning per world is advisable before release.

## Screenshots (docs/screenshots)
`world.jpg`, `walk.jpg` (forest edge), `base.jpg` (stone walls on a beach), `night-torch.jpg` (held torch
lighting), `quarry.jpg`, `harbour-yard.jpg`, `globe-tank.jpg` (monuments), `inventory.jpg`, `map.jpg`.
All captured headlessly with software rendering.
