# LAST CALL

A first-person, physics-driven bar brawler inspired by *Paint the Town Red*. One two-story biker bar, forty-odd regulars with their own tempers, and anything not nailed down is a weapon.

Built with **three.js** (rendering), **Rapier** (WASM rigid-body physics), TypeScript and Vite. All characters, props, textures, music and sound effects are generated procedurally at runtime, so there are no external asset files.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/
npm run typecheck
```

Useful URL parameters: `?quality=low|medium|high`, `?mode=survival`, `?crowd=24`, `?autoplay` (skip the title screen), `?nolock` (play without pointer lock).

## Modes

- **Brawl**: the bar is peaceful until you throw the first punch. Clear everyone out and be the last one standing. Bikers call for backup as the bar empties, and Big Earl wakes up in the VIP lounge when things get out of hand (or when you go up there).
- **Survival**: endless waves through both doors, with a boss every fifth wave and free drinks between waves.

Difficulty (easy / normal / hard) changes how often enemies attack, how many can gang up on you at once, and how much damage you take. Best times and waves are saved locally.

## Controls

| Input | Action |
| --- | --- |
| WASD / Shift / Space / C | Move, sprint, jump, crouch |
| V or double-tap a direction | Dodge (brief invulnerability) |
| Left mouse | Punch / swing; hold for a haymaker or heavy overhead |
| Right mouse | Block; tap it just before a hit lands to parry |
| Q / middle mouse | Kick; look down for a stomp |
| E | Pick up, grab people, pick up bodies, use things, drink |
| F | Throw whatever (or whoever) you're holding |
| G | Drop |
| R | Rage when adrenaline is full |
| Tab | Stats · Esc / P pause |

Grab someone and look down at a table or the bar counter while punching to slam their face into it.

## What's in it

**Combat.** Combo strings of jabs, hooks and uppercuts. Charged haymakers, kicks, stomps, grabs, knees and throws. Blocking, parries, guard breaks, dodges, critical hits, knockdowns and finishers on downed enemies. Rage mode (half damage taken, double damage dealt, shockwave on activation). Hit-stop, camera trauma, view kicks and FOV punches scale with impact weight.

**Weapons.** Roughly 40 weapons: bottles (which break into jagged shivs), chairs, stools, pool cues, bats, knives, cleavers, frying pans, guitars, fire extinguishers, sledgehammers, chains, trays and more. Each has its own damage, reach, speed, weight, durability, damage type and move set. Big furniture can be carried and thrown. Drinks heal you and make you drunk.

**Bodies.** Characters are rigidly skinned voxel figures with hand-drawn faces and expressions (pain, rage, fear, laughing, knocked out). Damage bruises and then bloodies the skin texture where you hit. Hard hits carve voxels out of the body and expose flesh, skull and brain. Limbs and heads can be severed, and heads can pop. Knockdowns turn the character into an articulated Rapier ragdoll with joint limits; survivors get back up from whatever pose they landed in. Bodies take impact damage from walls, falls and other bodies.

**Gore and effects.** Directional blood sprays scaled by weapon and hit strength. Blood droplets fly as physics particles and leave stains wherever they land. Stumps spurt, pools grow under corpses, and walking through blood leaves footprints. Also splinters, glass shards, sparks, dust, teeth, spilled drinks, and blood on the screen during close-up violence.

**AI.** Thirteen archetypes (patrons, bikers, drunks, accountants, brawlers, punks, cowboys, bouncers, bartenders, cooks, waitresses, the band, and the boss) with distinct stats and personalities: aggression, bravery, skill, loyalty, greed and how much they like throwing things. NPCs sit, drink, dance, play pool and darts, use the arcade, feed the jukebox, and use the restrooms. They see and hear violence, hold grudges, and back up their friends. Fights spread through the crowd as brawl fever. Combatants take turns attacking (attack tokens), grab weapons, throw bottles, block and dodge. Others flee, cower or gather to watch, and grudges between NPCs lead to fights among themselves. Navigation uses a multi-level grid with flow fields and A*.

**The Iron Horse.** Downstairs: a long bar with beer taps, a till and back shelves of breakable bottles, plus booths, tables, a stage with a live band, a light-up dance floor, a jukebox, two pool tables, dartboards, an arcade corner, the kitchen, a storage room with back stairs, restrooms, the porch and the street. Upstairs: a ring balcony with breakable railings, a VIP lounge with the boss's throne, the staff room, a card room and the office. It has two staircases, saloon doors, breakable windows and mirrors, and persistent destruction. About 60 virtual lights are mapped each frame onto a fixed pool of real lights (neon flicker, disco lights, lights reacting to the music).

**Audio.** Fully procedural, using the Web Audio API: spatial impacts per surface material, punches, breaking glass and wood, footsteps, formant-synthesised voices, crowd chatter that turns to panic, and a jukebox playing procedural songs. The jukebox is a positional sound source, and the music intensifies as the brawl does.

**Presentation.** HDR rendering with bloom on neon and emissive surfaces. A single post pass handles tone mapping, vignette, damage flashes aimed toward the attacker, a low-health heartbeat, the rage grade, drunk double vision, slow-motion desaturation and radial speed blur. The HUD has health with a damage trail, adrenaline, the weapon and its durability, a charge ring, hit markers, a combo counter, a kill feed, speech bubbles and markers on the last few enemies. There's an attract-mode title screen, pause, settings (sensitivity, FOV, volumes, shake, gore, quality, crowd size), and an end-of-round screen with stats and a rank.

## Code layout

```
src/
  core/        engine (renderer, quality presets), input, time control (hit-stop / slow-mo), scheduler, settings, math
  physics/     Rapier wrapper: collision groups, materials, contact force events, queries, body interpolation
  characters/  rig, appearance generator, texture atlas + faces, voxel parts, pose library, animator, ragdoll, Character
  player/      controller (capsule movement), first-person view model, combat + grab/carry logic, interaction
  weapons/     weapon definitions and the held/thrown weapon system
  world/       prop definitions, batched props, level builder, the bar, doors/glass, bar fixtures (jukebox, taps, till)
  ai/          navigation grid, archetypes, brains, AI manager (perception, tokens, crowd intensity)
  fx/          particles, decals, gibs, camera FX, gore orchestration
  render/      procedural level textures, prop atlas, light manager, post-processing
  audio/       procedural audio: SFX, voices, crowd ambience, music
  game/        Game (round lifecycle and main loop), Director (spawning, objectives, waves), combat registry, events
  ui/          HUD, menus, styles
tools/         headless Playwright playtest harness and scenarios
```

The game runs a fixed 60 Hz physics step with interpolated rendering. Systems talk through a typed event bus (`hit`, `death`, `impact`, `noise`, `footstep`, ...), so gore, audio, the HUD and AI perception all react to the same gameplay events. Restarting a round frees the physics world, swaps the scene and drops the round's event listeners, so a new round starts clean without reloading the page.
