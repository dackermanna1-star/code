# Sizzle & Stack

A 3D burger-restaurant management game for the browser, in the spirit of
*Papa's Burgeria*. You take orders at the counter, grill patties to the right
doneness, stack burgers layer by layer and serve them to customers who grade
every part of the job.

Every asset is generated in code: meshes, textures, characters, particles,
sound effects, voices and music. The repository contains no image, model or
audio files.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server with hot reload |
| `npm run build` | Type-check, then build a production bundle into `dist/` |
| `npm run build:single` | Build a single self-contained `dist-single/index.html` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests for order generation and scoring (`node:test`) |

A WebGL2-capable browser is required. Graphics quality defaults to *Auto*,
which picks a preset for your device. You can also choose Low, Medium, High or
Ultra in Settings. On Auto, when frames run long, the render resolution drops a step
and recovers once the frame rate does.

## How to play

A day runs from 10:00 to about 21:30 in-game (roughly five real minutes).
Each day brings more customers, arriving closer together.

1. **Order.** When someone reaches the counter, click **Take Order** (or press
   Space). They say what they want and the printer produces a ticket, which is
   pinned to the rail at the top of the screen.
2. **Grill.** Drag a raw patty from a tray onto the grill (a single click on
   the tray also works). The gauge next to each patty shows how far the
   *bottom* side has cooked. Its colour bands match the ticket's doneness:
   rare, medium or well done. Click a patty to flip it with the spatula. Once
   both sides are right, drag it to the heated holding tray. A patty left too
   long chars and then burns; you can drop it in the bin.
3. **Build.** The oldest ticket is shown at the build station; click another
   ticket on the rail to switch. Drag the bottom bun, then each layer in the
   ticket's order (bottom to top), then the top bun.
   Pieces dropped near the centre score best. Sauces are squeezed from
   bottles. Cooked patties come from the holding tray. The burger is finished
   when the top bun goes on.
4. **Serve.** When the customer comes to the pickup window, click **Serve**.
   They score wait time, grill doneness per side, build accuracy and
   placement, then tip according to the result and their personality.

Shortcuts: `1`–`4` switch stations, `Space` takes an order or serves,
`Esc` pauses, `M` mutes.

### Progression

- **Money and tips** pay for upgrades, decor and customisation in the shop
  between days.
- **XP and rank** unlock new ingredients (brioche, pretzel and charcoal buns;
  chicken and veggie patties; Swiss, cheddar and pepper jack; bacon,
  jalapeños, mushrooms, onion rings, avocado, fried egg; BBQ, sriracha and the
  house Sizzle Sauce) and new customers. Orders get longer and customers get
  pickier.
- **Upgrades:** bigger grill, turbo burners, smart thermometer labels, a
  doneness chime, topping guide, express printer, deluxe tip jar and a larger
  holding tray.
- **Decor** (palms, gumball machine, neon sign, string lights, ceiling fans,
  jukebox, wall of fame, aquarium, arcade cabinet, trophy shelf) raises a
  comfort rating that makes waiting customers more patient.
- **Customisation:** wall paint, wainscoting, floor tiles, upholstery and
  counter colours.

Progress is saved to `localStorage` after every day, and **Continue** on the
title screen resumes it.

## What's in the box

- **26 customers.** Each has a procedurally built body, face (eyes, lids,
  brows, animated mouth), outfit and walk cycle. Each also has a personality
  that sets their patience, pickiness, tipping, favourite ingredients and
  voice. They path-find through the door, queue, wait, sit down to eat and
  react to what you hand them.
- **Food rendering.** Patties use a cooking shader that browns each side on
  its own, adds grill marks, juices and char, and puffs up as it cooks.
  Cheese melts and drapes over what is under it. Buns, vegetables and sauces
  are individually modelled and textured.
- **Rendering.** Physically based materials whose textures are baked on the
  GPU at load time from GLSL recipes. Also: a procedural environment map,
  soft shadows, N8AO ambient occlusion, bloom, SMAA, depth of field for
  close-ups, heat haze over the grill, fake volumetric light shafts, and a
  sky and lighting that change with the time of day.
- **Audio.** Everything is synthesised with the Web Audio API: a grill sizzle
  that follows the number of patties, placement sounds matched to each
  ingredient, sauce squirts, the door bell, register, coins, footsteps,
  murmured customer voices, room ambience and a generative lounge
  soundtrack that picks up as the restaurant gets busier.

## Project layout

```
src/
  core/        engine loop, quality presets, camera rig, input, tweens, math
  render/      GPU texture baker, surface recipes, post-processing, env map
  world/       restaurant structure, kitchen, dining room, exterior, sky, lights, decor
  food/        ingredient data, food meshes and shaders, burger stacking
  characters/  appearance generator, faces, procedural animation, roster
  game/        game state machine, orders, scoring, customers, nav grid, progression
  stations/    order, grill, build and serve stations and the holding tray
  fx/          particle system (smoke, steam, grease, crumbs, sparkles)
  audio/       synthesiser, sound effect recipes, generative music
  ui/          DOM HUD, tickets, speech bubbles, gauges, screens, tutorial, 3D icons
  debug/       asset viewers and the autopilot bot used by automated playtests
tests/         unit tests (order generation, scoring)
scripts/       headless-browser playtests and screenshot tools
```

## Development tools

- `?view=<name>` opens a free camera on a part of the scene
  (`order`, `grill`, `build`, `serve`, `kitchen`, `dining`, `exterior`,
  `overview`, `food`, `chars`, …).
- `?test=1` runs a fixed-timestep, low-quality mode for automated tests.
  `window.__game` exposes the game instance and `__game.startBot()` starts
  the autopilot.
- `scripts/playtest.mjs`, `scripts/dayflow.mjs` and `scripts/inputtest.mjs`
  drive the game in headless Chromium through the autopilot, a full day and
  real mouse input respectively. They save screenshots to `test-output/`.
  They expect the dev server on port 5173.
