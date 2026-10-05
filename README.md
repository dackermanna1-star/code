# Delve

A first-person roguelike dungeon crawler. You go down through procedurally generated dungeons with a sword, a couple of potions and a bomb, and come back up (or don't) with a build.

Built with [three.js](https://threejs.org). Everything else is generated at runtime from code: textures, models, animations, sound effects and music. The game ships with no image, model or audio assets.

## Play

```bash
npm install
npm run dev      # http://localhost:8000
```

```bash
npm run build    # dist/index.html + dist/build/main.js, and dist/standalone.html
```

`dist/standalone.html` is a single self-contained file. You can open it straight from disk, no server needed.

The game needs a desktop browser with WebGL 2, a mouse and a keyboard.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left mouse | Attack. Hold to charge a heavy attack |
| Right mouse | Block. Raise it just before a hit lands to **parry** |
| Shift | Dodge (brief invulnerability) |
| Space | Jump (shockwaves can be jumped) |
| F | Kick: staggers, breaks shields, smashes doors, launches enemies into walls, pits and lava |
| E | Interact / pick up (shows a stat comparison) |
| Q | Drink a health potion |
| G | Throw a bomb |
| 3 | Drink an elixir |
| R | Use your ability |
| L | Open level-up choices (they also open by themselves once a fight ends) |
| X / mouse wheel | Swap between your two weapons |
| Tab | Character sheet |
| M | Map |
| Esc | Pause |

## What's in a run

- **Procedural dungeons.** Each floor is generated from the run seed: rooms connected by a spanning tree plus extra loops for alternate routes, and corridors routed with A*. Room types include combat rooms, ambush arenas that lock you in for waves, treasure rooms, locked vaults (the key comes from a champion), merchants, shrines, a challenge obelisk, hidden rooms behind cracked walls, and a boss arena. Rooms come in several shapes (pillared halls, octagons, spike pits, lava channels, flooded rooms) and are dressed with furniture.
- **Five themed depths**, each with its own palette, enemy mix and boss: The Forgotten Crypt, The Goblin Warrens, The Drowned Catacombs, The Infernal Forge and The Abyssal Depths. Beating the fifth boss unlocks an endless descent.
- **Melee combat**
  - Hit detection follows the same arc as the swing you see on screen. A wide slash can catch several enemies in order, and swinging into a wall bounces the blade off with sparks.
  - Every weapon type has its own combo, and holding the button charges a heavy attack.
  - Blocking costs stamina, and a parry staggers the attacker for a riposte. Parrying a projectile reflects it.
  - Dodges have invulnerability frames, and kicks work as a crowd-control tool.
  - Hits use hitstop, screen shake, camera kicks, slash trails and blood on the blade. The last kill in a fight triggers a short slow-motion.
- **Enemies.** Skeletons (some lie dormant and reassemble), archers, goblin skirmishers, pouncing ghouls, brutes that charge and slam (they stun themselves if they hit a wall), fire cultists that teleport, shield knights, exploding thralls, splitting slimes, bats and mimics.
  - Enemies take turns attacking so fights stay readable.
  - Attacks are telegraphed: a glint means you can block it, a red glow means you have to dodge.
  - Elites roll affixes (Burning, Frenzied, Armored, Vampiric, Volatile, Frostborn).
- **Physics and gore**
  - Enemies become Verlet ragdolls on death, and strong hits knock live enemies down as ragdolls too.
  - Heads and limbs can come off, leaving pumping stumps. Gore is configurable.
  - Blood, bone and goo splatter and leave decals.
  - Crates, barrels and pots break into planks and shards. Explosive barrels chain-react, and dropped weapons clatter around.
- **Loot and builds**
  - Seven weapon types: sword, dagger, axe, mace, spear, greatsword and warhammer.
  - Five rarities, 26 affixes (elemental procs, lifesteal, crit, reach, execute and more) and seven legendary uniques with special behaviour.
  - Armor, trinkets and 38 stacking relics, including cursed ones with trade-offs.
  - Active abilities, elixirs, and level-up boons where you pick one of three.
  - Picking up gear shows a stat comparison against what it would replace.
- **Replayability**
  - Seeded runs, with a daily seed button and retry-the-same-seed.
  - Five starting classes, unlocked through milestones.
  - Records persist between runs.

## Code layout

```
src/
  core/      seeded RNG, input, math helpers, procedural audio (SFX, ambience, adaptive music)
  render/    renderer + post-processing, light pooling, procedural textures/materials, particles & decals
  world/     dungeon generator, grid collision/navigation, mesh builder (baked AO), props, traps
  physics/   rigid bodies (props, debris, pickups) and Verlet ragdolls with dismemberment
  entities/  player controller, first-person viewmodel, enemy rigs/AI/attacks, projectiles
  items/     item database, loot generation, stat aggregation, weapon/gear models
  game/      game loop & run lifecycle, level/room events, combat resolution, loot manager
  ui/        HUD, minimap, tooltips, menus
```
