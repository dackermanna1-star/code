# Abyssal Descent — Architecture & Implementation Plan

Target: **Minecraft 1.21.11**, **Fabric Loader ≥ 0.19.2**, **Fabric API 0.141.x**, Java 21, Mojang mappings.
No dependencies beyond Fabric API.

## 1. Pillars

| Pillar | Decision |
| --- | --- |
| Player combat | 100% vanilla: attack cooldown, crits, sweeps, shields, bows and crossbows are untouched. Gear changes *what happens* when a vanilla hit/arrow lands (procs, projectile behaviour, set bonuses). Procs need a **fully charged** swing, so spam-clicking never triggers them. |
| Enemies/bosses | Custom AI, telegraphed attacks (ground decals rendered by a dedicated `TelegraphEntity`), multi-phase bosses, arena hazards. Everything is readable before it hits. |
| World | A dedicated dimension (`abyssal_descent:the_depths`) whose chunk generator **deterministically** builds dungeon floors off-thread during normal chunk generation. No runtime block-placing lag. |
| Data | Layout is a pure function of `(world seed, run slot, floor)`. Server and generator recompute the same `FloorLayout`, so no layout data needs to be stored or synced. |
| Atmosphere | Each zone is its own biome using 1.21.11 *environment attributes*: fog colour/distance, ambient particles, ambient loop/mood/additions sounds, music. |

## 2. World layout

```
x = slot * 1024 (+512 centre)        one run ("expedition") per slot, slots never reused
z = floor * 512                      floor 1..30, each inside a 384x384 footprint
y = 64                               floor level of every room
```

* `DungeonBiomeSource` maps the z band to the zone biome (floors 1–5 → `forgotten_halls`, … 26–30 → `abyssal_throne`).
* `DungeonChunkGenerator` fills the floor footprint with the zone's bedrock-like filler, then carves and decorates every room/corridor that intersects the chunk. Painting is clipped to the chunk being generated (`ClippedSink`), and per-room RNG is seeded by room id, so a room spanning four chunks is painted identically in each.
* Block entities (reliquaries, urns) are placed in `applyBiomeDecoration` through the `WorldGenLevel`, which is the vanilla-safe way to create them during generation.

## 3. Floor generation (`dungeon.layout`)

1. **Grid growth** – a growing-tree walk over a `W×H` grid of 24-block cells picks `N` cells (size scales with depth). This gives organic, non-rectangular floors.
2. **Graph** – the walk produces a spanning tree; ~15% extra edges create loops so floors aren't purely linear.
3. **Roles** – BFS from the start cell: farthest cell → exit (or boss antechamber), dead-ends → treasure/secret candidates, then merchant, shrine, elite and combat rooms by depth-scaled weights.
4. **Geometry** – each cell gets a room with random interior size; corridors are Z-shaped, 3 wide, and may be trapped (spike plates, dart walls).
5. **Boss floors (5,10,…,30)** – an arena is attached north of the exit room behind a boss gate. Floors 10/20/30 chain a mini-boss arena into a major-boss arena (two-stage).
6. **Secrets** – a hidden room is attached to a dead end through a *Crumbling Wall*.

Room interiors are painted by a zone `ZoneStyle` (for the Forgotten Halls, `ForgottenHallsStyle`: crypt hall, ossuary, catacomb, chapel and burial-pit archetypes plus dedicated start, exit, vault, secret, camp, shrine and antechamber rooms) on top of weighted block `Palette`s.

## 4. Run lifecycle (`dungeon.run`)

```
Abyssal Gate (overworld) ──5s attunement──► Floor N start room
   ▲                                             │ explore, clear sealed combat rooms
   │ extract (Waystone / Waystone Shard)         ▼
   └──────────────── Waystone ◄── boss floor ◄── Descent Rift (whole living party on the rift)
                         defeat ──► expelled to gate (rules below)
```

* `RunManager` (`SavedData`) owns runs: slot, members, current floor, per-floor room state (cleared/active), boss state, gate return points.
* `EncounterDirector` ticks every 10 ticks per active run: detects room entry, seals doorways with *Runic Seals*, spends a depth/party-scaled **threat budget** on waves from the zone's enemy pool (with telegraphed summon circles), and unseals + rewards on clear.
* `WaveBuilder` turns the floor's threat budget into waves: wave count, elite chance and which enemy archetypes are unlocked scale with depth, waves open with a frontline and protect their ranged enemies. Health/damage scaling (configurable) is deliberately small; difficulty comes mainly from composition, behaviours and hazards.

### Death & extraction rules (shown by `/abyssal rules` and item tooltips)

| Situation | Unsecured loot (found this run) | Gear you brought | Progress |
| --- | --- | --- | --- |
| **Extract** at a Waystone or with a Waystone Shard | Becomes **secured** (yours) | Kept | Floor/boss unlocks saved |
| **Defeated** | **Lost** | Kept, but equipped/held damageable items lose 10% durability (*Death's Toll*, configurable) | Unlocks already earned are kept |
| Leave by any other means (commands, crash recovery) | Purged | Kept | — |

* Loot is tagged with the `abyssal_descent:unsecured` component (run id) the moment it is generated in the dungeon (loot-table drop hook, reliquaries, merchant purchases).
* Defeat intercepts lethal damage (`ALLOW_DEATH`): no vanilla death screen, no item scatter; the player is expelled at full health. Totems of Undying still work first.
* **Permanent unlocks** (per player, persistent data attachment): zone checkpoints (beat floor 5 → may start on floor 6, …), deepest floor, bosses slain, extractions. Ancient Coins are ordinary loot, so extracted coins carry over to merchants in future runs.

## 5. Combat systems (`item`, `effect`)

* `WeaponEffect` hooks: `onHit` (from `Item.hurtEnemy`, gated by the full-charge snapshot captured in `AttackEntityCallback`), `onProjectileHit`, `onKill`. Effects are composable and data-carried on item definitions.
* Bows/crossbows keep vanilla draw/charge; on release the projectile is tagged (`ProjectileTraits` attachment) and the trait runs on impact (piercing soul arrows, bone shrapnel, explosive no-grief bursts, …).
* Daggers/greatswords are vanilla sword items with different attribute modifiers (speed/reach/damage), so the cooldown bar remains the skill expression.
* `ArmorSets`: pieces carry a set id; a 10-tick scan counts pieces and applies **transient** attribute modifiers plus event-driven bonuses (cheat-death with cooldown, opening strikes, kill-healing). Cursed sets (Wraithbound) pair a strong bonus with a real drawback.
* Relics work from the hotbar/offhand; at most 3 distinct relics are active (duplicates don't stack).
* Potions are vanilla potion items backed by custom `MobEffect`s (Mending, Warding, Bloodrage, Soulward, …) with brewing recipes.

### Rarity

`Common → Uncommon → Rare → Epic → Legendary`, stored in the item definition, coloured name + tooltip header. Higher tiers add *mechanics*, not just numbers: Common = solid base stats, Uncommon = passive, Rare = proc, Epic = build-defining mechanic, Legendary = signature effect + unique visuals. Weights per loot source and the per-floor rarity shift are configurable.

## 6. Bosses (`entity.boss`)

* `DungeonBoss` base: `ServerBossEvent`, phase thresholds, intro (title card, gate seal, music sting), invulnerable phase transitions, death sequence, guaranteed loot table + exclusive drop.
* Attacks are small state machines inside each boss (windup → active → recovery) chosen by weight, range, phase and cooldown. Windups spawn `TelegraphEntity` decals (circle / zone / line / cone) that fill up until impact, plus a synced action id that drives the model's keyframe animation.
* Arena features (the throne, sarcophagi that release minions, the reward spot) are fixtures of the generated arena and handed to the boss through the floor layout.

## 7. Client (`client`)

* Entity models are Java `LayerDefinition`s with vanilla keyframe `AnimationDefinition`s; emissive layers carry eyes, runes and soul fire. Textures, sprites and models are pixel art produced by the generators in `tools/assets/`.
* HUD: a top-left expedition panel (floor, zone, objective, chambers, unsecured loot, party) synced from a player data attachment, with a descent countdown under the crosshair. Inside the depths the vanilla boss bar is replaced by a framed bar in the zone colour with a lagging damage trail, phase notches and a phase numeral; the panel steps below it when they would overlap.
* Boss music: vanilla only plays boss music in the End, so a client mixin selects the zone's boss theme while a dungeon boss bar requests music.
* Feedback: decaying camera shake on heavy impacts (server packet), loot sparkles scaled by rarity, trails behind projectiles fired by dungeon weapons, and the Vigil Candle's reveal of false walls and traps.
* Custom particles share one configurable particle class; counts are budgeted per effect to stay readable.

## 8. Configuration

`config/abyssal_descent.json` (created on first launch, `/abyssal reload` to re-read): difficulty multipliers, budget curve, elite chance, rarity weights per source, depth rarity shift, item damage multiplier, Death's Toll %, relic cap, max party size, and client presentation (camera shake, HUD, particle density, boss music).

## 9. Milestones

1. **M1 – Foundation + Forgotten Halls (floors 1–5)** *(done)*: dimension/generator, run lifecycle, encounters, traps, secrets, treasure, merchant, shrine, extraction/death, Zone 1 enemies, *The Hollow Warden* mini-boss, Zone 1 loot set, HUD.
2. **M2 – Ashen Forge (6–10)**: lava hazards, armored enemies, mini-boss + first major boss (two-stage floor 10).
3. **M3 – Crystal Depths (11–15)**: arcane projectiles, teleporting enemies, crystal hazards.
4. **M4 – Drowned Kingdom (16–20)**: water mechanics, curses, floor-20 two-stage boss.
5. **M5 – Blood Citadel (21–25)**: elite knights, cursed equipment.
6. **M6 – Abyssal Throne (26–30)**: void effects, final two-stage boss, endgame loot.

Floors beyond the last completed milestone are sealed in-game with an explicit message rather than generated with placeholder content.

## 10. Verification

* `./gradlew runSelftest` starts a headless server, generates and validates 200 floor layouts (connectivity, doorways, fixtures, spawn safety) and times chunk generation.
* `./gradlew runClientGameTest` plays through the first zone on a real client: floor arrival, a sealed encounter, a loot fountain, the Hollow Warden through all three phases, its death and rewards, extraction and defeat. It asserts the run rules (secured vs. lost loot, brought gear kept, the durability toll) and saves screenshots along the way.
