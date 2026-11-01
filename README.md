# GRAVELMOUTH

An original third-person prison-life sandbox for the browser, built on Babylon.js.

You arrive at Gravelmouth State Penitentiary with a sentence to serve. The prison runs on a
daily schedule, and about 40 inmates and staff each have their own routine, opinions and
grudges. You can keep your head down and earn parole, take a job, train, trade, join a crew,
start fights, or cut through the fence and run.

Gravelmouth is its own game. Its characters, map, writing, interface and music are original.
It is not a copy of any existing game.

## Running it

```bash
npm install
```

```bash
npm run serve
```

Then open http://localhost:8080. To make a static build:

```bash
npm run build
```

This writes `dist/`. Serve that folder with any static file server and open `standalone.html`.
`index.html` holds the same page without the `<html>`/`<head>` shell, for hosts that add their
own. Babylon.js loads from jsDelivr. The local dev page falls back to `node_modules` if the CDN
can't be reached.

URL options: `?q=low|medium|high` sets render quality. Touch devices default to `low`.
`?start` skips the title screen.

## Controls

| Action | Keyboard / mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | WASD | Left stick | Drag on the left half of the screen |
| Sprint | Shift | RT | Drag past the edge of the stick ring |
| Camera | Mouse, ← → (↑ ↓ zoom) | Right stick | Drag on the right half of the screen |
| Punch / swing held item | LMB or J | X | HIT |
| Kick / heavy attack | RMB or K | Y | HEAVY |
| Block (tap when ⚡ shows to counter) | Q or Ctrl | LT | BLOCK |
| Dodge | Space | B | DODGE |
| Grab, throw held item | F | LB | GRAB |
| Talk, pick up, sit, use | E | A | ✋ (shows the action) |
| Lock on / next target | T or MMB / Tab | RB / D-pad right | ◎ / ⇄ |
| Use item, drop item | R, G | D-pad up, L3 | ↻, ⤓ |
| Notebook, map, pause | C, M, Esc | Back, Start | ✎, ⌖, ❚❚ |
| Pick a dialogue reply | 1–8 or click | D-pad + A | Tap |

Click the game to capture the mouse. If the page isn't allowed to capture it (some embedded
viewers block this), hold the right mouse button and drag to look instead. Heavy attacks then
stay on K.

## What's in it

- **Daily schedule.** Wake-up 06:00, breakfast, work detail, lunch, yard, free time, dinner,
  evening rec, lock-up at 21:00, lights out at 22:00. Doors, gates and guard posts follow the
  clock. Sleeping in your bunk fast-forwards the night.
- **Characters.** Bodies are skinned and parametric, built from each person's build, skin
  tone, hair and outfit. They walk, run and strafe on motion-capture locomotion with foot IK.
  On top of that are hand-keyed actions: fighting, carrying, sitting, eating, lifting weights,
  mopping, sleeping.
- **Combat.** Combos, light and heavy attacks, blocks with guard breaks, dodges with
  invulnerability frames, timed counters, grabs and throws, and improvised weapons (chair
  legs, trays, frying pans, mops). Knockdowns and KOs send you to the infirmary.
- **Guards and rules.** Guards see in a vision cone and hear fights within about 10 m. They warn
  first, then subdue anyone who keeps resisting. Crimes add heat, fines, extra days or time in
  solitary.
- **Social life.** Every NPC holds an opinion of you. Witnesses remember what they saw, crews
  back up their members, grudges last, and friendly inmates may follow you.
- **Economy and jobs.** Ramen noodles are the currency. You can work in the laundry, kitchen,
  workshop, library or as a janitor. There are vending machines, a trader and favours to run.
- **Progression.** Strength, agility, toughness and smarts grow with training, work, reading
  and chess. Respect goes up when you win fights. Conduct drops with every write-up and
  recovers a little each day and with paid work. A parole hearing every 7 days can take up to
  3 days off your sentence if your conduct is good. The sentence ends in release or an escape.
- **Saves.** One autosave plus three manual slots, stored in the browser.

## Project layout

```
src/
  core/         math, RNG, quaternions, events, input (keyboard/mouse/gamepad/touch)
  world/        data-driven layout → walls, colliders, nav grid, doors, furniture, items
  characters/   body proportions, skinned rig, poses/clips, mocap locomotion, IK, animator
  gameplay/     combat, targeting, player controller, schedule, activities, rules, social,
                economy, progression, dialogue, systems glue
  ai/           NPC brain (navigation, routines, fights, reactions)
  render/       materials, world/furniture/item views, lighting, camera rig, particles
  ui/           HUD, dialogue panel, menus/notebook/map, touch controls
  audio/        sample playback + synthesized bells, doors and music bed
  save/         save/load
  sim.js        engine-free simulation (runs headless in tests)
  game.js       presentation layer, fixed 60 Hz loop
tests/
  unit/         node --test world and data checks
  e2e/          Playwright scenarios against the real game (movement, targeting, combat,
                meals, sleep, KO, save/load, crowds, performance) and a smoke test of dist/
tools/          dev server and build script
```

## Testing

```bash
npm test
```

```bash
npm run e2e
```

```bash
npm run build && npm run e2e:dist
```

The e2e suite runs the game in manual-step mode, so its results are deterministic. It drives
the real input layer. It checks that movement starts and stops crisply, that you face the right
target in a cluster, that a guard steps in and makes the arrest after a fight, that the day's
routine works (meals, sleep, recovery after a KO), that saves round-trip, that crowds don't get
stuck, and how long a simulation step takes. The dist smoke test boots the bundled page on a
desktop and on emulated phones in both orientations. It drives real mouse input, the
drag-to-look fallback and the touch controls.

See [docs/DESIGN.md](docs/DESIGN.md) for how the systems fit together.

## Credits

- Motion-capture locomotion clips and impact/whoosh/footstep sound effects come from the
  author's own project *Last Stance*. The locomotion data is derived from the CMU Graphics Lab
  Motion Capture Database (mocap.cs.cmu.edu), created with funding from NSF EIA-0196217.
- [Babylon.js](https://www.babylonjs.com/) (Apache-2.0).
- Fonts: Oswald, Special Elite and Inter via Google Fonts (SIL Open Font License).
