# Stickman Arena

A physics-driven stick figure combat simulation. One elite black stickman,
**Onyx**, fights an endless, procedurally generated crowd of colored stick
figures through randomized arenas. Nothing is scripted or canned: every
punch, throw, stumble, fall and chain reaction comes out of an active-ragdoll
physics model and two layers of AI, so no two runs play out alike.

It is a simulation to watch rather than a game to play. You set the
conditions; the fight unfolds by itself.

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
plank or pipe to pick up; a grab to turn into a throw, a sweep or a
reversal. He backs off when surrounded, repositions to stairs and corridors
where fewer enemies can reach him at once, and uses their momentum against
them. He does not get stronger as the fight
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
hesitate, lose nerve as their friends fall and retreat when it breaks, see
less in the dark and the smoke, and can hit each other by accident. A spawn director runs the fight in waves (build, peak, relax) and
escalates over time: more enemies at once, smarter and stronger types.

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
  widens for crowds, tightens for duels, and calls slow-motion punch-ins for
  spectacular moments (with cooldowns, so they stay special). Also
  follow, wide and free (drag to pan, wheel to zoom) modes.
- **Animation**: anticipation and follow-through on every move, hit-stop,
  squash on landing, motion trails, natural ragdoll falls and get-ups.
- **Effects**: impact flashes, sparks, dust, debris, glass shards, smoke,
  fire, speed lines, screen shake, rain and lamp light.
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

The settings drawer covers:

- **Simulation:** difficulty preset (Easy to Nightmare, or Custom), battle
  length, total enemies (endless or a fixed number), seed, simulation speed,
  auto-start the next battle.
- **Enemies:** enemies at once (up to 300), spawn rate, strength,
  intelligence, aggression, variety and escalation.
- **The black stickman:** skill, endurance, reaction speed, movement speed.
- **World and physics:** environment, conditions, hazards, props and
  weapons, gravity, impact force.
- **Presentation:** camera mode, render quality, slow motion, screen shake,
  volume, motion trails, HUD, performance stats.

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

On a typical laptop the default settings simulate in about 1 ms per step;
200+ enemies at once in about 8 to 15 ms.

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
  sim/                the simulation: step order, collisions, KOs, cleanup
  render/             renderer, figures, environment art, effects, camera,
                      palettes
  audio/              procedural Web Audio engine
  ui/                 HUD, settings drawer, commentary feed
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
