# Noita 3D

A first-person, 3D voxel reinterpretation of **Noita** (Nolla Games): a falling-sand world where every
voxel is a simulated material, wands built from spells with a faithful `gun.lua` casting engine,
destructible terrain, reactive alchemy, dangerous enemies and a descent through procedurally generated
biomes and Holy Mountains. Fan project for learning purposes; not affiliated with Nolla Games.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Then click **New Game**. URL options: `?autostart&seed=1234` (skip the menu), `&sandbox` (developer
tools), `&debug` (stats overlay), `&pixel=1` (full resolution).

```bash
npm test             # unit tests (simulation, physics, generation, casting, combat, art, audio)
npm run build        # production build into dist/
npm run smoke -- walk 1234   # headless Chromium scenario (needs the dev server running)
```

## Controls

| Action | Default |
|---|---|
| Move / look | WASD / mouse |
| Jump, hold to levitate | Space |
| Cast wand / pour flask | Left mouse |
| Throw flask | Right mouse |
| Drink | R |
| Select wand / item | 1–8, mouse wheel |
| Pick up, buy, fill flask (hold) | E |
| Kick | F |
| Crouch | Shift |
| Inventory & wand editing (pauses) | Tab |
| Pause | Esc |
| Stats overlay / dev tools (sandbox) | F3 / F4 |

Wands can only be modified inside a Holy Mountain — just like the original.

## Where things live

| System | Code |
|---|---|
| Voxel world, chunks, raycasts | `src/world/world.ts`, `chunk.ts` |
| Materials (data) & reactions | `src/world/materials.ts`, `src/sim/reactions.ts` |
| Cellular simulation, heat, fire, electricity | `src/sim/simulation.ts` |
| Explosions, digging | `src/sim/destruction.ts` |
| Generation, biomes, streaming | `src/world/generator.ts`, `biomes.ts`, `streamer.ts`, `genWorker.ts` |
| Rendering | `src/render/` (mesher, voxel shader, lights, particles, sky, view model, enemy models) |
| Player & physics | `src/entities/player.ts`, `physics.ts` |
| Damage & status effects | `src/entities/damage.ts` |
| Projectiles | `src/entities/projectiles.ts` |
| Enemies & AI | `src/entities/enemies.ts`, `enemyDefs.ts` |
| Wands, spells, casting engine | `src/magic/` |
| Run loop, inventory, potions, Holy Mountains, perks | `src/game/` |
| HUD, inventory, menus, dev tools | `src/ui/` |
| Procedural audio / pixel art | `src/audio/`, `src/render/art/` |

Design notes, every mechanic's original behaviour vs. this implementation, and deviations:
[`docs/DESIGN.md`](docs/DESIGN.md). Research with sources: [`docs/research-notes.md`](docs/research-notes.md).
