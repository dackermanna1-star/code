# CORRODE — Game Design Specification (Deliverable B)

> Working title. A **singleplayer** voxel survival sandbox: it looks like a block world and plays like a
> hardcore survival game. Multiplayer was explicitly deferred by the project owner; the simulation is built
> as an integrated server so it can return later (see ARCHITECTURE.md).

Status legend used throughout: **[done]** implemented and exercised, **[partial]** implemented with known gaps,
**[planned]** designed but not built.

## 1. Pillars

| Pillar | What it means in CORRODE |
|---|---|
| Authentic voxel presentation | Everything is 1 m blocks on one grid, procedural 16×16 pixel textures, readable silhouettes, smooth lighting + AO. |
| Hardcore survival | Calories, water, temperature, bleeding, radiation, poison; death drops everything into your body. |
| Meaningful progression | Rock → stone tools → metal → workbench tiers 1–3, gated by blueprints learned with scrap. |
| Creative base building | Free block placement *and* modular structure pieces with tiers, stability, doors, locks and upkeep. |
| Risk-driven danger | Monuments hold the best loot *and* armed scavengers, radiation and predators. |
| Emergent stories | Systems interact: night + wolves + no torch; a raid on a monument with a half-repaired base waiting. |
| Technical excellence | Authoritative fixed-rate simulation, worker meshing, atomic saves, tests and measured performance. |

## 2. Core loop

```
spawn on a beach (rock, torch, bandage)
  → gather (trees, stone, ore boulders, hemp, berries, animals)
  → craft tools / clothing / campfire / sleeping bag
  → build a twig shelter → upgrade → doors + lock → claim totem with upkeep
  → smelt ore, craft workbench 1 → research blueprints with scrap
  → raid monuments (crates, barrels, scavengers, radiation) for components, scrap, guns
  → workbench 2/3, armor, explosives → stronger base → deeper monuments
  → die, recover your body, adapt
```
Every session poses the questions from the brief: gather more or go home? risk the monument now or after
dark? spend metal on a door or on ammo?

## 3. World

* **Generation [done]** — deterministic from the seed (shared code, pure function of `(seed, cx, cz)`):
  continentalness → ocean/coast/land, erosion + ridged noise → mountains, a river noise channel, temperature
  and humidity → 13 biomes (ocean, beach, stony shore, grassland, forest, birch woods, taiga, tundra, desert,
  dry steppe, swamp, mountains, river). Slopes expose stone, peaks get snow. Caves: interpolated 3-D "cheese"
  caverns plus "spaghetti" tunnels that occasionally break the surface.
* **Resource geography [done]** — wood is dense in forests and absent in deserts; metal ore veins are more
  common under mountains; sulfur is boosted in deserts/mountains/tundra; rich (high-quality) ore only deep
  (y < 30). Surface **ore boulders** (2×2×2 clusters) make ore available to a starting player, more of them in
  rocky biomes. Hemp, berries, mushrooms and cacti are biome specific.
* **Monuments / POIs [done]** — one per 384×384 region at most, on flattened land, each fully traversable on
  foot (verified by a reachability test):

  | Monument | Tier | Radiation | Identity |
  |---|---|---|---|
  | Radio Outpost | low | none | fenced compound, hut with roof crate, climbable mast |
  | Abandoned Gas Station | low | none | canopy and pumps, shop, car wreck, roof crate |
  | Harbour Container Yard | mid | light | quay basin, teal dock crane, container stacks, gantry, smokestack |
  | Stone Quarry | mid | light | terraced pit with mineable ore, excavator, conveyor to a hopper shed |
  | Globe Tank | high | medium | plated sphere on legs, ring walkway, inner spiral to a roof crate |
  | Sealed Bunker | high | strong | blockhouse, stairwell to an armory hall, watchtower, helipad |
  | Power Station | high | medium | turbine hall + control room, boiler house, twin 40-block stacks, cooling tower |

  Each places supply/military crates and barrels that refill after being emptied; mid/high tiers have
  scavenger garrisons that respawn after being cleared.
* **Time & weather [done]** — 40-minute cycle, 30 % night; rain/snow fronts lower temperature, visibility and
  sound clarity.
* **World size** — unbounded in practice (int32 chunk coords); spawns pick beaches within ~600–900 blocks of
  the origin.

## 4. Survival model [done]

| Stat | Range | Drains from | At zero / extremes | Counters |
|---|---|---|---|---|
| Health | 0–100 | damage | death → corpse with all items | food regen, bandage, syringe, medkit, campfire (faster regen) |
| Calories | 0–500 | time, sprinting, cold | starvation 0.2 HP/s | berries, mushrooms, cooked meat, beans |
| Hydration | 0–250 | time, heat | 0.25 HP/s, cannot sprint | fresh water (E on rivers/lakes), cactus, bottles; **ocean water dehydrates** |
| Temperature | felt °C | biome, altitude, night, rain, wetness | < 8 °C cold (calorie drain), < −4 °C damage; > 32 °C thirst, > 42 °C damage | clothing warmth, fire within 4 blocks, shelter |
| Bleeding | points | melee/bullet/animal hits, bad falls | 0.5 HP/s while bleeding | bandage/syringe |
| Radiation | rads | monument zones × (1 − suit protection) | > 40 rads: damage | hazmat suit, anti-rad pills, leaving |
| Poison | points | raw meat | damage over time | cook your food |

New characters start hungry-ish (150 kcal, 80 water, 60 HP) so food and water matter in the first minutes.
Metabolism rates are world-config values (`metabolismRate`).

## 5. Gathering & crafting

* **Per-hit yields [done]** — every block has gather HP; a swing deals tool damage × effectiveness and pays
  out resources proportional to the damage dealt (Rust's feel) — a rock works on everything but slowly and
  at 60 % yield; hatchets for wood, pickaxes for stone/ore, metal tiers ~1.5×. Proper tools get a 20 %
  finishing bonus on stone/ore. Breaking a tree's base **fells the whole tree** (remaining logs pay 50 %).
* **Blocks you dig drop as blocks [done]** (dirt, sand, gravel, snow, clay) for Minecraft-style terraforming;
  planks/cobble/bricks/glass are craftable decorative blocks.
* **Crafting [done]** — 60+ data-driven recipes with craft times, quantities, queue (8 jobs), cancel refunds,
  and refunds on death. Bench requirement = a workbench of that level within 4 blocks.
* **Progression [done]** — tier 0 recipes are known from the start; tier 1–3 items require **blueprints**
  learned at a Research Table by sacrificing the item plus scrap (20/75/125/500 by tier). Blueprints persist
  for the world (a world option can carry them over on wipe — relevant once multiplayer returns).
* **Smelting & cooking [done]** — furnace: ore → fragments/sulfur/refined metal (1 unit/s per stack, wood
  fuel, charcoal by-product); campfire: raw → cooked (10 s) → burnt (30 s).

## 6. Building [done]

Freeform blocks give Minecraft creativity; **structure pieces** give Rust-style bases.

* Grid: building cells are 4×4 blocks; walls sit on the grid lines and are shared by neighbours; rooms are
  3×3×3 inside; corner pillars and floor rings are *derived* cells that exist while any piece claims them and
  are never damaged directly.
* Pieces: foundation (needs ground), floor, wall, doorway, window, half wall, stairs (also forms the floor
  above with a stairwell), doors (wood/sheet metal/armored) placed into doorways.
* Tiers: twig (10 HP) → wood (250) → stone (500) → sheet metal (1000) → armored (2000), costs 50 wood /
  200 wood / 300 stone / 200 metal / 25 refined metal per full piece. The **hammer** upgrades (RMB), repairs
  (LMB, blocked for 30 s after damage, costs materials) and demolishes (within 10 min of placing).
* **Stability**: foundations 100 %; walls inherit from the floor under them (×0.9 stacked on walls); floors
  get ×0.8 from walls below or ×0.5 cantilevered from a neighbour floor; anything under 30 % cannot be placed
  and collapses when its support is destroyed (cascading). Disconnected parts split into separate buildings.
* **Claim Totem** (tool-cupboard equivalent): placed on a foundation/floor, authorizes its placer, projects
  building privilege 3 cells (12 blocks) around the whole building and 16 blocks vertically. Inside a foreign
  claim you cannot place anything or **mine any block** — this closes the "dig under the walls" voxel exploit.
* **Upkeep & decay**: the totem's storage pays a progressive fraction of the building's cost per day
  (10 % ≤ 15 pieces, 15 % ≤ 50, 20 % ≤ 125, 33 % beyond) so huge bases cost more; unpaid tiers decay fully
  in 1/3/5/8/12 h (twig → armored). Doors and code locks are on the same rules.
* **Code locks** (4 digits) on doors, boxes and totems; wrong codes shock the user (anti brute-force).

## 7. Raiding & destruction [done]

Explosive damage applies once per piece (nearest cell distance, falloff beyond 1 block) times the tier/door
multiplier; damage also chews through terrain and freeform blocks (cumulative blast HP), so cave bases are
breachable but natural stone is never free armour.

Charges needed for a fresh piece (ceil(HP / (damage × multiplier)), charge stuck on the face):

| Target | HP | Breach Charge (275) | Fuse Charge (55) | Tin Grenade (18) |
|---|---|---|---|---|
| Wood wall | 250 | 1 | 5 | 14 |
| Stone wall | 500 | **2** | **10** | 28 |
| Sheet metal wall | 1000 | **4** | 19 | 56 |
| Armored wall | 2000 | **8** | 37 | 112 |
| Wooden door (×2 explosive) | 200 | **1** | **2** | 6 |
| Sheet metal door | 250 | **1** | 5 | 14 |
| Armored door | 1000 | 4 | 19 | 56 |

Bold = matches the researched Rust ratios (docs/RESEARCH.md §R3). Fuse charges have a 15 % dud chance (they
fizzle and re-ignite). Melee does 2 % to stone and less to metal; bullets barely scratch stone — soft raiding
is only viable against twig and wood.

**Singleplayer note:** without other players, raiding is something *you* do (monuments are unbreakable; you
breach your own mistakes, scavenger structures are a planned addition) and defence currently matters only
against decay. See §11 for the proposed NPC raid parties that would make base defence matter.

## 8. Combat [done]

* Melee weapons and tools swing at their own rates and ranges; spears reach 3.2 blocks.
* Bows/crossbows and five firearms (pipe pistol, scrap shotgun, lever rifle, service rifle, marksman rifle)
  fire **simulated projectiles** with travel time and drop; damage falls off with distance; head ×1.8,
  legs ×0.75; spread grows when moving and shrinks when crouching; recoil kicks the camera.
* Armor reduces typed damage (melee/bullet/arrow/explosive, capped 80 %); bleeding chance per weapon.
* Hits are lag-compensated against the positions you saw (rendered ~110 ms in the past).

## 9. Creatures & NPCs [done]

| Creature | Temper | Notes |
|---|---|---|
| Stag | passive | flees from sight and gunshots |
| Boar | defensive | charges if you get close or hit it |
| Grey wolf | hunter | hunts you (sight ×1.6 at night), mostly spawns at night |
| Bear | defensive | 300 HP, hits for 30 |
| Scavenger (human) | hunter | guards monuments, sees 32 blocks (halved crouching, reduced at night, needs line of sight), keeps 7–16 blocks distance, strafes, retreats when hurt, fires real bullets; drops a lootable body |

Animals leave carcasses you harvest with tools for meat, leather, bone and fat. Predators don't spawn next to
a freshly spawned player for two minutes.

## 10. Persistence & death

* Worlds autosave every 60 s, on pause, on quit and on demand — **atomically** (IndexedDB transaction):
  edited chunks, building pieces, deployables and their contents, corpses, player state and world time.
* On death your inventory goes into your body (lootable for 15 min, then it spills on the ground). Respawn on
  a random beach or at a sleeping bag (300 s cooldown, shared by bags within 50 blocks).

## 11. Proposed next systems (design only)

* **NPC raid parties (planned):** scavenger squads periodically attack the player's claimed building with
  fuse charges and guns, scaled by base value and upkeep tier — this restores the meaning of Rust-style
  defence (airlocks, honeycombing, hard/soft sides) in singleplayer.
* **Soft/hard wall sides**, electricity, vehicles, keycard puzzles at monuments, more weapons/attachments,
  skins/clothing variety, horses.
* **Multiplayer (deferred by the owner):** swap the postMessage link for a WebSocket transport, re-introduce
  accounts, teams and sleepers (the code paths were prototyped before the singleplayer pivot).
