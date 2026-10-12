# Chaos Unleashed

A world events mod for **Minecraft 1.21.11** (Fabric). Huge, temporary disasters that can trigger at random or be
started by hand: alien invasions, blood moons, a 100-block Kaiju, black holes, solar flares and more. Every event is
announced in advance, shown on a boss bar, and cleans up after itself when it ends or is stopped.

- Mod id: `chaosunleashed`
- Minecraft 1.21.11, Fabric Loader 0.19.2+, Fabric API, Java 21
- Works in singleplayer and on dedicated servers. The mod has to be installed on both sides, because it adds blocks,
  items and entities.

## Events

| Event | Id | What happens | How to end it early |
|---|---|---|---|
| ☄ Alien Invasion | `alien_invasion` | 3–8 UFOs with spinning lights. They abduct animals and villagers with tractor beams and drop Alien Soldiers that fire slow, visible plasma bolts. A UFO you shoot down crashes in flames and leaves a crash site chest with Alien Alloy and sometimes a Plasma Pistol or Anti-Gravity Boots. | Destroy every UFO. Otherwise they fly away when the timer runs out. |
| ☾ Blood Moon | `blood_moon` (alias `zombie_apocalypse`) | Night only. Blood-red moon, sky and fog. About ten times the normal zombie spawns, including Runners, Brutes and Screamers. Zombies break doors and weak blocks such as glass, planks and dirt, with visible crack progress. You can't sleep through it. | Survive until sunrise: zombies burn, and every survivor gets a reward chest at their spawn point. |
| ♜ Kaiju Attack | `kaiju_attack` (alias `kaiju`) | A Kaiju about 100 blocks tall walks across the land and passes near players. Each footstep shakes the screen and leaves a crater. It smashes everything in its path, roars with a knockback wave and sweeps a scorching breath beam. | Hit its four glowing weak points. When it dies it topples over and drops Kaiju Scales, a Kaiju Heart and a lot of XP. Otherwise it walks off. |
| ◉ Black Hole | `black_hole` | A black sphere with an accretion disk. It pulls in entities and rips loose blocks out of the ground, and it keeps growing up to a hard size cap. | Throw a Stabilizer Core into it, or place 4 beacons within 20 blocks. Otherwise it collapses and leaves a crater. |
| ☀ Solar Flare | `solar_flare` | Daytime only. The sky turns orange and the screen shows glare and heat shimmer. Direct sunlight burns players, and every redstone signal is forced to 0, except the Chaos Control Panel's output. Optionally, crops dry out and grass turns to dirt. Signals are restored afterwards. | Timer |
| ⇅ Gravity Flip | `gravity_flip` | During the warning, items hover and bounce. Then entities and loose blocks float upward for about 60 seconds and crash back down, with fall damage. | Timer |
| ◐ Eclipse | `eclipse` | Daytime only. A dark disk slowly covers the sun until only the corona is left. Hostile mobs spawn as if it were night, and Shade Stalkers hunt in the darkness: you can only see their eyes unless they are in shadow. | Timer (3–5 minutes) |
| ✦ Dimension Rift | `dimension_rift` | A glowing crack opens in the sky. The terrain below turns into the Nether or the End, spreading out in a circle, and that dimension's mobs pour out. Players sometimes get Rift Shards and rare Rift Cache loot. | Timer. The converted terrain stays, unless `riftRevertTerrain` is set. |
| ♞ Herd Stampede | `herd_stampede` (alias `stampede`) | Hundreds of cows, horses, pigs, sheep and Bison thunder across the land with dust clouds and rumbling. They trample crops, push through fences and knock players around. | Timer. The herd despawns and leaves some drops behind. |

### Phases

Every event goes through **WARNING → ACTIVE → AFTERMATH → END**.

- **Warning** lasts 10–30 seconds. It plays a unique sound, shows a title and subtitle, and gives visual hints such as
  embers, hovering items or a darkening sky.
- **Active** is the event itself.
- **Aftermath** is a short wind-down: UFOs leave, the herd disperses, zombies burn and so on.
- **End** removes every entity the event spawned. Nothing is left behind, even when the event is stopped early.

A boss bar shows the event name, the phase and the time left, plus event details such as Kaiju HP, herd size or
beacons placed.

## Controlling events

Chat and the Control Panel change the same per-world settings. Both stay in sync and survive restarts.

### Chat: `/chaos`

| Command | Description |
|---|---|
| `/chaos menu` | Clickable menu: `☄ Alien Invasion [ON] [OFF] [START] [STOP]` for each event, plus random events ON/OFF and STOP ALL. |
| `/chaos list` | Shows each event's ON/OFF state, the running event with its phase and time left, and the random events state. Available to everyone. |
| `/chaos toggle <event>` | Turns an event ON or OFF for random triggering. |
| `/chaos enable <event\|all>` / `/chaos disable <event\|all>` | Turns one event, or all of them, ON or OFF. |
| `/chaos start <event> [intensity 1-5] [player]` | Starts an event now, near a player (you by default). This works even if the event is toggled OFF. |
| `/chaos start <event> <intensity> at <x y z>` | Starts an event at a position. |
| `/chaos stop [event]` | Stops all running events, or one event, and cleans up. |
| `/chaos random <on\|off>` | Master switch for random events. |
| `/chaos reload` | Re-reads `config/chaosunleashed.json`. |

- Everything except `list` needs permission level 2 (`commandPermissionLevel`). In singleplayer, the world owner can
  always use the commands.
- Event names tab-complete, and starting an event is announced to every player.

### Chaos Control Panel block

**Crafting:** iron, glass, redstone and a diamond:

```
I G I     I = iron ingot, G = glass, R = redstone
R X R     X = diamond (or a nether star, see controlPanelRecipe)
I R I
```

It is also in the Chaos Unleashed creative tab.

**Using it:**

- **Right-click** opens the control screen. Every event has an icon, a name, an ON/OFF toggle and a **Start Now**
  button that becomes **Stop** while that event runs. The screen also has:
  - an intensity slider (1–5)
  - a master **Random Events** switch
  - a big red **STOP CURRENT EVENT** button
  - a status line with the active event and the time left
- **Sneak + right-click** stops the current event.

**What it shows and outputs:**

- **Screen color:** green when idle, yellow during a warning, red while an event is active.
- **Redstone:** emits a signal of 15 while any event is running. Its comparator output is the running event's number
  (1–9). The panel keeps working during a Solar Flare.

**Permissions:** on servers, only players with command permission can change settings. Everyone else gets a
read-only screen, unless `allowAllPlayersUseControlPanel` is `true`. Every panel action is validated on the server:
permission, distance, and that the panel exists.

## Items

| Item | Source | Use |
|---|---|---|
| Alien Alloy | UFO crash sites | Crafting material. Repairs the boots and pistol. |
| Plasma Pistol | Crash sites, or crafted from alloy, a redstone block and glowstone | Fires plasma bolts that set targets on fire. |
| Anti-Gravity Boots | Crash sites, or crafted from alloy and a feather | Lower gravity, higher jumps, less fall damage. |
| Kaiju Scale | Kaiju | Armor material for the Kaiju Scale armor set (tough, fireproof). |
| Kaiju Heart | Kaiju | Eat it for Strength II, Resistance II, Regeneration, Fire Resistance and Absorption. |
| Stabilizer Core | Crafted from iron, redstone and an ender pearl, amethyst shard, echo shard or diamond (makes 2) | Throw it into a Black Hole to shut it down. |
| Rift Shard | Mobs from the rift, rift caches | Short-range blink in the direction you're looking (consumed). |

## Configuration

The config file is `config/chaosunleashed.json`. It is created on first launch and rewritten with any missing
options. Reload it with `/chaos reload`.

The ON/OFF toggles in the file are only **defaults for new worlds**. After a world is created, its toggles are stored
in the world save and changed with `/chaos` or the panel.

| Option | Default | Meaning |
|---|---|---|
| `randomEventsEnabledByDefault` | `true` | Master random switch for new worlds. |
| `randomCheckIntervalSeconds` | `30` | How often the scheduler rolls for a random event. |
| `minCooldownSeconds` | `900` | Minimum time between the end of one event and the next random event. |
| `minWorldDay` | `1` | Random events only happen once the world reaches this day. |
| `frequencyMultiplier` | `1.0` | Multiplies every event's chance. |
| `maxConcurrentEvents` | `1` | How many events can run at once. Manual starts beyond this are refused. |
| `randomIntensityMin` / `randomIntensityMax` | `1` / `4` | Intensity range for random events. |
| `blockDamage` | `true` | Master switch for all terrain changes: craters, rift conversion, Kaiju path, door breaking, scorching. |
| `maxRadius` | `64` | Hard limit on how far from its origin an event may affect the world. |
| `maxBlockChangesPerTick` | `48` | Block changes are queued and spread across ticks, up to this budget per tick. |
| `maxEntitiesPerEvent` | `150` | Cap on the entities alive per event. |
| `commandPermissionLevel` | `2` | Permission level needed for `/chaos` commands and the panel. |
| `allowAllPlayersUseControlPanel` | `false` | Let every player change settings through the panel. |
| `controlPanelRecipe` | `"diamond"` | `"diamond"`, `"nether_star"` or `"disabled"`. |
| `timeOfDayHandling` | `"skip"` | Day-only or night-only events started at the wrong time: `"skip"` fast-forwards time during the warning, `"wait"` holds the warning until the right time. |
| `solarFlareScorchesTerrain` | `true` | Crops dry out and grass turns to dirt. Also needs `blockDamage`. |
| `solarFlareDisablesRedstone` | `true` | Redstone is forced to 0 during a flare. |
| `riftRevertTerrain` | `false` | Converted rift terrain changes back when the rift closes. |
| `blackHoleMaxCoreRadius` | `5.0` | Hard cap on the Black Hole's size. The pull radius is about 6× this. |
| `blackHoleGrowthIntervalSeconds` | `12` | Seconds between growth steps. |
| `blackHoleBeaconsRequired` | `4` | Beacons within 20 blocks needed to stabilize a Black Hole. |
| `stampedeMaxAnimals` | `200` | Hard cap on herd size. |
| `bloodMoonZombiesPerWave` | `4` | Zombies per player per wave at intensity 3. |
| `kaijuHealth` | `1024` | Kaiju health at intensity 5. Lower intensities scale it down. |
| `events.<id>.enabledByDefault` | `true` | Whether the event is ON in new worlds. |
| `events.<id>.chance` | varies | Chance per random check. |
| `events.<id>.warningSeconds` | 15–25 | Warning length, clamped to 10–30. |
| `events.<id>.durationSeconds` | varies | Active phase length. |
| `events.<id>.aftermathSeconds` | varies | Aftermath length. |
| `events.<id>.defaultIntensity` | `3` | Intensity used when none is given. |

Blocks in the `#chaosunleashed:event_immune` block tag are never changed by any event. Block entities (chests and so
on), unbreakable blocks and the Control Panel are always protected. Other block tags control what zombies can break
(`zombie_breakable`), what floats during a Gravity Flip (`loose_blocks`) and what the herd tramples
(`stampede_tramples`).

## Placeholders

The art and audio are **placeholders**, built so they can be swapped one file at a time:

- **Sounds:** every `chaosunleashed:*` sound event in `assets/chaosunleashed/sounds.json` points to a vanilla sound,
  marked `PLACEHOLDER`. Put an `.ogg` in `assets/chaosunleashed/sounds/` and point the entry at it.
  `tools/check_placeholder_sounds.py` checks that every referenced vanilla sound exists.
- **Textures:** all block, item, entity, particle, armor and sky textures are generated by
  `tools/generate_placeholder_textures.py`. Replace the PNGs directly; the script is only needed to regenerate them.
- **Models:** the UFO, Alien Soldier, Bison and Kaiju use simple box models in `src/client/java/com/chaosunleashed/client/model`. The
  Shade Stalker reuses the Enderman model with its own textures.
- The Bison uses cow sounds.

## Building

```
./gradlew build
```

The mod jar is written to `build/libs/chaosunleashed-<version>.jar`. Put it in `mods/` together with Fabric API.

Dev runs: `./gradlew runClient` and `./gradlew runServer`.

### Development test harness

`client/dev/AutoTest` is a scripted client used for visual testing. It is inactive unless the JVM property
`chaosunleashed.autotest` points to a script.

```
./gradlew runAutotestClient -PautotestScript=/path/script.txt -PautotestWorld=MyWorld
./gradlew runAutotestClient -PautotestScript=/path/script.txt -PautotestServer=localhost:25565
```

Script steps, one per line:

- `wait <ticks>`, `waitidle`, `waitphase <WARNING|ACTIVE|AFTERMATH>`
- `cmd <command>`, `screenshot <name>`
- `use <x y z>`, `sneak on|off`, `click <button text>`
- `chat`, `close`, `quit`

## Project layout

```
src/main/java/com/chaosunleashed/
  core/        event manager, phases, config, world data, block change queue, permissions, sky/fog environment hooks
  command/     /chaos command and clickable menu
  block/       Chaos Control Panel block and block entity
  network/     status sync, panel actions, screen shake
  events/<x>/  one package per event (event logic and its entities)
  item/        Plasma Pistol, Stabilizer Core, Rift Shard, Kaiju Heart
  registry/    blocks, items, entities, sounds, particles, tags, damage types, armor materials
  mixin/       environment attribute hook, redstone suppression, chat menu click handler
src/client/java/com/chaosunleashed/client/
  screen/      Control Panel GUI
  model/       placeholder entity models (UFO, Alien Soldier, Bison, Kaiju)
  render/      entity renderers, eclipse sky renderer, HUD overlays
  particle/    custom particles
  effect/      screen shake
```
