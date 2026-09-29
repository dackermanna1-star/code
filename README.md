# The Last Four — Dead Air & No Mercy

A first-person, four-player co-op survival-horror campaign for the browser, built on
Three.js. It is an original fan tribute to the classic co-op zombie formula with two
five-chapter campaigns: **Dead Air** (the default) crosses the rooftops of Newburg to
the airport and the last plane out; **No Mercy** fights from the apartments to a
helicopter on the hospital roof.

All code, geometry, textures, sounds, music and dialogue are generated procedurally at
runtime. The game contains no assets from any commercial game. Not affiliated with or
endorsed by Valve Corporation; "Left 4 Dead" is a trademark of Valve.

## Running

```bash
npm install
npm run dev          # http://localhost:5173 (the co-op relay is mounted at /net)
```

Single-file build (the whole game in one offline HTML file, `the-last-four.html`;
open it directly in the browser, no server needed):

```bash
npm run build:single
```

Production build:

```bash
npm run build        # outputs ./dist
npm run server       # serves ./dist and the co-op relay on http://localhost:8787
```

A recent desktop Chrome, Edge or Firefox with WebGL2 is required. Choose a quality
preset under **Options** (Low / Medium / High).

## Controls

| Action | Keys |
| --- | --- |
| Move | W A S D |
| Look | Mouse |
| Fire / use held item | Left mouse |
| Shove (melee push, frees pinned teammates) | Right mouse or V |
| Zoom (hunting rifle) | Middle mouse or Z |
| Jump / crouch / sprint | Space / Ctrl or C / Shift |
| Use, pick up, revive, open doors (hold for radios and panels) | E |
| Reload | R |
| Weapon slots: primary, secondary, throwable, first-aid kit / defibrillator / upgrade pack, pills / adrenaline | 1 – 5 |
| Last weapon | Q |
| Flashlight | F |
| Heal a teammate (first-aid kit or pills selected) | Right mouse while looking at them |
| Scoreboard | Tab |
| Pause | Esc or P |

Gamepads are supported: left stick moves, right stick looks, RT fires, LT zooms, LB
shoves and RB uses. A jumps, B crouches, X reloads, Y switches to the last weapon and L3
sprints. On the D-pad, up is the flashlight, down the throwable, right the first-aid kit
and left the pills. Start pauses.

## The campaigns

### Dead Air (default)

1. **The Greenhouse**: from a rooftop greenhouse across plank bridges and apartment
   roofs, down a fire escape and onto a semi truck, into the Harborview Hotel kitchen.
2. **The Crane**: up through the hotel to its roof, work a construction crane to
   swing a dumpster across the gap while the horde pours in, then through an office
   tower to the Stor-Safe self-storage safe room.
3. **The Construction Site**: an unfinished high-rise; blow the barricade rigged with
   gas canisters, then transformer yards, a power station, the airport parking garage
   and the skybridge.
4. **The Terminal**: conference wing, check-in hall, hotwire a crashed shuttle through
   the barricade, baggage handling, a security checkpoint with a live metal detector,
   the concourse and gates.
5. **Runway Finale**: an airliner crashes on the runway as you leave; radio the pilot,
   run the fuel pump and hold the apron through waves and Tanks until the transport
   is fuelled, then board for the takeoff.

### No Mercy

1. **The Apartments**: start on a rooftop, fight down through burning apartments and
   the streets, then go into the subway station safe room.
2. **The Subway**: station concourse, a stalled train, the dark tunnels, and a
   generator-powered gate crescendo in the substation. Ends at a pawn shop.
3. **The Sewer**: streets and a gas station, a scissor-lift crescendo over the
   flooded sewer, then the tunnels into the hospital.
4. **The Hospital**: wards and corridors, then a long elevator ride up while the
   horde claws at the doors, and the upper floors.
5. **Rooftop Finale**: call the pilot on the radio, hold out through waves and two
   Tanks with mounted miniguns and the supplies on the roof, then run for the
   helicopter.

## Features

- **Combat**: pistols, magnum, SMGs, shotguns, assault rifles, hunting rifle, M60,
  grenade launcher, mounted minigun and melee (fire axe, crowbar, machete, katana,
  baseball bat, frying pan, chainsaw) with recoil, spread bloom, shell ejection,
  per-weapon reload animations, penetration and friendly fire. Throwables are
  Molotovs, pipe bombs and bile jars. Items: first-aid kits, defibrillators,
  incendiary/explosive ammo packs, laser sights, pills and adrenaline.
- **First person**: articulated hands (18-bone arms per survivor) with a grip pose for
  every weapon and item; hands follow magazines, pumps and bolts during reloads.
- **Infected**: large hordes (instanced rendering) that climb, vault, drop, break doors
  and flow around obstacles on a layered navigation grid. They have hit reactions,
  dismemberment, gibs, ragdolls and burning. The special infected are the Hunter,
  Smoker, Boomer, Charger, Jockey, Spitter, Tank and Witch, plus uncommon infected.
- **AI Director**: tracks intensity, health, ammo, progress and incaps. It paces
  build-up, peak, fade and relax phases, and controls wandering infected, mobs from
  several directions, special-infected timers, Tanks, Witches, item placement,
  crescendo panic events and dynamic music.
- **Survivors**: Bill, Zoey, Louis and Francis are original interpretations with
  their own look, personality and voice (subtitles plus optional browser
  text-to-speech). The game has incap, revive, a black-and-white state and death,
  plus temporary health, first-aid kits and pills.
- **AI teammates**: follow the leader, fight, revive and heal teammates, free pinned
  survivors, pick up items and use doors.
- **Co-op**: up to four players, with AI bots filling empty slots (see below).
- **Rendering**: procedural PBR materials and wall art (graffiti, posters, signs),
  detailed props and clutter, dynamic lights mapped onto a fixed light pool, shadows,
  ambient occlusion, fog, bloom, film grain and per-campaign color grading, teammate
  and item outlines, blood on the screen, persistent blood and scorch decals, and
  particle fire, smoke, sparks and blood.
- **HUD**: minimal, with teammate status (down, pinned, black-and-white, dead),
  inventory, hold-to-use progress and optional route arrows on the ground.
- **Audio**: fully synthesized Web Audio sound effects with occlusion-free spatial
  panning, indoor/outdoor reverb zones, ambience beds and adaptive music stingers.

## Co-op (experimental)

Online co-op works in principle but has not been play-tested end to end yet; the
single-player campaign with AI teammates is the supported way to play.

One player hosts. The host's browser runs the authoritative simulation. Up to three
friends join with a four-letter room code, and each one takes over an AI survivor. If a
player disconnects, a bot takes over their survivor.

1. Everyone opens the same game server, for example `npm run dev -- --host` on the
   host's machine, or a deployed `npm run server`.
2. The host opens **Co-op → Host game**, picks a chapter and difficulty, and waits for
   friends in the lobby.
3. Friends open **Co-op**, enter the room code and choose **Join game**.
4. The host presses **Start**.

The relay address defaults to the server the page came from (`ws://<host>/net`). For
LAN play, open the host machine's LAN address in every browser.

## Project layout

```
src/core       math, input
src/render     renderer and post-processing, procedural textures and materials, lights, particles, decals, sky
src/world      collision world, navigation grid, level builder, doors/props/platforms, items
src/combat     weapons, viewmodel, combat and ballistics, gore, mounted guns
src/entities   survivors, bots, common and special infected, animated bodies and ragdolls
src/ai         AI Director
src/audio      synthesized audio engine, music, ambience, dialogue
src/levels     the five chapters plus a shared level kit and prop library
src/net        co-op transport and host/client replication
src/ui         HUD and menus
server/relay.js  zero-dependency WebSocket relay (also serves ./dist)
tests/         headless Playwright scenarios used during development
```

## Development tests

The `tests/` folder holds headless Playwright scenarios (for example
`node tests/play.mjs tests/scen_finale.mjs`) that drive the game deterministically with
`game.advance()` and save screenshots to `tests/out/`. `node tests/coop.mjs` runs a host
and a joining client in two browsers.
