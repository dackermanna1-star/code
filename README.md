# Stickman Arena

A physics-driven stick figure combat simulation. One elite black stickman,
**Onyx**, fights an endless, procedurally generated crowd of colored stick
figures through randomized arenas. Nothing is scripted or canned: every
punch, throw, stumble, fall and chain reaction comes out of an active-ragdoll
physics model and two layers of AI, so no two runs play out alike.

It is a simulation to watch rather than a game to play: you set the
conditions and the fight unfolds by itself. When you feel like meddling, a
palette of powers lets you reach in and grab stickmen, shoot them, call down
lightning or lob a grenade into the crowd.

## Running it

No install and no build step are needed to watch it.

- **Single file:** open `dist/stickman-arena.html` in any modern browser.
- **From source:** `npm run dev`, then open <http://localhost:5173>. The
  page loads the ES modules in `src/` directly.

Sound starts muted (browsers only allow audio after you interact); press
**M** or the speaker button to turn it on.

## What you are watching

**The hero.** Onyx reads the room before he acts. He perceives each enemy
with a human reaction delay, notices an attack winding up, and picks an
answer: block, parry, duck under a high strike, jump a sweep, back off,
roll out of a pincer, vault over the crowd, beat the attacker to it with a
jab or a push kick, or counter behind him with a back kick or elbow. He
can even abort his own wind-up when he sees something coming. On offense he
looks for opportunities rather than following a script: an exposed back,
an enemy near a ledge, a window, an electrical panel or a gas canister; a
crowd lined up for a kick that sends one body bowling into the next; a
plank or pipe to pick up; a grab to turn into a hip throw, a suplex, a
powerbomb or a clinch with knees to the face. Anyone left on the floor near
him gets stamped on, or punted into his friends. His arsenal also includes
superman punches, spinning backfists, axe kicks, flying knees, dropkicks and
headbutts, with aerial moves saved for open space. He backs off when
surrounded, repositions to stairs and corridors where fewer enemies can
reach him at once, uses their momentum against them, and every so often
takes the fight somewhere else on the map: up the stairs, across a catwalk,
or straight into somebody else's brawl. He does not get stronger as the fight
goes on: he gets **tired**. Stamina drains with every action, fatigue builds
over time and with every hit taken, and his reactions, guard and get-ups
slow down. He dominates early and, sooner or later, is overwhelmed.

**The crowd.** Every enemy is generated: size, color, speed, strength,
reaction time, intelligence, aggression, courage and fighting style
(boxer, kicker, brawler, grappler, wild). Personalities decide how they
fight:

| Personality | Behavior |
| --- | --- |
| Rusher, Berserker | Charge straight in without waiting their turn; rushers tackle |
| Brawler | Trades blows, waits for an opening in the queue |
| Flanker | Circles around and strikes from behind |
| Hesitant | Hangs back until the hero is busy or turned away; first to flee |
| Tactician | Patient and sharp: quick reactions, picks the exposed side |
| Grappler | Grabs and holds, and the rest of the crowd piles in |
| Brute | Big, slow and heavy; hard to knock over, never loses nerve |
| Speedster | Small and fast, quick to react, easy to knock flying |
| Armed | Goes for a weapon first |
| Thrower | Throws objects from range before closing in |

Enemies share attack turns so they do not all swing at once, flank,
hesitate, taunt, lose nerve as their friends fall and retreat when it
breaks, see less in the dark and the smoke, and hit each other by accident.
Hotheads hit back, so accidents turn into grudge brawls, and fights also
break out on their own in other parts of the map, between idle enemies or a
pair arriving already swinging. A spawn director runs the fight in waves
(build, peak, relax) and escalates over time: more enemies at once, smarter
and stronger types.

## Your powers

The palette on the right edge of the screen (or a key) arms a power. Press
the same button again, **Q** or **Esc** to go back to watching. Powers act
through the same physics and damage as the fight itself, so a body you fling
bowls people over and a grenade you lob sends the crowd running.

| Power | Key | How it works |
| --- | --- | --- |
| Grab | **G** | Press on a stickman, alive or dead, and drag. Let go mid-swing to fling them into the floor, a wall or the crowd. The harder they land, the more it hurts. |
| Gun | **F** | Click to shoot whatever is under the cursor; hold for automatic fire. A headshot kills, a leg shot buckles the knee, a body shot knocks them flying. Bullets also shatter glass, set off gas canisters, jolt crates and leave holes in the walls. |
| Lightning | **Z** | Click to bring a bolt down from the ceiling or the sky. It jumps from body to body through a crowd and arcs across wet floors. |
| Grenade | **B** | Press where it should start and drag to throw it; a dotted arc previews the flight. A click just drops it there. It goes off about two seconds later. |
| Shockwave | **X** | Click to blast everyone near the cursor off their feet, along with crates, barrels and the nearest windows. |
| Spawn | **E** | Click to drop a new enemy in at the cursor (up to the enemies-at-once limit). |

Onyx is off limits by default, so your powers only ever help him. Turn on
*Your powers can hit Onyx too* (World and physics) to make it a free-for-all.
The commentary feed credits your kills ("Headshot — Teal drops", "Your
grenade takes out Cyan") and the end-of-battle card counts them under *By
your hand*. The powers work with touch as well as a mouse; in the free camera,
dragging pans the view only while Watch is selected.

## Physics

- **Active ragdolls.** Each fighter is an 11-particle Verlet body with joint
  angle limits. Standing fighters are driven by keyframed moves, procedural
  stepping and IK, then blend into physics when hit: a stagger keeps some
  muscle tone, a knockdown goes fully limp, and a get-up starts from
  wherever the body came to rest.
- **Momentum and impacts.** Strikes are swept against body capsules.
  Knockback depends on the attacker's strength and the target's mass and
  stance. A flying body hits whoever stands in its way and passes on part
  of its momentum, so chain reactions lose energy at every link, as they
  should.
- **Interaction.** Bodies pile up and come to rest on each other; crates,
  barrels and planks can be pushed, kicked, thrown and broken; glass
  windows and skylights shatter; gas canisters explode; fighters trip over
  the fallen.
- **Hazards.** Electrical panels zap whoever is knocked into them (and arc
  across wet floors), steam vents burst on a timer, ledges and broken
  windows drop fighters out of the arena.

## Arenas

Four procedurally generated environments, each with randomized layout,
platforms, stairs, railings, ledges, doors, columns, props and hazards:
**Research Facility**, **Warehouse**, **Rooftops at Dusk** and
**Construction Site**. Conditions vary the fight: clear, power failure
(dark, with lamp light), smoke, wet floors and high wind.

## Presentation

- **Director camera** that frames the hero and the action around him,
  widens for crowds, tightens for duels, calls slow-motion punch-ins for
  spectacular moments, and in a lull frames the brawls going on nearby or
  cuts away to one across the map. Also follow, wide and free (drag to pan,
  wheel to zoom) modes.
- **Animation**: anticipation and follow-through on every move, hit-stop,
  squash on landing, motion trails, natural ragdoll falls and get-ups.
  Hit reactions depend on where and how a blow lands: the head snaps back,
  a hook whips it round, an uppercut lifts the chin, a body shot folds them
  in half, a leg kick buckles the knee, and big shots send them reeling
  with arms windmilling. The dead do not always ragdoll: some crumple to
  their knees, some fall stiff like a tree. Fighters bounce on their feet,
  taunt and beckon.
- **Blood and bruising** (Off, Blood or Brutal): blows spray blood away
  from the attacker, droplets stick to the walls behind and stain the
  floor, big hits splash the wall behind the head, bodies slammed into walls
  leave a mark, the downed pool and smear as they slide. Fighters bruise
  and bleed where they were hit: dark blotches on their limbs, a swollen
  eye, cuts, blood running down the face and chest.
- **Effects**: impact flashes, black-on-white impact frames on knockout
  blows, shockwave rings on slams, sparks, dust, debris, glass shards,
  smoke, fire, speed lines, screen shake, rain and lamp light.
- **Procedural audio** (Web Audio, no sample files): impacts sized by
  force, whooshes, grunts, glass, electricity, explosions, a crowd bed, and
  reverb that follows the arena. Slow motion bends the sound with it.
- **HUD**: health, stamina and fatigue, what the hero is thinking, enemies
  active and defeated, survival time, wave intensity, conditions,
  simulation number, a live fight commentary feed and optional
  performance stats.

## Controls

| Key | Action |
| --- | --- |
| **N** | Generate a new simulation |
| **R** | Replay the same seed |
| **Space** | Pause / resume |
| **C** | Cycle camera mode |
| **S** | Open settings |
| **H** | Show / hide the HUD |
| **M** | Sound on / off |
| **D** | AI debug overlay |
| **1 / 2 / 3** | Half, normal, double speed |
| **G F Z B X E** | Arm a power: grab, gun, lightning, grenade, shockwave, spawn |
| **Q / Esc** | Put the power away and just watch |

The settings drawer covers:

- **Simulation:** difficulty preset (Easy to Nightmare, or Custom), battle
  length, total enemies (endless or a fixed number), seed, simulation speed,
  auto-start the next battle.
- **Enemies:** enemies at once (up to 300), spawn rate, strength,
  intelligence, aggression, variety and escalation.
- **The black stickman:** skill, endurance, reaction speed, movement speed.
- **World and physics:** environment, conditions, hazards, props and
  weapons, gravity, impact force, and whether your powers can hit Onyx.
- **Presentation:** camera mode, render quality, blood (Off, Blood,
  Brutal), slow motion, screen shake, volume, motion trails, HUD,
  performance stats.

Settings are remembered between visits. Settings marked *next* apply when the
next battle starts.

## Performance

The simulation runs at a fixed 60 Hz with two physics substeps and is fully
deterministic for a given seed and settings. Crowds of hundreds stay
responsive through:

- dense uniform grids for fighters and body particles (no per-query
  allocation or de-duplication), sort-and-sweep crowd separation;
- animated fighters cost no physics until they are hit;
- ragdolls sleep once at rest (judged on smoothed speed, so a pile's
  contact jitter does not keep them awake), and sleeping bodies act as
  static ground for the bodies on top;
- distant ragdolls step at half rate;
- only the newest 60 bodies stay physical; older ones freeze into scenery
  that costs nothing (an explosion brings them back), and the oldest fade
  out;
- a frame-time budget so an extreme crowd slows the action slightly instead
  of dropping into a spiral of long frames.

Blood is painted once into world-space tiles, allocated only where it
lands, so a soaked arena costs a handful of image copies per frame.

In testing (Node, one core), the default settings simulate in under 1 ms
per step and a 220-enemy stress brawl in about 4 to 8 ms.

## Balance

At the default settings a battle typically lasts two to three and a half
minutes and Onyx takes down 50 to 100 enemies before the crowd and his own
fatigue catch up with him. Hero endurance, the difficulty presets and the
enemy sliders stretch or shorten that.

## Project layout

```
index.html            dev entry (loads src/main.js)
src/
  main.js             app loop: fixed-step simulation, events, render
  config.js           constants, settings, difficulty presets
  core/               math, seeded RNG, spatial grids
  physics/            Verlet particles, distance and angle constraints
  world/              level, procedural generator, navigation graph,
                      props and weapons, hazards
  fighter/            skeleton and FK/IK, ragdoll, move library, fighter
                      state machine
  combat/             strikes, blocks, parries, grabs, throws, body impacts,
                      trips
  ai/                 hero brain, enemy brain, steering, roster
                      (procedural enemies), spawn director
  sim/                the simulation: step order, collisions, KOs, cleanup,
                      the viewer's powers
  render/             renderer, figures, environment art, effects, blood
                      decals, camera, palettes
  audio/              procedural Web Audio engine
  ui/                 HUD, settings drawer, commentary feed, power palette
  style.css
tools/
  build.mjs           zero-dependency bundler -> dist/
  headless.mjs        run full battles in Node, print balance stats
  smoke.mjs           headless Chromium smoke test with screenshots
  capture.mjs         screenshot any project page
  poselab.html        filmstrips of moves for animation work
dist/
  stickman-arena.html standalone single-file build
  artifact.html       the same app without the html/head/body wrapper
```

## Development

```sh
npm run dev                        # serve the source at localhost:5173
npm run build                      # bundle into dist/
node tools/headless.mjs 6 8        # 6 battles, up to 8 minutes each
node tools/headless.mjs 3 6 warehouse '{"maxActive":160}'
node tools/smoke.mjs index.html 20 # screenshots into tools/out/
```

The source is plain ES modules with no dependencies. The headless runner
and smoke test need Node 18 or later; the smoke test also needs Playwright
with Chromium.

## License

MIT
