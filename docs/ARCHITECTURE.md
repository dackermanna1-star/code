# CORRODE — Technical Architecture (Deliverable C)

## 1. Engine & stack decision

**Chosen: TypeScript + Three.js (WebGL2) in the browser, custom voxel engine, esbuild, Vitest, Playwright.**

The environment had no game engine installed (no Unity/Unreal/Godot), but had Node 22, a headless Chromium
and an npm registry. Options considered:

| Option | For | Against (here) |
|---|---|---|
| Unreal | best rendering, mature networking | huge install, no GPU/editor in a headless container, C++ build times, no way to verify visually |
| Unity | large ecosystem, voxel assets | editor/licensing, not runnable or testable headlessly here |
| Godot 4 | light, open source | still needs editor workflows; voxel meshing would be GDScript/C# or GDExtension anyway |
| **Web (TS + Three.js)** | runs anywhere with a browser, zero install for players, one language for simulation + client + tools, testable headlessly (Node for logic, Chromium/SwiftShader for rendering) | lower performance ceiling than native, JS GC, WebGL2 feature limits |

Voxel games don't need a heavyweight engine — they need fast meshing, chunk streaming and a solid
simulation, all of which are custom in every engine anyway. The deciding factor was **verifiability**: every
system here is exercised by automated tests and real screenshots in this environment.

## 2. Process model: integrated server

```
┌──────────────── main thread (src/client) ────────────────┐      ┌──── sim.worker (src/sim) ────┐
│ input → LocalPlayer prediction ──── C2S requests ────────┼─────▶│ Game (authoritative, 20 Hz)  │
│ Three.js renderer, UI (DOM), audio (WebAudio)            │◀─────┼── S2C snapshots, chunk frames │
│ ChunkRenderer ──▶ mesher.worker ×N (lighting + meshing)  │      │ SimWorld, systems, IDBStorage│
└──────────────────────────────────────────────────────────┘      └──────────────────────────────┘
```

* The simulation (`src/sim`) is written exactly like a dedicated server: it owns all state, validates every
  request (`C2S` in `src/shared/net/protocol.ts`), and replicates results (`S2C`). In singleplayer it runs in
  a Web Worker behind a `Link` (`src/sim/link.ts`) implemented with `postMessage`.
* Why keep the client/server split in singleplayer? (1) the UI thread never hitches on simulation or
  generation; (2) all rules live in one place — the UI cannot cheat or desync game logic; (3) tests drive
  the exact same `Game` in Node with a `RecordingLink`; (4) multiplayer can return by swapping the transport.
* **Movement**: shared deterministic physics (`src/shared/sim/movement.ts`). The client predicts at a fixed
  60 Hz step and sends input commands; the simulation replays them (budgeted to real time) and acks; the
  client reconciles by replaying unacknowledged inputs and smooths any visual error. (Rust itself is
  client-authoritative with server validation — see RESEARCH.md §R7; we chose the stricter model.)
* **Entities** are interpolated ~110 ms in the past; projectiles and melee are lag-compensated against
  position history so hits match what was on screen.

## 3. Voxel representation & world

* Column chunks **16 × 16 × 128**, one `Uint8Array` (32 KiB) per chunk, index `x | z<<4 | y<<8`;
  block ids are a stable, append-only registry (`src/shared/world/blocks.ts`) with dense lookup tables
  (`SOLID`, `OPAQUE`, `LIGHT_EMIT`, `LIQUID`) for hot loops.
* World height 128 (vs Minecraft's 384) keeps memory and meshing cheap for a browser.
* Chunks are RLE-encoded (≈2 KiB average) for saves and for the worker → UI transfer.
* `SimWorld` loads edited chunks from the save, generates the rest on demand with a **per-tick generation
  budget** (25 ms) so streaming never stalls the 50 ms tick; systems needing far blocks use `ensureSync`.
  Chunks out of range unload unless they hold unsaved edits. Unloaded chunks read as solid.
* Structure pieces are stored both as voxels (rendering, collision) and as `Piece` records (HP, tier,
  stability, owner, locks) keyed by cell → piece maps. Frame cells (pillars, floor rings) are reference
  counted by the pieces that claim them.

## 4. Rendering

* **Meshing** (`src/client/render/mesher.ts`, in workers): copy the chunk + 8-block margin of neighbours,
  flood-fill **sky light** (straight down, then spreading) and **block light** (emissive blocks), then emit
  faces with per-vertex **AO** and **smooth light** and merge identical coplanar faces (**greedy meshing**,
  key = tile + 4×AO + 4×sky + 4×block light). Vertices are 16 bytes (u16 position in 1/16 block + face id,
  u16 uv, u8 tile/AO/sky/block). Non-cube shapes (plants, water surface, slabs, open doors) are emitted
  separately; water/glass/ice go to a translucent mesh.
* **Shader**: `sampler2DArray` of procedurally painted 16×16 tiles; greedy quads tile via `fract` with
  `textureGrad` (no mip seams); sky light × daylight × sky tint, warm block light, AO, face shading, fog.
  Day/night is a uniform change — no remeshing.
* Chunks only mesh when their 4 neighbours are present (correct borders first time); edits remesh the
  chunk and, near borders, its neighbours.
* Sky dome, square sun/moon, stars, a blocky cloud layer, rain/snow volumes around the camera, particles,
  tracers, muzzle flashes, explosions, a first-person view model rendered in a second pass.
* **Graphics settings**: render distance, resolution scale, AO toggle, FOV.

## 5. Persistence

* `WorldStorage` interface (`src/sim/storage.ts`): `MemoryStorage` (tests/bench and in-memory mirror) and
  `IDBStorage` (browser). On open, the whole save (edited chunks + object records) is loaded into memory;
  reads are synchronous.
* Every save is **one IndexedDB readwrite transaction** over all stores → all-or-nothing. A crash, closed tab
  or failed save leaves the previous save intact. Saves never coalesce into an older in-flight snapshot.
* Records: `meta` (seed, time, config, schema version), `chunks` (RLE per edited chunk), `objects`
  (pieces, deployables, corpses, the player). A record that fails to parse is skipped and logged instead of
  aborting the load.
* Schema version is stored (`SCHEMA_VERSION`); IndexedDB `onupgradeneeded` is the migration hook.

## 6. Data-driven content

All balance lives in data modules, never in systems code:
`data/items.ts` (items, tools, weapons, explosives, food, clothing), `data/recipes.ts`, `data/building.ts`
(tiers, HP, damage multipliers, doors, upkeep brackets, privilege radius), `data/loot.ts`, wildlife species
(`sim/systems/wildlife.ts`), and per-world `WorldConfig` (`shared/config.ts`: gather/craft/metabolism
rates, decay, upkeep, loot respawn, animal density, hostile NPCs, cheats…). Load-time validation throws on
unknown item references.

## 7. Module map

| Module | Responsibility |
|---|---|
| `shared/world/*` | blocks, chunks/RLE, noise, biomes, worldgen, POIs, raycast |
| `shared/sim/*` | movement physics, inventory ops, building geometry/stability graph, vitals, time |
| `shared/data/*` | items, recipes, building, damage, loot |
| `shared/net/protocol.ts` | UI ↔ simulation messages |
| `sim/game.ts` | fixed-rate loop, request dispatch, streaming, replication, saves |
| `sim/systems/*` | gather, building, tiles (deployables), combat, survival, crafting, wildlife/NPCs, inventory ops, commands |
| `client/*` | main/menus, ClientGame loop, prediction, input, audio, UI, renderer |

## 8. Testing strategy

* **Unit/integration (Vitest, Node)**: pure shared modules and the full `Game` driven tick-by-tick with
  `MemoryStorage` + `RecordingLink` — inventory duplication fuzzing, crafting atomicity, building
  stability/collapse, raid costs vs. the design table, upkeep/decay, persistence round trips, combat hits.
* **E2E (Playwright + Chromium/SwiftShader)**: `npm run e2e` creates a world, waits for spawn and meshing,
  walks, opens UI, checks for page errors and saves screenshots.
* **Benchmarks** (`npm run bench`): worldgen, meshing, simulation tick, upkeep, save/load.
* Visual verification by screenshots (models, monuments, map) during development.

## 9. Known technical risks

* JS GC pauses during heavy streaming (mitigated by typed arrays and worker offloading).
* Mesher p95 (~45 ms) on complex chunks — fine in workers, but lighting could move to incremental updates.
* `Building.neighbours` is O(n) per piece (O(n²) splits) — fine for hundreds of pieces, needs an index for
  thousands.
* IndexedDB quota/eviction in some browsers (private mode): the menu reports when saves are unavailable.
* Software-rendered headless screenshots run at ~10 fps; real-GPU frame rates are not yet measured.
