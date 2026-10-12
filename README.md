# Seal Hunter 3D

A faithful 3D recreation of **The Seal Hunter** (2005, Cute 'n Fluffy) built with
three.js, TypeScript and cannon-es. Same rules, same numbers, same 4:3 framing as
the original — rebuilt with 3D models, physics ragdolls, permanent blood on a
reflective ice floe and the original sound effects.

![reference](docs/reference/ref2.jpg)

## Run it

Requirements: Node.js 20+ and a WebGL2-capable browser.

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Production build:

```bash
npm run build        # type-checks, then bundles into dist/
npm run preview      # serves dist/ at http://127.0.0.1:4173
```

URL options (handy for testing): `?play` (skip the title), `?autoplay` (bot plays),
`?speed=2` (time scale), `?quality=low|medium|high`, `?nosound`.

## How to play

Animals march across the ice floe from the left. **If any of them reaches the
right edge, the game is over.** You always face and fire to the left — line up
with a creature's lane and shoot. Kills pay bounties; spend the money on better
guns from the bar at the top. Five levels, each ending with a boss, then an
epilogue.

| Action | Keys |
|---|---|
| Move | `W A S D` / arrow keys |
| Fire (hold) | `Space`, `Ctrl` or left mouse button |
| Reload | `R` |
| Buy the best weapon you can afford | `B` / `Enter` |
| Select or buy a weapon | `1`–`9`, `0`, or click its slot |
| Cycle owned weapons | `Q` / `Tab` |
| Jump (stomp crawling seals — or walk into them to kick) | `E` / `Shift` |
| Pause | `P` / `Esc` |

Gamepads work too (stick/d-pad move, A/RT fire, X reload, Y/LB cycle, RB buy, B jump, Start pause).

Tips from the original: shoot the cub out of an activist's arms and he runs away
harmlessly; wounded brown seals crawl — kick them; the polar bear speeds up as
it gets hurt; the turtle's shell deflects bullets (aim for the head, or use
explosives); get out of the walrus's lane when it starts scraping its tusks.

## Project layout

```
src/config/     original game data: weapons, enemies, levels, world scale
src/core/       pure game logic at the original 50 ticks/s (no rendering)
src/render/     three.js presentation: stage/camera, environment, models,
                ragdolls, blood, effects, debris, corpses
src/ui/         HUD, crosshair overlay, menus and screens
src/audio/      Web Audio system playing the original sound effects
src/game/       input and the application state machine
tools/          balance simulator (bot), screenshot and e2e scripts
tests/unit/     vitest unit tests for the logic
docs/           research notes, reference screenshots
```

## Features

- All 5 levels plus the epilogue, with the original spawn tables, bosses (fat seal,
  penguin wave, enraging polar bear, shell-hiding turtle, charging walrus) and
  game-over / victory flow.
- All 11 original weapons with their exact prices, damage, magazine size, fire and
  reload timing, spread, pierce and recoil (incl. minigun spin-up, punt-gun cocking,
  pump-action timing, AWP laser sight, bouncing grenades, launcher rounds).
- View-consistent hit detection that reproduces the original's on-screen hit band,
  headshots, pierce, turtle-shell ricochets, splash damage, nice-shot bonuses.
- Procedural 3D models and animation for the hunter, 8 creatures and 11 weapons;
  articulated cannon-es ragdolls (head-off, gib, blast, slide and kick/stomp deaths).
- Permanent blood painted into a GPU decal map, blood soaking into corpses,
  permanent corpses (batched), casings and magazines that stay on the ice.
- Two-layer 3D staging: a 3D iceberg/sky/sea backdrop and the near-orthographic
  32° gameplay camera, ice with iceberg + planar character reflections, shadows.
- Original HUD, crosshair with ammo / reload %, money pop-ups, title screen with a
  live attract-mode game, pause, options (volume, blood, quality, FPS), how-to-play,
  game over / victory statistics and local high scores.
- The original sound effects through Web Audio with stereo panning, voice limiting,
  and synthesised arctic ambience.

## Known limitations

- Only single-player is implemented (the original supported up to 4 local players);
  the logic supports two players but there is no second input/HUD binding.
- Corpses are presentation only: like the original's static corpse images they do
  not block bullets or creatures, and settled corpses no longer react to later
  explosions.
- The turtle hides while any gun line crosses it (as in the original); explosives
  are the practical way to kill it.
- Performance was verified only under software WebGL in CI-like conditions (no GPU
  available while developing); draw calls stay around 100–500 thanks to batching,
  which should be comfortable on any discrete or modern integrated GPU. Use
  `?quality=low` (or Options → quality) on weak machines.
- The walrus's life (6000) is a documented guess; the original value is unknown.

## Tests and tools

```bash
npm test                                   # unit tests (logic, hit rules, levels, audio mapping)
npx vite-node tools/sim.ts -- 10 0.9       # headless bot balance simulation
node tools/e2e.mjs http://127.0.0.1:5173/  # headless browser run with screenshots
```

See [docs/RESEARCH.md](docs/RESEARCH.md) for the research, the original data
tables, the screenshot analysis and the reference checklist.
