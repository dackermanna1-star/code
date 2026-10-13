# Development log

Newest first. Each entry: what changed, how it was verified, bugs found, what's next.

## Session 1 — 2026-10-13

### Toggleable god mode (owner request)
* **H** (rebindable) or the pause menu's *God mode* switch toggles it; `/god` still works. While on: no
  damage of any kind, and health/food/water stay full with bleeding, radiation and poison cleared. A
  "God mode" status chip shows on the HUD. Saved with the player.
* It needs the world's cheats flag, which can now be turned on for an existing world from the pause menu
  (two clicks to confirm). The flag is saved with the world and the world list shows the "cheats" tag;
  turning cheats off ends god mode.
* Verified: 5 new tests (260 total), e2e OK, and a headless-browser run of the full UI flow (refused
  without cheats → allow cheats → button → H key → world list tag).

### Final verification pass
* Full run: typecheck clean, **255/255 tests**, e2e OK (spawn 1.2 s, IndexedDB save → reload verified),
  benchmarks: worldgen 4.1 ms/chunk, meshing 8.9 ms/chunk, tick 0.12 ms mean (p99 0.58 ms). See
  VERIFICATION.md.
* Screenshot review found that a held torch did not light terrain (the custom chunk shader ignores Three.js
  lights) → added a hand-light term to the shader. Night ambient for entities now follows the terrain curve.

### Merges from parallel agents (each in its own git worktree, reviewed and verified before merge)
* **QA agent** — 219 tests across 12 areas; found 9 bugs (3 already fixed on main, 6 fixed at merge:
  unloadable worlds from one bad record, destroyed craft refunds, NaN drop corruption, non-atomic
  `removeAll`, RLE trailing bytes; plus corrupt chunks now regenerate and the tick loop survives errors).
* **Map agent** — region-tile map renderer (≤1 ms redraws), pan/zoom, legend, compass, grid, minimap,
  per-world explored-map persistence (wired in `main.ts`).
* **Monuments agent** — 4 monuments reworked (10 previously unreachable crates fixed), 3 new ones, 7 new
  decorative blocks, 36 POI tests incl. on-foot reachability; scavengers now spawn on walkable ground (fixed
  at merge).
* **Models agent** — humanoid scavengers (they rendered as boars), animated animals with pixel faces,
  dressed players, lying corpses, item-model drops, first-person models for every held item with
  sway/bob/swing/recoil/ADS.

### Gameplay fixes found by playtesting & benchmarking
* **Data loss on save (fixed, `55f8667`)**: `Game.save()` called while an autosave was in flight returned
  the in-flight promise whose snapshot predated newer changes — quitting right after an autosave started
  could drop progress. Found because the benchmark's reload restored 0/144 pieces. Now a fresh snapshot is
  queued after the in-flight save; the first autosave no longer fires on tick 1. Verified: reload restores
  144/144 pieces.
* **Players missing from the spatial index (fixed, `aaf97e2`)**: players were never re-bucketed after
  moving, so animals stopped perceiving them and NPC bullets/explosions could miss them once ~32+ blocks from
  spawn. Verified with a script that walks 280 blocks and checks the spatial query + NPC fire.
* Scavenger tuning: reaction delay, slower fire, more spread, audible reload every 6 shots.
* Bulk resources/ammo/components go to the main inventory first (hotbar keeps tools).
* Predator spawn grace period (2 min) after (re)spawning; cheat commands refused while dead; `/god`.
* Loot pane only auto-opens after the player's own interact (stale updates could re-open it).
* Hammer: rotate key cycles the upgrade target tier; RMB upgrades directly to it.

### Singleplayer pivot (owner request: "skip multiplayer, singleplayer only")
* Removed the Node WebSocket server, SQLite persistence, worker_threads generation pool, accounts/tokens,
  teams, sleepers, admin console.
* Kept the authoritative simulation as an *integrated server* in a Web Worker (`src/sim/worker.ts`) behind a
  `Link`; the UI talks to it with the same request protocol.
* New `WorldStorage` (memory + IndexedDB, one transaction per save), world list menu (create with seed and
  cheats option, continue, delete), pause on Esc, autosave/quit save, static `scripts/serve.mjs`.
* Added hostile scavenger NPCs at mid/high monuments (singleplayer needs human-like threats).
* Verified: e2e creates a world, spawns in ~1–2 s, renders ~100k triangles over ~135 meshed chunks, opens
  inventory and map, and confirms a `/give` survives quit → page reload → continue (IndexedDB).

### Initial build
* Research via a background agent (docs/RESEARCH.md, all claims cited or marked UNVERIFIED).
* Shared core: block registry, column chunks + RLE, seeded simplex noise, multi-noise worldgen (13 biomes,
  rivers, cheese + spaghetti caves, ore veins, boulders, trees across chunk borders, POIs), movement physics,
  voxel raycast, items/recipes/building/loot data, inventory ops, building geometry + stability graph,
  vitals.
* Simulation systems: gathering, building/privilege/upkeep/decay/doors, deployables (boxes, furnace,
  campfire, totem, bags, research table, POI crates/barrels), combat (projectiles, lag compensation, armor,
  explosives incl. terrain damage), survival, crafting, wildlife.
* Client: Three.js renderer with worker meshing (flood-fill light, AO, greedy faces), procedural textures,
  sky/clouds/weather, entities, effects/view model, procedural WebAudio, DOM UI (HUD, inventory/crafting/
  loot, map, menus, settings with key rebinding, help).
* Measured (scripts/bench.mjs, this container, single thread): worldgen 5.7 ms/chunk mean (p95 14.6),
  meshing 15.1 ms/chunk mean (p95 45), simulation tick 0.17 ms mean with 144 stone pieces + 19 creatures
  (p99 3.7 ms, budget 50 ms), save 2 ms / load 32 ms (memory storage).

### Next
NPC raid parties against claimed bases; real-GPU frame-time profiling; hard/soft wall sides; onboarding.
