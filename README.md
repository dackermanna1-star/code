# Prop Destruction Lab

A real-time 3D destruction sandbox that runs in the browser. Spawn furniture,
electronics, glass and ceramics on a flat test floor, then grab, throw, shoot,
hammer or blow them up. Nothing is pre-animated: every crack, splinter and
collapse is produced by the simulation.

Built on [three.js](https://threejs.org) (rendering) and
[Rapier](https://rapier.rs) (rigid-body physics, WebAssembly), with a custom
fracture and structural-damage layer on top. All textures and all audio are
generated procedurally at start-up, so the project has no asset files.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL (http://localhost:5173). A production build goes to
`dist/`:

```bash
npm run build
```

```bash
npm run preview
```

`npm run build:single` writes one self-contained `dist-single/index.html`.

Needs a browser with WebGL 2 and WebAssembly (any current Chrome, Edge, Firefox
or Safari). A dedicated GPU is recommended for the High/Ultra presets.

## The ten props

| # | Prop | What it is made of | How it fails |
|---|------|--------------------|--------------|
| 1 | Window pane | 6 mm annealed glass in a timber frame | Radial + concentric cracks from the impact; a hard hit punches a hole, shards stay wedged in the rebate until knocked out |
| 2 | Laptop | Plastic shell, LCD, keyboard, battery, board, fan, SSD | Screen cracks and glitches, lid bends back on its hinge then snaps, keyboard pops off, internals spill out |
| 3 | Office table + PC | Timber desk; tower with tempered-glass side, board, GPU, PSU, fans; monitor; keyboard; mouse; mug | Every item is its own body. Tempered glass dices, the monitor loses picture, parts tear off their mounts |
| 4 | 75" television | Glass panel, backlight sheet, steel chassis, boards, speakers, plastic back, feet | Spider-web screen fracture with dead and glitching zones, backlight shows through holes, chassis dents, feet bend |
| 5 | Wooden door | Stiles, rails, muntins, thin panels, lever handles, frame | Latch gives first and the door swings; panels punch out; rails splinter along the grain; hinges tear one at a time |
| 6 | Bookshelf | Carcass, shelves, back panel, ~50 books, vase, globe, plant, mugs, trophy, picture | Books and ornaments are individual bodies; shelves snap and drop their load; the unit can topple |
| 7 | Office chair | Five-star base, casters, gas lift, tilt plate, seat, back, arms | Steel bends at the joints before it breaks; casters and arms snap off; the back folds |
| 8 | Ceramic vase | ~100 glazed shell tiles on a turned profile | Brittle cracks run from tile to tile; tiles shatter again into small shards |
| 9 | Washing machine | Sheet-steel panels, porthole door, drum, concrete counterweights, motor, suspension | Panels dent permanently, door unlatches and tears off, suspension rods bend, drum and weights break loose |
| 10 | Wooden cabinet | Carcass, two hinged doors, shelves, plates, bowl, mugs, tumblers, pot | Doors swing and rip off, panels split, crockery slides out and smashes |

The launcher adds five projectiles (baseball, brick, steel ball, bowling ball,
cannonball).

## Controls

| Input | Action |
|-------|--------|
| Right-drag / middle-drag / wheel | Orbit / pan / zoom |
| `W` `A` `S` `D`, `Q` `E`, `Shift` | Move the focus point, lower/raise, faster |
| `1` Grab | Left-drag carries the object under the cursor. Wheel pushes/pulls, hold `R` and move to rotate, `F` or right-click throws it |
| `2` Launcher | Click (or hold) to fire the selected projectile at the cursor |
| `3` Sledgehammer | Click a surface to strike it with the set impulse |
| `4` Explosive | Click to detonate a charge |
| Prop cards | Pick a prop, click the floor (or another object) to place it. Wheel or `R` rotates, `Shift`-click keeps placing, `Esc` cancels |
| `X` / `Delete` | Remove the prop under the cursor |
| `Space`, `.`, `T` | Pause, single step, slow motion |
| `H` | Controls overlay |

Touch: one finger uses the active tool, two fingers orbit and pinch-zoom.

The bar above the tools holds the settings for the active tool (launch speed,
interaction strength, strike impulse, charge and blast radius). The Settings
panel has physics quality, time scale, gravity, material strength, fracture
detail, fragment budget, shadows, resolution, bloom, motion blur, screen shake,
particle density and volume.

## How the destruction works

Every prop is a set of rigid bodies. A body is made of convex **chunks** (a
table leg, one shelf, one tile of the vase) joined by **bonds**. Rapier moves
the bodies and reports contact forces; the damage layer in `src/core/sim.js`
decides what gives way.

1. **Impact.** Each contact above a mass-scaled threshold becomes an impulse at
   a point. Soft things deliver gentler blows than hard ones, and resting
   contact is discounted by closing speed.
2. **Fracture.** If the impulse exceeds the chunk's strength (material ×
   thickness), the chunk is cut into new convex chunks by plane slicing. The
   planes follow the material:
   - *glass*: radial cracks crossed by irregular rings, denser near the impact;
   - *tempered glass*: Voronoi dicing of the whole pane;
   - *wood*: long splits along the grain plus jagged, staggered breaks across it;
   - *ceramic, plastic, concrete, circuit boards*: chunky cuts biased towards the impact.

   Fragments near the impact come loose. The rest stay bonded to each other and
   to whatever the original was attached to, which is how you get a cracked
   screen that still shows a picture, or a window with a hole in it.
3. **Shock.** What is left of the blow travels through the bond graph. Tough
   joints share the load; brittle ones each see nearly all of it, so cracks run
   on through glass and ceramic. A joint that is the only link to a part
   (a chair back on its bar, a television on its feet) takes the full
   leveraged load.
4. **Bend or break.** Overloaded bonds snap. Steel-to-steel bonds first bend:
   the parts beyond the joint are rotated about it permanently. Sheet-metal
   panels dent by deforming their mesh.
5. **Structural failure.** Any group of chunks no longer connected to the rest
   becomes a new rigid body with the exact velocity field of its parent, so a
   shelf that loses both supports simply falls.
6. **Follow-through.** The solver has already bounced the impactor off as if
   nothing broke, so the momentum that the break did not absorb is handed
   back. A ball goes *through* a window instead of bouncing off it.

Doors use real joints: each hinge is a ball joint on the hinge line and the
latch is a weak third joint. Break one hinge and the door hangs off the other.

Screens are powered: fragments show their part of the picture while they are
attached to the panel driver, damaged zones glitch or go black, and a display
whose power path is cut goes dark with a few sparks.

### Keeping it fast

- Bodies are put to sleep on spawn and loose fragments are parked as soon as
  they stop.
- Small loose shards use slim box colliders and do not collide with each other
  (optional).
- Dust-sized fragments become particles instead of rigid bodies.
- When many bodies are moving, new fractures get coarser, and the oldest
  fragments are retired past the fragment budget.
- If a step is too slow for the frame, the simulation takes fewer, larger
  steps (never coarser than 60 Hz) instead of dropping frames.

## Project layout

```
index.html                 UI shell and styles
src/main.js                bootstrap and frame loop
src/core/fracture.js       convex polyhedra, plane cutting, crack patterns, adjacency
src/core/geometry.js       render meshes from polyhedra, UV projections, dents
src/core/materials.js      physical material table and render surfaces
src/core/sim.js            bodies, chunks, bonds, joints, damage model, tools' physics
src/props/                 prop builder and the ten prop definitions
src/render/stage.js        renderer, lights, shadows, post-processing, thumbnails
src/render/textures.js     procedural textures
src/fx/effects.js          dust, smoke, sparks, chips, flashes, screen shake
src/fx/audio.js            procedural, positional audio
src/interaction/           camera rig and tools
src/ui/ui.js               menus, sliders, read-outs
tests/                     unit and end-to-end tests
```

## Tests

```bash
npm test
```

runs the fracture unit tests (volume conservation, tiling, adjacency).

```bash
npm run build
```

```bash
npm run test:e2e
```

loads the build in headless Chromium, checks that every prop spawns and rests
without damage, fires a bowling ball at each, and exercises the hammer and the
explosive. It needs Playwright (`npm i -D playwright`, then
`npx playwright install chromium`).

URL switches used by the tests: `?gfx=low` (cheap rendering), `?manual=1`
(no frame loop; drive it with `__lab.advance(seconds)`), `?empty=1` (no
default scene).

## Limits

- Strengths are tuned by feel in impulse units, not derived from material
  test data.
- Metal bends at joints and dents on panels; it does not tear or crumple as a
  continuous sheet.
- Cloth, cables and liquids are not simulated.
