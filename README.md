# Brittle Bones

A physics-based ragdoll obstacle-course game for the browser. Pick one of five unlucky
riders, each with their own vehicle and handling, and try to reach the finish flag of ten
hand-built levels full of spikes, saws, crushers, landmines, harpoon turrets and worse.
Limbs are optional. Staying alive is not.

All characters, levels, art and sound are original. The art is vector-drawn in code, and
every sound is synthesised at runtime with the Web Audio API, so there are no asset files.

## Play

**Quickest:** open `dist/index.html` in a browser. It is a single self-contained file
that also works offline.

**From source:**

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:8080. To rebuild the single-file version, run `npm run build`.

Handy URL parameters for development: `?level=4&char=rosa` jumps straight into a level;
add `&auto=1` to let the autopilot drive.

### Controls

| Key | Action |
| --- | --- |
| ↑ / W | Accelerate |
| ↓ / S | Brake / reverse |
| ← → / A D | Lean back / forward (on the ground and in the air) |
| Space | Primary ability |
| Shift / X | Secondary ability |
| Z | Eject from the vehicle |
| Enter | Respawn at the last checkpoint |
| R | Restart level |
| Esc / P | Pause |
| M | Mute |

On touch devices, on-screen buttons appear automatically; you can toggle them in Settings.

## Characters

| Character | Vehicle | Handling | Abilities |
| --- | --- | --- | --- |
| **Marco Mayhem** | Dirt bike | Fast, grippy, long-travel suspension, helmet protects his head | Nitro boost; Shift = flip (stunt flips in the air refill nitro, or roll the bike back upright when it's tipped over) |
| **Gary from Accounting** | Office chair | Slow foot-scoot on tiny casters, tips easily, fragile | Fire-extinguisher rocket (hold) |
| **Bonbon the Clown** | Unicycle | Gyro-assisted balance, lean shifts the balance point | Spring hop, honk |
| **Rosa Gelato** | Ice-cream cargo trike | Heavy, stable, slow; the freezer weighs 50 kg | Jettison the freezer (it becomes a physics prop), bell |
| **Sir Reginald Pumphrey** | Penny-farthing | Quick on the flat, very top-heavy, brakes cause headers, loose top hat | Vault hop, "stiff upper lip" brace (tougher for 2.6 s) |

## Levels

1. **Sunday Drive** – tutorial: lean, smash, boost-jump a spike pit, catapult over a wall
2. **Rolling Thunder** – mine hops, explosive barrel pile, seesaw, rope bridge, big canyon jump
3. **Hard Hat Area** – crusher row, falling beams, goods lift, wrecking ball, collapsing boards, shuttle platform
4. **Dead Man's Gulch** – cannonballs rolling down a climb, minefield under falling rocks, flimsy bridge, boulders
5. **Harpoon Alley** – harpoon turrets, electrified tunnel, glass walls, shuttle platform under fire
6. **The Sawmill** – buried saws, saws on tracks, axe pendulums over a bridge, conveyor into a saw pit
7. **Avalanche Express** – downhill ski jumps, boulder avalanche, icicle pits, snow-fort cannons
8. **Tower of Pain** – catapult up a five-storey staircase of spike-lined ledges, then a huge descent
9. **Assembly Line** – conveyor under crushers, saws on rails, zapper gates, collapsing gantry over saws
10. **Highway to Heck** – the finale: every hazard at once, with three checkpoints

Each level hides three gold teeth. Best times and teeth are saved locally, and finishing a
level unlocks the next one (Settings → "Unlock all levels" skips this).

## How it works

* **Physics:** [planck.js](https://github.com/piqnt/planck.js), a Box2D port, stepped at a
  fixed 120 Hz.
* **Ragdoll** (`src/characters/ragdoll.js`): 11 rigid parts connected by limited revolute
  joints. The joint motors act as muscles that hold a riding pose, using two-bone IK so
  hands stay on the handlebars and feet stay on the pedals. When the rider dies, the
  muscles go limp.
* **Injury model:**
  * Contact impulses per body part (Δv) cause hurt, broken necks, severed limbs or gibbing.
  * Filtered joint reaction forces tear limbs off when they are over-stretched.
  * Sharp hazards cut at the joint, and spikes or harpoons impale by pinning parts with
    joints.
  * Severed stumps bleed and slowly drain HP.
  * A sudden change in vehicle velocity (hitting a wall, landing on your face) throws the
    rider off.
* **Blood:** droplets are ray-cast against the world and leave decals on whatever they hit,
  including moving bodies and the rider's own clothes.

### Project layout

```
src/
  main.js            boot + main loop
  game.js            level lifecycle, fixed-step simulation, explosions, gore, win/lose flow
  config.js          physics constants & collision categories
  core/              input, procedural audio, particles/decals, camera, save data, autopilot
  physics/           planck.js world wrapper (contact routing, deferred mutation, blasts)
  characters/        ragdoll, Character base class, one file per character
  objects/           hazards, weapons, props, zones (each an Entity subclass) + registry
  level/             course-building DSL, terrain/level runtime, visual themes
  levels/            level01.js … level10.js
  render/            renderer, parallax backgrounds, decoration, drawing helpers
  ui/                menus, HUD, overlays, touch controls
tools/               dev server and single-file build
tests/               headless Playwright tools (see below)
```

### Extending

* **New character:** subclass `Character` (see `src/characters/marco.js`).
  1. Implement `buildVehicle`, `riderSetup` (seat, grips, foot targets), `riderCtrl`,
     `control`, `abilityTick` and `drawVehicle`.
  2. Give it a `look`.
  3. Add it to `src/characters/index.js`.
* **New hazard:** subclass `Entity` (`src/objects/entity.js`). The entity is the body's
  `userData`, so it receives `onBeginContact` / `onPreSolve` / `onPostSolve` callbacks.
  Register it in `src/objects/index.js`, then levels can use it with `B.add('type', {...})`.
* **New level:** copy a level file and append it to `src/levels/index.js`. Levels are
  written with a pen-style DSL, for example:

  ```js
  const c = B.course(-15, 0);
  c.flat(30).hill(16, 2).ramp(8, 1.8);
  B.pit(c, 7, 3);                       // spike pit
  B.add('saw', { x: c.x + 4, y: 1, r: 0.8 });
  B.checkpoint(c.x + 10);
  ```

### Testing tools

These need the Playwright that is preinstalled in this environment.

* `npm run overview`: renders a top-down strip of every level to `test-output/`.
* `npm run test:ui`: clicks through every menu and screen, takes screenshots, and reports
  console errors.
* `node tests/play.cjs --level 3 --char rosa --auto`: plays a level with the autopilot.
* `node tests/lab.cjs scenario.js`: runs a custom scenario inside the game page, with
  faster-than-real-time simulation through `game.simulate()`.

## Credits

* Physics: planck.js, MIT licence.
* Fonts: Bangers and Nunito via Google Fonts (SIL Open Font License). They fall back to
  system fonts when offline.
* Everything else: code, vector art and synthesised audio made for this project.
