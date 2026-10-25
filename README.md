# Godforge Arsenal

Ten god-tier weapons for **Minecraft Java Edition 1.21.11** on **Fabric**. Every weapon has its own 3D model,
animated textures, sounds and visual effects (camera shake, flashes, screen distortion, custom particles),
charge mechanics, cooldowns and adjustable settings, and actually reshapes the world: cut terrain slides
apart, craters are carved, land floats away, and debris flies.

Weapon logic runs on the server. Every block change goes through a time-sliced destruction engine with a
budget per tick, so even the biggest abilities don't freeze a server.

| | |
|---|---|
| Minecraft | 1.21.11 (Java Edition) |
| Mod loader | Fabric Loader 0.19.2 or newer |
| Required mod | [Fabric API](https://modrinth.com/mod/fabric-api) for 1.21.11 (built against 0.141.6+1.21.11) |
| Java | 21 or newer |
| Side | Install on **both** the client and the server (singleplayer just needs the client) |

---

## Installation

1. Install [Fabric Loader](https://fabricmc.net/use/installer/) for Minecraft 1.21.11 (0.19.2+).
2. Put the Fabric API jar for 1.21.11 in your `mods` folder.
3. Put `godforge-arsenal-1.0.0.jar` (see [Building](#building-from-source)) in the same `mods` folder.
4. Start the game with the Fabric profile. On a server, put both jars in the server's `mods` folder and
   give every player the same mod jar.

---

## The weapons

Every weapon has a normal mode and an **ultimate** mode (gold ★ in the HUD). Ultimates have their own
long cooldown and can be restricted to certain permission levels.

| Weapon | Modes | What it does |
|---|---|---|
| **The Worldcutter**<br>*Reality-Splitting Blade* | Rift Slash · **Sever Reality** | A heavy sword (31 melee damage plus a rift bonus). *Rift Slash* throws a crescent of severed space that cuts through creatures and terrain. *Sever Reality* (hold 2 s) splits the world along a line up to 256 blocks long and 96 deep. The two halves of the land are **pushed apart**, opening a clean chasm; blocks and block entities move with the terrain. |
| **The Laser Beam**<br>*Annihilation Cannon* | Annihilation Beam · **Overload** | A continuous beam that fires while you hold use. It is tunable: **power** (1–2 burn and set fires, 3–6 melt and leave glassy or molten walls, 7–9 vaporize, 10 detonates the impact point), **width**, **range** (up to 512), **intensity** and **colour** (10 colours plus rainbow). *Overload* fires a 5-second triple-strength beam that explodes along its path. |
| **The Orb Eraser**<br>*Rainbow Singularity* | Eraser Orb · **Prismatic Annihilation** | Hold to grow a rainbow orb, then release it. It travels up to **2,000 blocks per second** and erases everything in its radius, ending in a prismatic nova. The ultimate makes a far larger orb with a bigger nova. |
| **The Asteroid Gun**<br>*Planetfall* | Summon Asteroid · **Planetfall** | **Tap** use to mark a target up to 384 blocks away (a beacon-like marker appears). **Hold** to charge, then release: an asteroid sized by your charge falls from the sky, with incoming warnings, a fireball trail, a crater, shockwaves and flying debris. *Planetfall* drops a planet-killer preceded by a fragment swarm. |
| **The Black Hole**<br>*Event Horizon* | Singularity · **Event Horizon** | Launches a singularity that pulls in creatures, items and **blocks**. It grows as it feeds, then collapses in a burst that throws everything outward. *Event Horizon* creates a supermassive one that anchors in place. |
| **The Reality Breaker**<br>*Dimensional Collapse* | Fracture · **Dimensional Collapse** | A crystal warhammer. *Fracture* shatters the ground into **floating chunks of terrain** that hover and then crash back down. It scars the land with dimensional bleed and tears glowing **rifts** that damage anything near them. *Dimensional Collapse* sends a branching chain reaction of fractures racing across the landscape. |
| **The Starfall Bow**<br>*Celestial Judgment* | Star Shot · Meteor Shower · **Celestial Judgment** | Draw to loose miniature stars. *Meteor Shower* calls a rain of meteors around the point you aim at. *Celestial Judgment* brings a gigantic star down onto the land. |
| **The Godfist**<br>*Fist of Absolute Destruction* | Kinetic Shockwave · **Worldbreaker** | Melee hits **launch enemies across the horizon**, and they crater the ground where they land. Punching a block makes it burst into rubble. A charged punch projects a giant kinetic fist and a shockwave. *Worldbreaker* is a ground slam: a crater, rolling **terrain waves** that lift and drop the land, and glowing **fissures** that heal over time. |
| **The Sunforge**<br>*Portable Star* | Solar Bolt · Orbiting Suns · Stellar Core · **Artificial Sun** | Fires solar bolts. Summons up to 6 suns that orbit you, defend you and can be hurled as homing novas. Hold to forge an unstable **stellar core** in your hand that grows until you release it. The ultimate ignites an **artificial sun** overhead that scorches the land and ends in an apocalyptic eruption. |
| **The Planet Cracker**<br>*World-Ender* | Cracker Shell · **Orbital Bombardment** | A siege cannon. Its shells crack the ground, send concentric shockwaves rolling outward and throw debris. *Orbital Bombardment* calls down a sustained barrage of orbital strikes over a wide area. |

### Controls

| Key | Action |
|---|---|
| **Use** (right mouse) | Fire. Most modes charge while held and fire on release; the Laser fires continuously. |
| **R** | Cycle the weapon's mode. Hold **Sneak** to cycle backwards. |
| **G** | Open the weapon's configuration screen. |
| **Attack** (left mouse) | Melee hit with the Worldcutter, Reality Breaker and Godfist. The Godfist also blows apart blocks. |

Both keys can be rebound under *Options → Controls → Godforge Arsenal*. While you hold a weapon, the HUD shows
the current mode, the ultimate cooldown and a charge meter under the crosshair.

### Adjustable settings

Press **G** while holding a weapon to tune it. Settings are stored on the item, and the server validates
every value. Server-side caps (see below) always win over the sliders.

| Weapon | Settings |
|---|---|
| Worldcutter | Cut length (24–256), chasm width (4–24), cut depth (8–96) |
| Laser Beam | Power (1–10), beam width (1–6), range (16–512), intensity, colour |
| Orb Eraser | Max orb size, orb speed |
| Asteroid Gun | Asteroid size |
| Black Hole | Gravity, lifetime |
| Reality Breaker | Fracture size, rifts (0–4) |
| Starfall Bow | Shower density, star size |
| Godfist | Launch power, shockwave size |
| Sunforge | Orbiting suns (1–6), sun size |
| Planet Cracker | Crater size, barrage density |

Every weapon also has a **Protect Terrain** toggle: the weapon still hurts creatures but never changes
blocks. The same screen has your personal visual settings: screen-shake strength, flashes, particle amount,
distortion on/off, and HUD on/off.

---

## Crafting

All ten weapons are survival-craftable and appear in the **Godforge Arsenal** creative tab. Each weapon
needs a **Divine Core**:

```
Divine Core                     E = Echo Shard        D = Block of Diamond
  E D E                         N = Netherite Ingot   S = Nether Star
  N S N
  E D E
```

| Weapon | Pattern | Key (C = Divine Core) |
|---|---|---|
| Worldcutter | ` E ` / `XSX` / ` C ` | E echo shard, X end crystal, S netherite sword |
| Laser Beam | `RTR` / `LCL` / ` N ` | R redstone block, T tinted glass, L lightning rod, N netherite ingot |
| Orb Eraser | `PAP` / `ACA` / ` B ` | P prismarine crystals, A amethyst block, B end rod |
| Asteroid Gun | `MOM` / `FCF` / ` N ` | M magma block, O obsidian, F fire charge, N netherite ingot |
| Black Hole | `YEY` / `ECE` / ` H ` | Y crying obsidian, E eye of ender, H heavy core |
| Reality Breaker | `SAS` / `ECE` / ` M ` | S echo shard, A amethyst block, E ender pearl, M mace |
| Starfall Bow | `FGF` / `GCG` / `FBF` | F firework star, G glowstone, B bow |
| Godfist | `GNG` / `NCN` / `GPG` | G gold block, N netherite ingot, P piston |
| Sunforge | `GBG` / `LCL` / ` R ` | G gold block, B beacon, L magma cream, R blaze rod |
| Planet Cracker | `ITI` / `OCO` / `NDN` | I iron block, T TNT, O obsidian, N netherite ingot, D dispenser |

The recipes unlock in the recipe book when you pick up a Nether Star (Divine Core) or a Divine Core
(the weapons).

---

## Commands

All sub-commands except `info` need the admin permission level from the config (default 2, i.e. operators).

| Command | Effect |
|---|---|
| `/godforge info` | Active destruction jobs, block changes last tick, debris and singularity counts. |
| `/godforge give <players> <weapon\|all\|divine_core>` | Give weapons. |
| `/godforge resetcooldowns [players]` | Clear weapon and ultimate cooldowns. |
| `/godforge destruction <true\|false>` | Turn terrain destruction on or off server-wide (creatures are still damaged). |
| `/godforge stop` | Emergency stop: halts every destruction job and removes every weapon effect in the world. |
| `/godforge reload` | Reload `config/godforge.json`. |
| `/godforge selftest [weapon]` | Fire every mode of every weapon (or of one weapon) at separate test sites near you, and log the results and the slowest server tick for each. Useful for checking a server's performance. It keeps an empty server from auto-pausing while it runs. |

---

## Server configuration

`config/godforge.json` is created on first start. Every value is clamped to a safe range when loaded, so a
mistyped number can't take the server down. Apply changes with `/godforge reload`.

**`general`**

| Key | Default | Meaning |
|---|---|---|
| `terrainDestruction` | `true` | Master switch for every block-changing effect. |
| `respectSpawnProtection` | `true` | No destruction inside spawn protection or outside the world border. |
| `followMobGriefingRule` | `false` | When `true`, terrain destruction obeys the `mob_griefing` game rule. |
| `destroyBlockEntities` | `true` | When `false`, chests, furnaces and other blocks with data are never touched. |
| `startFires` | `true` | Whether abilities may start fires. |
| `debrisPlacesBlocks` | `true` | Flying debris lands as blocks (`false`: it shatters into particles). |
| `damageOwner` | `false` | Whether wielders can hurt themselves. |
| `creativeBypassCooldowns` | `true` | Creative-mode players ignore cooldowns. |
| `destructionScale` / `damageScale` / `playerDamageScale` | `1.0` | Global multipliers. PvP damage also follows the `pvp` game rule. |

**`performance`**

| Key | Default | Meaning |
|---|---|---|
| `maxBlockChangesPerTick` | `12000` | Block changes applied per tick across all effects. |
| `maxMillisPerTick` | `16` | Time budget per tick for block changes, in milliseconds. |
| `maxActiveJobs` | `96` | Concurrent destruction jobs. Extra requests are rejected. |
| `maxBlocksPerJob` | `2500000` | Shapes larger than this are clipped. |
| `maxDebrisEntities` / `maxDebrisPerEvent` | `280` / `60` | Flying debris limits. |
| `maxFractureChunks` | `160` | Floating terrain chunks (Reality Breaker). |
| `maxSingularities` / `maxArtificialSuns` / `maxOrbitalBarrages` | `4` / `2` / `3` | Concurrent cataclysms per server. |
| `effectRange` | `320` | Players within this radius receive visual and sound effects. |

**`permissions`**: `useLevel` (default 0 = everyone), `ultimateLevel` (default 0), `adminLevel` (default 2),
plus `enabled`, a per-weapon on/off switch (for example `"black_hole": false`).

**`weapons.<id>`**: per-weapon `damage`, `cooldownTicks`, `ultimateCooldownTicks`, `sizeScale`, and
`extra`, a set of server caps and sizes such as `cutLength`, `maxRange`, `maxCraterRadius`, `pullRadius` or
`barrageStrikes`. A cap can be raised to at most four times its default.

### Multiplayer and safety

- **Server-authoritative.** Clients only send requests: "use", "cycle mode" and "apply these settings".
  The server re-checks permissions, cooldowns and limits, then runs every effect itself. Settings sent from
  a client are clamped before they are stored.
- **Protected blocks.** Bedrock, end portal frames, spawners, vaults and anything in
  `#minecraft:wither_immune` or `#godforge:indestructible` are never destroyed. Add your own blocks to
  `data/godforge/tags/block/indestructible.json` with a datapack.
- **No chunk loading.** Effects never load or generate chunks. They only touch chunks that are already loaded.
- **Time-sliced.** Large shapes are computed off-thread and applied a few thousand blocks at a time.
  Light updates and neighbour updates are batched. `/godforge info` shows the live load.

### Client settings

`config/godforge-client.json` holds your personal visual preferences: `screenShake`, `flashes`,
`particles`, `distortion` and `hud`. Edit them from any weapon's **G** screen.

---

## Building from source

You need JDK 21. Nothing else needs to be installed; the Gradle wrapper downloads Gradle, Minecraft and
the dependencies.

```bash
./gradlew build
```

The mod jar is `build/libs/godforge-arsenal-1.0.0.jar`; the `-sources` jar next to it is optional.

Development tasks:

```bash
./gradlew runClient           # play in a development client
./gradlew runServer           # development dedicated server (accept the EULA in run/eula.txt)
./gradlew runClientGameTest   # automated in-game test, see below
```

### Automated in-game test

`src/gametest` has a client game test. It starts a real client, builds a deep superflat world, renders every
weapon model in first and third person and opens the configuration screen. Then it fires all 23 modes with
real key input, with target dummies, and films each one from a side camera. Finally it joins a real dedicated
server and drives the settings, mode and firing packets over the network. Screenshots are saved to
`build/run/clientGameTest/screenshots`. The test fails if an ability doesn't reshape the terrain, if the
multiplayer connection breaks, or if anything throws. Without a display, run it under Xvfb (software
rendering is fine):

```bash
xvfb-run -a -s "-screen 0 1920x1080x24" ./gradlew runClientGameTest
./gradlew runClientGameTest -PshowcaseOnly   # just the item models and the config screen (about a minute)
```

### Regenerating assets

The textures, models, sounds, language file and data files are all generated by the Python scripts in
`tools/` (Python 3 with `numpy` and `Pillow`; the sound generator also needs `ffmpeg` with libvorbis).
The generated files are committed, so you only need to run the scripts after changing them:

```bash
python3 tools/gen_icons.py         # 32×32 animated inventory icons
python3 tools/gen_fx_textures.py   # effect, particle, entity and block textures
python3 tools/gen_models.py        # 3D item models and item model definitions
python3 tools/gen_sounds.py        # synthesized sound effects + sounds.json
python3 tools/gen_data.py          # damage types, tags, recipes, advancements, particles
python3 tools/gen_lang.py          # en_us.json
```

---

## Project layout

```
src/main/java/com/godforge/
  Godforge.java            entrypoint (common)
  config/                  server configuration
  weapon/                  weapon types, modes, settings, base item, access rules
  weapon/items/            the ten weapons
  entity/                  projectiles, singularities, suns, rifts, debris, floating chunks …
  destruction/             time-sliced destruction engine (craters, paths, cuts, waves …)
  network/                 effect / cooldown / settings packets
  registry/                items, entities, sounds, particles, blocks, damage types, creative tab
  command/                 /godforge and the self-test
src/client/java/com/godforge/client/
  render/                  entity renderers, render pipelines, effect geometry
  fx/                      screen shake, flashes, distortion, world effects
  particle/, hud/, screen/, input/, sound/
src/gametest/              automated client game test (not shipped)
tools/                     asset generators
```

## License

MIT. See [LICENSE](LICENSE).
