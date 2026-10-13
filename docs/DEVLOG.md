# Development log

Newest first. Each entry: what changed, how it was verified, bugs found, what's next.

## Session 1 — 2026-10-13

### Merges from parallel agents
_(filled in when the agent branches land — see the entries below)_

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
