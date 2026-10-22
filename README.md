# Ordnance

Realistic explosions, fire and modern weapons for **Minecraft 1.21.11** on **Fabric**.

Ordnance replaces the "grey puff" with layered detonations (flash, fireball, shockwave ring, debris, sparks,
dust and smoke that lingers and drifts with the wind), makes fire spread, smoke and char, and adds a small
arsenal: hand grenades, an RPG-7, a flamethrower, a 40 mm grenade launcher and designator-guided hypersonic
missile strikes. Damage and world changes are computed on the server; clients only render effects.

| | |
|---|---|
| Minecraft | 1.21.11 |
| Fabric Loader | 0.19.2 or newer |
| Fabric API | 0.141.6+1.21.11 or newer |
| Java | 21 |
| Sides | Required on the server **and** on every client (it adds items, blocks, entities and particles) |

## Installing

1. Install [Fabric Loader](https://fabricmc.net/use/) 0.19.2+ for Minecraft 1.21.11.
2. Put [Fabric API](https://modrinth.com/mod/fabric-api) and `ordnance-1.0.0.jar` in `.minecraft/mods`
   (for a server, in the server's `mods` folder; every player needs the mod as well).
3. Start the game. Everything is in the **Ordnance** creative tab, and every item can be crafted (see below).

## Building

You need a JDK 21. The Gradle wrapper downloads Gradle, Minecraft and the mappings on the first run.

```sh
./gradlew build                 # -> build/libs/ordnance-1.0.0.jar (+ -sources.jar); also runs the server game tests
./gradlew build -x runGameTest  # the same without the tests
./gradlew runClient             # development client
./gradlew runServer             # development dedicated server (set eula=true in run/eula.txt first)
```

## Testing

```sh
./gradlew runGameTest           # headless server game tests
./gradlew runClientGameTest     # scripted client walkthrough with screenshots
```

* **`runGameTest`** starts a test server and runs the 14 gameplay tests in
  `src/gametest/java/com/ordnance/test/OrdnanceGameTests.java`: recipes, damage types and the recipe
  advancement load; the magazine logic; frag blasts breaking blocks and hurting mobs once the blast front
  arrives; the HEAT jet punching through walls; thermobaric and incendiary fires; smoke grenades venting; the
  RPG-7 and grenade launcher firing real projectiles from a player; the flame stream igniting wood; burning fuel
  burning out; scorch marks reaching the floor under a roof; and vanilla TNT getting debris and scorch marks.
  The task fails if any test fails.
* **`runClientGameTest`** launches a real client, creates a superflat world, builds a firing range and goes
  through every item (first person, third person, on the ground, in the creative tab), every warhead
  (day, night, underwater), the RPG-7 in first and third person, reloading, the grenade launcher, grenade
  throwing, smoke, the flamethrower, a spreading fire and a missile strike, then repeats the weapons on a
  dedicated server over a real network connection. Timed screenshots are saved to
  `build/run/clientGameTest/screenshots` (about 220; under 10 minutes even with software rendering). Copy them
  elsewhere before running `build` or `runGameTest`, which clear the test run directories. It fails on
  crashes, errors and timeouts. Set `ORDNANCE_TEST_SCENES` to a comma-separated subset of
  `items,explosions,weapons,fire,missile,multiplayer` to run only some scenes. On a machine without a display,
  run it under a virtual one: `xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew runClientGameTest`.

For manual testing, use a creative world and the operator command:

```
/ordnance explode <warhead> [x y z]   # frag_grenade, incendiary_grenade, smoke_grenade, he_40mm,
                                      # incendiary_40mm, smoke_40mm, rpg_heat, rpg_thermobaric, hypersonic_missile
/ordnance strike <x y z>              # call a hypersonic missile strike on a position
/ordnance reload                      # re-read config/ordnance.json without restarting
```

## Weapons

| Item | How to use |
|---|---|
| **Frag Grenade** | Hold *use* to pull the pin and wind up, release to throw (a tap lobs it, ~0.7 s gives a full throw). The fuse (4 s) burns from the moment the pin is pulled, so holding "cooks" the grenade; hold too long and it goes off in your hand. Grenades bounce off walls and floors and spray fragments that are stopped by cover and shatter glass. |
| **Incendiary Grenade** | As above; scatters burning fuel that sticks to surfaces and sets the area alight. |
| **Smoke Grenade** | As above, no cooking; vents a thick, drifting smoke screen for 20 s that blocks vision. |
| **RPG-7** | *Use* fires the loaded rocket; the warhead is visible in the tube while loaded. *Use* with an empty tube (or *sneak + use*) and rockets in the inventory reloads (hold). The rocket motor ignites a few metres out, leaves a smoke trail and accelerates; impacts closer than the arming distance are duds. The **backblast** hurts anything standing right behind you. |
| **PG-7V HEAT Rocket** | Shaped charge: a modest blast plus a jet that punches a channel several blocks deep along the flight path. |
| **TBG-7V Thermobaric Rocket** | Large pressure wave and fireball, wide fires, small crater. |
| **Grenade Launcher** | Six-round revolver. *Use* fires; rounds fly a ballistic arc. Hold *use* on an empty launcher, or *sneak + use*, to reload one round at a time; any mix of 40 mm rounds can be loaded and they fire in the order loaded. **V** (rebindable: *Cycle Fire Mode*) switches between **impact** and **timed** (bouncing, 2.5 s) detonation. |
| **40mm HE / Incendiary / Smoke** | Grenade launcher rounds. |
| **Flamethrower** | Hold *use* for a continuous stream of burning fuel that arcs under gravity, splashes, ignites what it touches and leaves burning puddles. Uses fuel; *sneak + hold use* refuels from **Fuel Canisters** in your inventory. |
| **Strike Designator** | Hold *use* to paint a target (up to 192 blocks) and keep the laser steady until it locks (2 s), then release to call in a **Hypersonic Missile** (consumes one from your inventory, not in creative). Nearby players get a warning; after a countdown the missile streaks in from high altitude with a sonic crack and detonates with a mushroom cloud. 30 s cooldown. |

A compact readout beside the hotbar shows the loaded rounds, fuel, fire mode and reload progress; the
designator draws a lock-on reticle, and incoming strikes show a warning with a countdown.
All weapons work in survival, creative and multiplayer; their numbers are in the config.

### Crafting

| Result | Recipe |
|---|---|
| 2 Explosive Charge | shapeless: TNT, 2 gunpowder, clay ball, iron nugget |
| 3 Frag Grenade | iron nugget over iron ingot / charge / iron ingot, iron ingot below |
| 2 Incendiary Grenade | iron nugget over blaze powder / charge / blaze powder, iron ingot below |
| 3 Smoke Grenade | iron nugget over white dye / gunpowder / white dye, iron ingot below |
| RPG-7 | spyglass (top right) · 3 iron ingots · planks, tripwire hook, planks |
| 2 PG-7V Rocket | charge · iron nugget, iron ingot, iron nugget · gunpowder |
| 2 TBG-7V Rocket | fire charge · iron nugget, charge, iron nugget · iron ingot, gunpowder, iron ingot |
| Grenade Launcher | 3 iron ingots · tripwire hook, dispenser, iron ingot · stick |
| 4 40mm HE / Incendiary / Smoke | charge / blaze powder / white dye over gunpowder over copper ingot |
| Flamethrower | flint and steel (top right) · iron ingot, iron ingot, blaze rod · bucket, tripwire hook |
| 2 Fuel Canister | shapeless: iron ingot, 2 coal or charcoal, blaze powder, slime ball |
| Strike Designator | spyglass · redstone, diamond, redstone · iron ingot, compass, iron ingot |
| Hypersonic Missile | diamond · charge, TNT, charge · iron block, blaze rod, iron block |

All recipes unlock in the recipe book as soon as you pick up gunpowder or an iron ingot.

## Explosions

* **Warhead profiles** from a 40 mm grenade to a missile strike, each with its own power, blast damage,
  radius, knockback, fragments, fire, scorch, crater, debris, penetration and visual scale.
* **Blast wave**: damage and knockback travel outward at a configurable speed and arrive when the shockwave
  ring does; cover between you and the blast reduces damage. Fragments are hit-scanned rays stopped by blocks.
* **Terrain**: vanilla-style ray destruction with drops, bowl-shaped craters for large warheads, scorched earth,
  charred logs and ash, vegetation and snow burned away, fractured stone near the centre, glass shattered by
  fragments. Flying **debris** chunks (real block textures) fly out, bounce, can burn, and settle as rubble.
  Spawn protection and the world border are respected for explosives thrown by players.
* **Effects**: white-hot flash and sky flash, expanding fireball, ground-hugging shockwave ring, dust skirt,
  sparks and glowing embers, smoke columns that rise, spread and drift downwind, block chunks, and for
  missiles a rising mushroom cloud with lingering fires. Each family (frag, incendiary, smoke, HEAT,
  thermobaric, missile, vanilla, underwater) has its own look.
* **Camera**: screen shake scaled by size and distance (arriving with the blast front), a blinding flash for
  nearby detonations, and smoke that obscures your view when you stand in it.
* **Sound**: near/far layers that change with size and distance (sharp crack up close, rolling boom far away),
  delayed by distance at the speed of sound, debris patter, and the missile's incoming scream and sonic boom.
* **Vanilla explosions** (TNT, creepers, beds, crystals...) get the same debris, scorch marks and visuals;
  both can be turned off separately.
* **Performance**: particle counts adapt to distance (far explosions use fewer, larger particles), there is
  a global particle cap, per-explosion block/debris caps, and a global live-debris cap.

## Fire

* Spread speed is configurable; burning logs **char** instead of always vanishing; burnt-out fires leave ash
  and scorched ground; fires throw **embers** that drift downwind and can ignite flammable blocks a few blocks
  away.
* **Burning fuel** puddles (napalm) from incendiaries and the flamethrower burn on any solid surface, spread to
  neighbours and burn out.
* Client effects: flame licks, glowing embers riding the wind, and soft smoke that rises and drifts (replacing
  vanilla's pixel-art fire smoke), plus heat haze above fireballs and the flamethrower stream (a screen-space
  distortion shader).

## Configuration

`config/ordnance.json` is created on first launch, with every option documented in
[`OrdnanceConfig.java`](src/main/java/com/ordnance/config/OrdnanceConfig.java). Apply changes with
`/ordnance reload`. Gameplay sections are read by the server; `visuals` is read by each client, so every player
can tune effects for their own hardware.

| Section | Highlights |
|---|---|
| `general` | `enhanceVanillaExplosions` (server), `overhaulVanillaExplosionVisuals` (client) |
| `explosions` | `terrainDamage`, `blockDamageMultiplier`, `entityDamageMultiplier`, `blastRadiusMultiplier`, `knockbackMultiplier`, `craters`, `scorchMarks`, `createFires`, `fragmentation`, `fragmentsBreakGlass`, `flyingDebris`, `debrisMultiplier`, `maxDebrisPerExplosion`, `maxActiveDebris`, `rubbleChance`, `dropBlocks`, `blastWaveSpeed`, `maxBlocksPerExplosion`, `respectBlockProtection` |
| `fire` | `enhancedFire`, `spreadSpeedMultiplier`, `charredRemains`, `charChance`, `ashChance`, `emberJumps`, `emberJumpChance`, `emberJumpRange`, `burningFuelTicks` |
| `visuals` | `particleMultiplier`, `maxActiveParticles`, `lodDistance`, `screenShake`, `screenFlash`, `skyFlash`, `smokeObstruction`, `heatDistortion`, `heatDistortionStrength`, `realisticSoundDelay`, `lingeringSmokeMultiplier`, `fireEmbers`, `muzzleFlash`, `recoil`, `weaponHud` |
| `weapons` | per weapon: fuse, cooking, throw speed and bounciness; RPG reload, speeds, arming distance, backblast; launcher magazine size, reload, muzzle velocity, timed fuse; flamethrower fuel, damage, range, puddles; missile range, lock time, countdown, speed, cooldown, warnings |
| `warheads` | one entry per warhead (`frag_grenade`, ..., `hypersonic_missile`): `power`, `damage`, `radius`, `knockback`, `fragments`, `fragmentDamage`, `fragmentRange`, `fireChance`, `fireRadius`, `igniteSeconds`, `incendiary`, `scorchRadius`, `craterRadius`, `craterDepth`, `debris`, `penetration`, `smokeTicks`, `visualScale` |

Values are clamped to sane ranges when loaded; a broken file is reported in the log and replaced by defaults
in memory (the file itself is left alone so you can fix it).

## Extending

* **New warhead**: add a constant to [`ExplosionProfile`](src/main/java/com/ordnance/explosion/ExplosionProfile.java)
  with its default numbers and an effect family. It appears in the config and in `/ordnance explode`
  automatically.
* **New ammunition**: register an [`AmmoItem`](src/main/java/com/ordnance/weapon/AmmoItem.java) with an
  existing [`AmmoCategory`](src/main/java/com/ordnance/weapon/AmmoCategory.java) and a profile; every weapon of
  that category loads it.
* **New launcher**: subclass [`MagazineWeaponItem`](src/main/java/com/ordnance/weapon/MagazineWeaponItem.java)
  (magazine, reloading, cooldown, dry fire and HUD come for free) and implement `fire`.
* Projectiles extend [`OrdnanceProjectileEntity`](src/main/java/com/ordnance/entity/OrdnanceProjectileEntity.java)
  and detonate through `OrdnanceExplosion.detonate(...)`, which also sends the effect packet to nearby clients.

## Project layout

```
src/main/java/com/ordnance/      common code: config, explosions, fire, entities, weapons, networking, registries
src/client/java/com/ordnance/    client code: particles, explosion/fire/weapon effects, sounds, HUD, renderers
src/main/resources/              assets (textures, models, sounds, shaders, lang) and data (recipes, tags, ...)
src/gametest/                    server game tests and the client screenshot walkthrough
tools/                           asset generator
```

All textures, 3D item models and sounds are generated procedurally by `python3 tools/generate_assets.py`
(needs Python 3 with numpy and Pillow, and ffmpeg with libvorbis). The generated files are committed, so
building the mod does not need Python.

## Known limitations

* Item models are blocky Minecraft-style 3D models; weapons have no skeletal animations. Firing, reloading and
  throwing are conveyed by poses (shouldered aiming for launchers, a pulled-back wind-up and overhead throwing
  arm for grenades), recoil, muzzle flashes and sounds rather than animated parts.
* All sounds are synthesized placeholders. They are layered and distance-aware, but recorded sounds would be
  more convincing; replace the `.ogg` files under `assets/ordnance/sounds` to upgrade them.
* Heat haze uses four fixed strength steps, because 1.21.11 post-effect uniforms are fixed per shader file.
* Minecraft samples the particle atlas without filtering. Smoke, fireball and shockwave textures are 128-256 px
  and fade out as they reach the camera, but a huge smoke puff seen up close can still show texel edges.
* A launched 40 mm grenade is drawn as the whole cartridge, casing included.
* Smoke blocks vision for players and is drawn as particles; it does not stop mobs from seeing or targeting.
* Fire spread still follows the vanilla `fire_spread_radius_around_player` game rule; fire far away from
  players does not spread.
* Very large explosions (missile strikes with multipliers turned up) change thousands of blocks in one tick
  and can cause a short server hitch; `maxBlocksPerExplosion` limits this.
* Other mods that replace vanilla explosion behaviour may conflict with the vanilla-explosion enhancements;
  turn off `general.enhanceVanillaExplosions` and `general.overhaulVanillaExplosionVisuals` if that happens.
