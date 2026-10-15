# Architecture

Single-player PUBG-style battle royale built on **Three.js r186 (WebGL2)**, **Rapier 0.21** physics (WASM),
**TypeScript** and **Vite**. It runs in any modern desktop browser (Chrome/Edge/Firefox) with a discrete GPU recommended.

```
npm install
npm run dev          # http://localhost:5173  (?quick=1 skips menu+plane, ?debug=1 perf overlay, ?seed=N)
npm run build        # typecheck + production build into dist/
npm test             # vitest unit tests (tests/**/*.test.ts)
```

## Layout & ownership

| Path | Owner | Contents |
|---|---|---|
| `src/core/` | lead | Engine loop, EventBus, Input, Settings, Assets, Physics wrapper, contracts, GameContext, math, rng, Debug |
| `src/game/Game.ts` | lead | Boot: creates core services and calls every module's `installX(ctx)` in dependency order |
| `src/world/`, `src/render/` | World | Map layout (MapData), terrain, water, roads, sky/time-of-day/weather, lighting, post-processing, quality presets |
| `src/buildings/` | Buildings | Procedural buildings with interiors, doors, stairs, furniture, world props, loot points, indoor nav graph |
| `src/vegetation/` | Vegetation | Trees, bushes, grass, rocks (instanced, LOD), tree colliders, foliage concealment queries |
| `src/characters/` | Characters | `Character` (shared by player & bots), movement/stances, animation, camera (TPP/FPP), PlayerController |
| `src/items/` | Items | Item definitions, inventory, consumables, loot spawning, ground items, death boxes, airdrops |
| `src/combat/` | Combat | Weapon defs & handling, recoil/spread, ballistics, hit detection, damage/armor, throwables, melee, scopes |
| `src/fx/` | FX | Particles, decals, tracers, muzzle flashes, explosions, smoke, fire, blood, splashes |
| `src/vehicles/` | Vehicles | Vehicle physics, seats, enter/exit, fuel, damage, explosions |
| `src/match/` | Match | Match flow (lobby → plane → drop → play → end), parachute, zone, teams, kill feed, results, spectating |
| `src/ai/` | AI | Navigation (outdoor grid + indoor graph), perception, bot brains, squads, difficulty |
| `src/audio/` | Audio | WebAudio engine, positional audio, occlusion, reverb, sound banks, event wiring |
| `src/ui/` | UI | Menus, settings, key bindings, HUD, inventory screen, map, minimap, compass, kill feed, results |
| `sandbox/*.html` + `src/sandbox/*.ts` | each module | Standalone test scenes per subsystem |
| `tools/` | all | Node scripts: `shot.mjs` (headless screenshot + eval), asset processing, playtests |
| `public/assets/` | assets | Runtime assets — see docs/ASSETS.md |

**Rule:** modules talk to each other only through `ctx` (`src/core/GameContext.ts`), the interfaces in
`src/core/contracts.ts`, and events (`src/core/events.ts`, `EventBus`). Never import another module's
internals. Exception: a module may import another module's *pure data/helpers* (e.g. weapon defs) through
that module's `index.ts` exports.

## Core concepts

- **Fixed timestep.** `Engine` runs `fixedUpdate(dt)` at 60 Hz for all simulation (physics, movement, AI,
  weapons, zone). `update(dt, alpha)` runs once per rendered frame for visuals (interpolation, animation,
  camera, particles). `lateUpdate` handles UI/audio listener. Systems register with `ctx.engine.addSystem({...})`
  with a `priority` (see `Priority` in Engine.ts). Physics steps at `Priority.Physics`.
- **Render interpolation.** Simulation state (e.g. `character.position`) is per-tick. Visual roots are
  interpolated between the previous and current tick with `alpha`. Mouse look is applied per frame for
  responsiveness: the camera controller writes yaw/pitch into the player's intent.
- **Intents.** Characters are driven by a `CharacterIntent` (contracts.ts). The `PlayerController` fills it from
  input, and `BotBrain` fills it from AI. Bots and the player obey exactly the same movement, weapon, recoil and
  inventory rules. AI fairness depends on this.
- **Render pipeline.** `ctx.engine.setRenderFn(fn)` lets the post-processing pipeline (`src/render/`) take over rendering.
- **Input.** `ctx.input.isDown(action)`, `wasPressed(action)` (latched, so exactly one fixed tick sees it),
  `consumeMouseDelta()` per frame. Bindings are rebindable (Settings → controls.bindings). When a UI overlay
  is open, `input.enabled = false`.
- **Physics.** `ctx.physics` wraps Rapier. Every collider is tagged with a `ColliderInfo` (kind, surface, owner)
  so bullets know what they hit. Use `Layer`/`Mask` for collision groups and `raycast`, `raycastAll` and `lineOfSight`.
- **Hit detection** of characters does NOT use Rapier. Characters expose capsule hitboxes per body zone
  (`getHitboxes()`). Combat ray-tests them with `rayCapsule` (core/math.ts) after a world raycast.
- **Interactables.** Doors, loot, vehicles, revives and death boxes register with `ctx.interactions`. The character
  queries `ctx.interactions.best(character)` to show a prompt and call `interact()`.
- **Assets.** Load them with `ctx.assets.gltf()`, `tryGltf()`, `texture()` and `pbr(setId)`. Missing assets must degrade
  gracefully (procedural fallback), never crash.
- **Debug & automation.** `window.__game.ctx` exposes everything. Modules register helpers with
  `registerDebug(name, fn)` (core/Debug.ts), e.g. `__game.teleport(x,z)` or `__game.give('ar_m416')`.
  `node tools/shot.mjs <url> <out.png> <waitMs> --eval "<js>"` drives a headless Chromium (WebGL via SwiftShader:
  slow, about 5–15 fps, but functionally correct).

## Conventions

- Units are meters, seconds and kg. +Y is up. World X = east, -Z = north. The map spans `0..world.size` on X and Z.
- **Yaw** 0 looks north (-Z), and positive yaw turns left (CCW from above). The direction is `(-sin(yaw), 0, -cos(yaw))`
  (`dirFromYawPitch`). Assets face +Z, so a character's visual root uses `rotation.y = yaw + Math.PI`.
- Allocation-free hot paths: reuse module-level `THREE.Vector3` temporaries in per-tick code.
- No `any` leaks across module boundaries. Keep strict TypeScript green (`npx tsc --noEmit`).
- Every system must be robust. Never throw inside `fixedUpdate`/`update`; catch and log once.
- Performance target: 60 fps at 1080p on a mid-range discrete GPU (GTX 1660 / RX 5600 class) on the High preset,
  with 80 combatants. Budgets: ≤ 1500 draw calls, ≤ 3M triangles per frame, sim ≤ 6 ms per frame.

## Testing

- `npx tsc --noEmit` must pass (filter by your paths while others are mid-change).
- Unit-test pure logic with vitest (`tests/<module>.test.ts`).
- Each module has a sandbox page `sandbox/<module>.html` that loads `src/sandbox/<module>.ts`, which can reuse
  `bootGame()` or construct a minimal context. Test in headless Chromium with `tools/shot.mjs` and inspect the
  screenshots.
- The full game: `http://localhost:<port>/?quick=1&debug=1` starts a match immediately (on the ground).

## Contract changelog
(append entries: date, module, change)
