# Voxel Teardown

A Teardown-style destruction sandbox that runs in the browser (WebGL2). One large industrial
factory site, built from 10 cm voxels, where everything is destructible and simulated: walls,
floors, roofs, steel frames, tanks, machines, vehicles, fences and the ground itself.

![factory](docs/overview.png)

## Running

```sh
npm install
npm run dev      # builds, watches and serves on http://localhost:8080
# or
npm run build    # writes dist/ (open dist/index.html through any static web server)
```

A prebuilt `dist/` is committed, so serving that folder is enough (`npx serve dist`, `python3 -m http.server -d dist`).

Click **Play** to capture the mouse. URL options: `?quality=low|medium|high|ultra`, `?env=afternoon|sunset|overcast|night`,
`?testmap` (small test level), `?autoplay` (skip the menu), `?stats` (performance overlay).

### Controls

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| W A S D | Move | Mouse | Look |
| Shift | Sprint | Space | Jump |
| C / Ctrl | Crouch | LMB | Use tool |
| 1 – 8 / wheel | Select tool | E | Grab / drop object |
| F | Flashlight | V | Fly (noclip) |
| T | Time of day | R | Slow motion |
| Esc | Menu / settings | F3 | Stats overlay |

Tools: sledgehammer, shotgun, rifle, pipe bomb, bomb, rocket launcher, blowtorch, grab.

## The map

A 256 m × 256 m × 64 m site (2560 × 640 × 2560 voxels, ~100 M voxels of structure): a steel-framed
production hall with travelling crane, presses, CNC machines, robot cells and conveyors; a high-bay
warehouse with racking and loading docks; a three-storey office block; a boiler house with a brick
chimney and steel stack; a fuel tank farm with pipe racks and a gas sphere; grain silos; a water tower;
an electrical substation with transformers and pylons; a container yard; a rail siding with wagons;
a concrete skeleton under construction with scaffolding and a tower crane; a scrap yard; roads,
parking, fences, street lights, power lines, trees and terrain (earth, gravel, coal and sand heaps).
Hundreds of props (cars, trucks, forklifts, barrels, gas bottles, pallets, crates, IBC tanks…) are
free rigid bodies.

## How it works

**World.** 16³ chunks (empty / uniform / dense, plus *virtual terrain* chunks evaluated on demand from
a heightmap and per-column ground layers, so the ground costs no memory until it is dug into). A
255-entry palette maps every voxel to a material (density, hardness, blast resistance, friction,
flammability…) and a colour with a procedural surface pattern (bricks, planks, corrugation, concrete…).

**Rendering** (`src/render`). 32³ render regions are greedy-meshed with per-corner ambient occlusion in
a worker pool; quads (16 bytes each) live in one big integer texture and are drawn with vertex pulling
and multi-draw. Distant regions are meshed from 2× / 4× downsampled voxels (LOD). Deferred pipeline:
4-cascade shadow maps, G-buffer, SSAO, directional sky-occlusion maps (dark interiors, light through
openings), ray-marched volumetric sun light, point lights (lamps, fire, explosions), analytic sky and
height fog, glass, lit particles with soft depth fade, TAA, bloom and ACES tone mapping.

**Physics** (`src/physics`). Every body is a voxel grid. Collisions are sphere samples on the surface
voxels against exposed voxel faces of the world and of other bodies, reduced to stable manifolds and
solved with a warm-started sequential impulse solver (friction, restitution, speculative contacts),
with island sleeping and CCD for fast small bodies.

**Structural integrity** (`src/world/structure.ts`, `src/world/stress.ts`). After damage, a
time-sliced best-first flood fill finds parts no longer connected to the ground and turns them into
rigid bodies. A stress solver coarsens the structure into 0.4 m cells, routes every cell's weight to the
ground along the cheapest load paths and compares link loads with per-material compression / shear /
tension capacities. Overloaded links crumble, pieces detach, fall and hit things, and the analysis runs
again — collapses progress over seconds instead of being scripted.

**Destruction** (`src/game/destruction.ts`, `fire.ts`). Explosions carve by per-material blast
resistance, launch fragments as bodies, push bodies with a shockwave, shatter connected glass, ignite
flammables, and set off connected explosive material (fuel tanks, gas bottles, transformer oil) as
rolling chain reactions. Impacts break voxels by kinetic energy vs. material toughness; metal dents,
concrete crumbles to dust and rubble, wood splinters, glass shatters. Fire spreads through flammable
voxels, chars and burns them away. Debris particles and resting fragments settle into the world as
rubble, so damage persists.

## Development

```sh
npm run typecheck
node tools/runtest.mjs tests/physics.test.ts     # rigid body regression tests (headless)
node tools/runtest.mjs tests/stress.test.ts      # structural analysis on the real map
node tools/runtest.mjs tests/collapse.test.ts    # progressive collapse of the construction site
node tools/scenario.mjs out tests/scenarios/factory_views.json 960 540   # headless screenshots
```
