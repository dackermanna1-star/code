# Noita 3D — development reference

This file records, system by system, **what the original Noita does**, **what you can observe in play**,
**how this 3D voxel version implements it**, and **where it deliberately deviates**. Researched numbers
and sources are in [`research-notes.md`](research-notes.md) (each item tagged confirmed/uncertain).

## 0. Units and scale

| Quantity | Noita | Here | Conversion |
|---|---|---|---|
| World cell | 1 pixel | 1 voxel (0.2 m) | — |
| Player | Minä, ~12 px tall | 8.4 voxels tall, 2.7 wide | ≈ 0.7 voxel per Noita pixel |
| Distances, radii, speeds | px, px/s | voxels, voxels/s | × 0.5 (`magic/types.ts`) |
| Time | 60 frames/s | 60 ticks/s | identical (cast delay, recharge, lifetimes in frames) |
| HP / damage | displayed HP (internal × 25) | displayed HP | identical (player 100 HP) |
| Projectile gravity | px/s² | voxels/s² × (52 / 175) | rescaled to our world gravity |

Engine: TypeScript + three.js in the browser (WebGL2). Chosen because it runs anywhere, supports
custom shaders and typed-array-heavy simulation code, needs no installation, and can be driven
headlessly (Chromium + Playwright) for automated testing.

## 1. World and voxels

**Original.** A 2D world of simulated pixels, ~35,840 px wide; each pixel is a material.

**Here.** A 256 × 2048 × 256 voxel column split into 16³ chunks (`world/world.ts`, `world/chunk.ts`).
Each voxel stores a material id (`Uint8Array`). Extra state is allocated per chunk *only when needed*:
`aux` (burning flag + hp, gas lifetime) and `temp` (temperature delta). Chunks are generated
deterministically in Web Workers (`world/genWorker.ts`) and streamed around the player
(`world/streamer.ts`); unmodified chunks are dropped when far away and regenerated, modified chunks
are retained so every change persists for the whole run.

**Rendering.** Greedy meshing with per-vertex AO (`render/chunkMesher.ts`, ~0.4 ms/chunk) into compact
`Uint8` vertex streams, rebuilt only for dirty chunks within a per-frame budget, nearest first.
Each material has a 16³ periodic pixel-art pattern (`render/materialTextures.ts`) sampled at 2× voxel
resolution continuously across voxels, so walls read as dense hand-painted pixel surfaces rather than
flat blocks. Lighting is computed per voxel face (blocky, Noita-like) from: biome ambient, sky light
near the surface (sky-visibility bit baked by the mesher), and up to 40 unshadowed point lights —
spells, explosions, fires and per-chunk clusters of glowing materials (lava, lamps, fungus, crystals).
Like Noita's glow, lights are not occluded by terrain. Gases and fire render as point sprites.
The scene renders at ½ resolution by default and upscales with nearest filtering for a pixel look.

## 2. Material simulation (`sim/simulation.ts`)

**Original.** Falling-sand cellular automaton: powders fall and pile, liquids flow and layer by
density, gases rise, fire spreads through burnable materials, reactions convert materials on contact.

**Here.** The same model in 3D, run at 60 Hz only inside *active regions*: each chunk keeps a
bounding box of cells changed last tick ±1; untouched regions sleep and cost nothing.
Per tick, per active cell (bottom-up, alternating x/z order, per-tick stamps prevent double moves):

1. burning state → 2. thermal exchange & state transitions → 3. motion by kind → 4. reactions.

* **Powders** fall (up to 2 cells/tick), sink through lighter liquids, slide diagonally with a
  per-material `slide` probability (angle of repose).
* **Liquids** fall, sink through lighter liquids (Noita densities: oil 1.0 floats on everything,
  water 4, lava 6, …), flow diagonally down, then flow sideways *only* toward a spot where they can
  descend or when pressured by liquid above. This levels pools to within one voxel and lets them
  sleep (no perpetual jitter), conserves volume exactly, and drains basins when a wall is opened.
  Viscous liquids (lava, slime) update with lower probability.
* **Gases** rise, bubble through liquids, drift and expire (7-bit lifetime); steam condenses into water.
  Generated gas pockets are dormant until disturbed.
* **Fire** cells flicker upward, ignite flammable neighbours, die into smoke, and are put out by water.
  **Burning** materials (flag in `aux`) spread fire, emit flames/smoke into open air, are extinguished
  by adjacent water-like liquids, are smothered when no air touches them, and burn out into their
  product (wood → ash/air, coal → ash, flammable gas → fire). Gunpowder burns out into an explosion.
* **Thermal**: sparse temperatures (only where `temp` is non-zero). Heat sources (lava, fire, burning)
  push heat into neighbours; everything else conducts with a random neighbour, relaxes toward its natural
  temperature, and transitions when crossing melt/boil/freeze/ignition points while conserving absolute
  temperature (ice → water, water → steam, sand → glass, flammables ignite, water → ice when frozen).
* **Reactions** (`sim/reactions.ts`) are a central registry from Noita's reaction table:
  lava+water → rock+steam, fire+water → steam, fire+snow/ice → water, water purifies toxic sludge,
  blood+toxic → slime+smoke, concentrated mana converts water, acid corrodes any non acid-proof solid
  into flammable gas, acid slowly fumes, steam condenses on ice/snow…
* **Electricity**: conductive materials (water, metals, acid, lava…) carry charge by flood fill from
  the hit point; creatures touching charged voxels are shocked (wet creatures take more).

Termination guarantees (tested): finite lifetimes, burn hp, temperature relaxation, reactions that only
move toward stable products, and sleeping regions. Over budget, far chunks are deferred — the world slows
down before the frame rate does.

**Deviations.** Acid in Noita is never consumed; here each dissolved voxel has a 12 % chance to use up the
acid voxel, so a flask can't tunnel forever. Freezing does not spread through standing water by itself
(Noita's chilly-water chain) — cold must come from spells, ice spirits or the Freeze Field perk.

## 3. Destruction (`sim/destruction.ts`)

**Original.** Explosions cast rays with an energy budget spent on each pixel's hardness; a separate
durability gate (`max_durability_to_destroy`) decides what a spell can break at all (spark bolt 8,
TNT 11, luminous drill 14). The Bomb erodes the crater rim into powder.

**Here.** The same two-number model. Instead of casting thousands of rays, a precomputed **ray tree**
(offsets sorted by distance, each pointing to its parent one step toward the centre) gives
`cost(v) = cost(parent) + hardness(parent)` in O(volume). Materials use Noita's durability levels
and hardness / 1000 (soil 2, coal 25, rock 100, dense rock 200, steel 130, brickwork 1000).
Liquids and loose powders inside a blast are **launched as material particles** that land back into
the grid (volume conserved); solids become debris; gunpowder in range ignites (chain reactions);
fire explosions ignite and heat their surroundings. Digging spells carve spheres up to their
durability; Black Hole deletes every solid regardless of durability.

## 4. Wands and spells (`magic/`)

**Original.** `gun.lua`: deck/hand/discard, spells/cast draws, modifiers and multicasts draw more and
*wrap* (forcing a recharge), unaffordable spells are skipped, triggers draw their payload into a separate
shot state, cast delay and recharge tick concurrently, shuffle reorders the deck on reload.

**Here.** A faithful port (`magic/casting.ts`), unit-tested against the wiki's worked examples
(`tests/casting.test.ts`, 51 tests): root draws never wrap; spell draws wrap and force a reload;
unaffordable or 0-use cards are discarded and the next card is drawn; payload mana is paid up front,
payload cast delay ignored but payload recharge changes counted; total wait = max(cast delay, recharge);
no cast delay when nothing was cast; uses decrement only when a projectile was produced; always-casts.
79 spells / 40 projectile definitions (`spells.ts`, `projectileDefs.ts`) are pure data; the
`ProjectileSystem` (`entities/projectiles.ts`) interprets them: swept collision against voxels and
creatures, bounces, digging, explosions, triggers (hit/timer/expiry), formations, spread, homing,
piercing, trails, sprays, expanding circles, seas, lightning, black holes, teleport bolts.

**Deviations.** Formation spells fan out in the camera's horizontal plane ("Above and below" fans
left/right). Spell spawn tiers for the strongest spells were moved deeper. See the casting agent notes in
the commit history for smaller stand-ins (e.g. Bubble spark's base spread applies to the whole shot).

## 5. Player (`entities/player.ts`)

**Original.** Walk, small jump, ~3 s levitation that refills in ~0.5 s on the ground, swimming,
kick (1 melee damage), no fall damage, 100 HP, no natural regeneration, 0.35× explosion damage.

**Here.** The same rules in first person: WASD walk (19 voxels/s), Space jump, hold Space to levitate
(3 s meter), swimming with buoyancy and drag, F to kick, Shift to crouch through low tunnels
(3D addition), drowning after ~12 s fully submerged. AABB physics with sub-stepping (no tunnelling),
automatic step-up of 2-voxel ledges, and depenetration when terrain appears inside the body.
Projectiles leave from the wand's actual tip; the target point is the camera ray's hit, and the muzzle
is pulled back if it pokes into a wall.

## 6. Damage, stains and status (`entities/damage.ts`)

All damage flows through one `DamageSystem.apply` (types, multipliers incl. immunities and healing
types, berserk, knockback, bleeding). Creatures bleed their own material as real voxels (blood, toxic
sludge, lava, acid, oil, gunpowder…). Contact with materials drives stains exactly like Noita: wet,
bloody and slimy prevent ignition; oiled makes fire last 3× longer; toxic drains 2 % max HP/s but can't
kill; on fire costs 2 % max HP/s and makes enemies panic instead of attacking; healthium regenerates,
mana stains boost wand recharge, teleportatium causes teleportitis, berserkium doubles damage.
Contact damage per voxel is Noita's per-pixel value scaled to voxel contact (acid ≈ 9.5 HP/s per voxel —
standing in acid is quickly lethal, as in Noita). **The player is not immune to their own magic**:
explosions always hit everyone; arrows, healing bolts, acid balls etc. can hit their caster.

## 7. Enemies (`entities/enemies.ts`, `entities/enemyDefs.ts`)

Roster with wiki HP, attacks, resistances and blood: Hämis, (weak) Hound, (weak) Shotgun Hiisi,
(weak) Miner Hiisi (throws TNT that digs), Toxic/Acid slimes, Stendari (fire immune fire mage),
Liekkiö (scatters gunpowder when hurt), Bat, Lesser Firefly, Grenadier and Gunner jetpack Hiisi,
Sniper (laser-sight telegraph), Ice Spirit, Old Man Winter (heals from ice), Ukko (heals from
electricity, telegraphed thunder), Tank, Turret (horizontal fire only), Stevari (Holy Mountain guardian),
oil barrels and propane tanks. Enemy projectiles use the same runtime as spells.

AI states: idle/wander → alert (reaction delay; weak variants are slower) → chase/kite at a preferred
range with strafing → telegraphed windup → attack/burst → cooldown. Ground enemies jump over obstacles
or side-step; flyers hover. Burning enemies panic. Enemies retaliate against whoever hurt them, so stray
fire causes infighting. Gold drop = max HP / 2.5, doubled for "trick" kills (environment or other
creatures). Corpses leave meat and their blood material in the world.

**Deviations.** No navigation mesh: steering + jumping, which can get stuck in complex caves.
Enemies outside loaded chunks sleep.

## 8. Generation and progression (`world/generator.ts`, `world/biomes.ts`, `game/progression.ts`)

Biome stack below a surface valley with the mountain entrance (moss stone pillar with the controls,
stone head statue): Mines, Coal Pits, Snowy Depths, Hiisi Base, Underground Jungle, The Vault, then the
final chamber with the Sampo. Each biome is 256 voxels deep and followed by a 64-voxel Holy Mountain band.
Caves: coarse-grid 3D noise (chambers) + paired-noise "spaghetti" tunnels + a **guaranteed descent
route** (a wide spline gallery, radius ≈15, from the previous Holy Mountain's exit to the next one's
entrance, narrowing only into the entrance shaft) that opens into a **large hall** at each of its four
waypoints, plus three side caverns per biome on branch tunnels. Cave noise is large-scale and smooth
so that most open space is room to move and fight rather than crawlspace (`scripts/openness.mjs`
measures it: in the Mines ≈52 % of voxels are open and ≈58 % of the open space has an 8-voxel bubble
of room, up from 28 % / 15 %). Lantern posts stand along the route every ~30 voxels. Structures
placed by region (mine platforms and frames, brick ruins, ice pillars, Hiisi bunkers and catwalks,
jungle vines and mushrooms, vault glass pipes full of liquid), liquid pools and gas pockets that then
settle physically. Every voxel is a pure function of the seed, so a seed reproduces a world exactly.

Gold dust (from eroded gold veins) is collected on touch, 1 gold per voxel, and blasts fling loose
items around. Holy Mountains (built from Noita's durability-14 brickwork): entrance shaft, a room with a shop
(spells or wands with prices), a perk altar (take 1 of 3), a Spell Refresher, the Full Health heart
(+10 max HP, full heal), and an exit shaft. **Wands can only be edited inside an un-collapsed Holy
Mountain** (or with Tinker with Wands Everywhere). Leaving down the exit collapses it behind you.
Damaging the brickwork angers the gods and summons Stevari (here and in every later mountain).
30 perks are implemented (`game/perks.ts`).

**Way-down guide.** A marker strip at the top of the HUD points along the route to the next Holy
Mountain (then to its exit shaft, and finally to the Sampo) with the depth still to go. Noita needs
no such aid because its 2D side view always shows "down"; in first person, caves hide the way, so
this is a deliberate deviation (it can be switched off in Options).

**Deviations.** Noita's Holy Mountains are entered through Teleportatium-powered portals and exits;
here they are physical shafts (the world is one continuous 3D column). The perk reroll machine
(200 gold, doubling) and the pacifist chest (no kills in the biome above) are implemented.

## 9. Potions (`game/inventory.ts`, `game/run.ts`)

Flasks hold 1000 units of *real* material. LMB pours a stream of material particles that land as
voxels; RMB throws the flask, which shatters and releases its contents; R drinks a sip (10 % of every
material, applying Noita's ingestion effects); holding E while aiming at a liquid fills the flask from
the pool, removing those voxels from the world.

## 10. Presentation

UI follows Noita's compact layout: quick bar (4 wands + 4 items with charge counters), active wand's
spell strip, HP/levitation/mana bars and gold top-right, stain/status chips with percentages, inventory
screen (WANDS | ITEMS | SPELLS + wand cards with all stats, drag & drop, tooltips), biome title cards,
floating damage numbers, red hurt vignette, main menu with starry mountains and the gothic logo,
game-mode selection, options, rebindable controls, pause, death and victory screens.
All art (spell/perk/item icons, wand sprites, menu backdrop) and all audio (58 SFX, 6 loops, 9 biome
ambience beds) are generated procedurally — the game ships no image or sound assets.

**Tutorial.** As in Noita, the controls are carved into a stone at the start; on top of that, one-time
contextual hints explain moving, casting, levitating, flasks, new wands and spells, Holy Mountain wand
editing and "experiment with materials". Hints and prompts name the player's actual key bindings, and
seen hints are remembered across runs (Options → Tutorial hints → show again).

## 10b. Save & continue (`game/save.ts`)

*Save & quit* (pause menu) writes the run to IndexedDB; the main menu then offers *Continue*. Since the
world is a pure function of its seed, a save holds only what diverged from generation: the seed,
modified chunks (materials, burning/hp state, temperatures), the set of chunks whose spawns were
already handed out, the creatures and pickups that exist, the player (position, HP, gold, perk-changed
stats, stains), inventory (wands with spells and mana, flasks with real material amounts, the spell
bag) and progression (perks, collapsed/visited mountains, angry gods, rerolls, pacifist counters).
Flask contents are stored by material name and the save records the material table, so an
incompatible save is refused instead of being misread. Runs stay single-life: dying, winning or
starting a new game deletes the save. Restored chunks are simulated once on load so liquids in motion
keep moving.

## 11. Verification

* Unit tests (`npm test`): generator determinism, chunk/point agreement, route connectivity for several
  seeds including Holy Mountain shafts, liquid conservation & settling & sleeping, powder piles, density
  layering, burning termination, water extinguishing, heat transitions, reaction termination, gunpowder
  chains, acid, gases, physics (seams, tunnelling, step-up, depenetration, digging across chunks,
  raycasts), explosion durability/energy, combat (hits, walls, falloff, LOS, 0.35× player explosions,
  self-damage, triggers, immunities, burning/water, toxic non-lethal, single death), the casting engine,
  procedural art and audio.
* Browser scenarios (`npm run smoke -- <scenario>` with the dev server running): boot, tour of all
  biomes, combat, enemies, arena, holy mountain, death/restart, stress (flood + oil fire + explosions),
  and **walk** — an automated player that walks from the spawn to the first Holy Mountain using only
  movement input; **hmexit** (drop down a Holy Mountain exit: it collapses behind the player without
  trapping them); **saveload** (blast a crater, change gold/HP/perks/inventory, Save & quit, Continue,
  and compare terrain and state).
