# RealWeather — ultra-realistic weather for Minecraft 1.21.11 (Fabric)

RealWeather replaces Minecraft's on/off rain with a continuously simulated atmosphere: clouds that build up
before it rains and break apart afterwards, wind with gusts that pushes rain, snow, leaves and clouds, branching
lightning followed by thunder that arrives late from far away, blizzards that white out the world and leave real snow
layers behind, fog banks, wet glistening ground and grass that bends in the wind.

| | |
|---|---|
| Minecraft | **1.21.11** (Java Edition) |
| Mod loader | **Fabric Loader 0.19.2** (works with 0.18.0 or newer) |
| Required | **Fabric API** 0.141.x+1.21.11 |
| Java | 21 |
| Side | Both. Works client-only on vanilla servers, and server-only for vanilla clients (see [Multiplayer](#multiplayer)). |

## Features

### Dynamic weather simulation (server)
* Seven weather regimes — **clear, overcast, fog, rain, thunderstorm, snow, blizzard** — chosen by a weighted
  transition model (overcast skies tend to turn into rain, storms decay into rain, fog forms around dawn, …).
* Nothing switches instantly: cloud cover, precipitation, storm strength, fog, temperature and wind all blend
  smoothly. Precipitation only starts once the clouds have built up and stops before they break apart.
* Every weather event gets its own **intensity** (drizzle ↔ downpour, flurries ↔ heavy snow).
* **Biome, temperature and altitude**: rain, sleet or snow depend on the real (height-adjusted) biome temperature;
  wetter biomes get heavier precipitation; arid biomes stay dry; wind is stronger at altitude and weaker in valleys.
* **Moving rain bands**: precipitation intensity follows the thickest parts of the drifting cloud field, which is a
  deterministic noise field shared by the server, every client and the GPU — clouds, rain bands and cloud shadows
  always line up and move with the wind.
* **Cold snaps** (`/weather snow`, `/weather blizzard`, or rarely on their own) lower temperatures so temperate biomes
  turn snowy, warm biomes get cold rain and deserts stay dry. Vanilla gameplay agrees (no rain damage to endermen,
  no lightning, powder snow in cauldrons where it snows).
* **Wind**: prevailing direction that slowly meanders and veers with passing fronts, plus deterministic gusts
  (identical for every player) with direction wobble.
* **Snow accumulation**: snow layers build up progressively (faster in blizzards), bury short grass and ferns (never
  flowers or crops), settle evenly, drift into hollows and against walls, and **melt** again once a cold snap passes
  in a biome that is normally too warm for snow — after which some of the grass sprouts again. Optional freezing of
  still water during cold snaps.
* **Lightning**: vanilla strikes still happen; intense storms add a few extra strikes near players, and the server
  directs synchronized distant bolts and in-cloud flashes so all players see the same storm.
* Vanilla integration: the vanilla `raining`/`thundering` state is kept in sync (crops, mobs, fishing, tridents,
  vanilla clients). `/weather`, sleeping through a storm and other mods changing the weather are picked up and
  blended into. The `advance_weather` game rule is respected.
* State is saved with the world (`data/realweather.dat`).

### Visuals & audio (client)
* **Rain**: high-resolution motion-blurred streaks in two parallax layers with independent fall speeds, light and
  heavy textures that cross-fade with intensity, sparser columns in drizzle, wind tilt derived from the real fall
  speed, per-column variation (no repeating patterns), a hard stop at the cloud base, and distant **rain curtains**.
* **Rain splashes** (crown sprite sequence + thrown droplets), **ripples** on water, ground **spray** in downpours,
  steam over lava/magma/campfires.
* **Snow**: flake sheets plus individual **snowflake particles** of varied size that flutter, spin, follow gusts,
  settle and melt; **spindrift** sweeping over the ground in blizzards; a rain/snow **sleet** mix near freezing.
* **Volumetric clouds**: ray-marched, lit by the sun or moon (with silver linings and dark bases), fair-weather
  cumulus, flat overcast decks, towering dark thunderstorm clouds with low bases, wind-driven movement, slowly
  evolving shapes, aerial perspective, and internal lightning illumination. Flying into a cloud fogs your view.
* **Cloud shadows** that drift across the landscape.
* **Lightning**: tall, forked bolts with sub-branches, a white-hot core and blue glow, several flickering return
  strokes, visible from far away; flashes light up the sky, the clouds, the rain and the world.
* **Thunder** arrives after the flash with the delay of sound (343 m/s) and changes from a tearing crack nearby to a
  rolling rumble far away; in-cloud discharges only rumble.
* **Fog & atmosphere**: visibility drops in heavy rain, much more in fog banks and blizzards (white-outs); fog
  colour follows the weather (cool grey rain haze, milky snow fog); overcast skies grey out, the sun, moon and stars
  dim, storms darken the light. Weather fog stays outside — caves are unaffected.
* **Wind**: grass, flowers, ferns and saplings sway in gust waves rolling across the land (top vertices only, so
  plants stay rooted); leaves are torn off trees in strong wind; dust blows across deserts.
* **Wet surfaces**: rain-exposed blocks darken, gain saturation and pick up a sky sheen at grazing angles, then dry
  out over time.
* **Soundscape** (synthesized, seamless loops): light rain, heavy rain, muffled rain drumming on the roof when you
  are indoors, breeze, strong wind with whistling gusts, blizzard howl, near/far/distant thunder — all cross-faded by
  intensity, wind speed, gusts and how sheltered you are.

## Commands

All server commands extend vanilla's `/weather` and need operator permission (level 2). Vanilla syntax
(`/weather rain 6000`, `/weather clear 1d`) keeps working. Everything has tab completion.

| Command | Effect |
|---|---|
| `/weather` or `/weather status` | Current weather, values, wind and the local precipitation zone |
| `/weather clear [duration] [intensity]` | Clear sky (intensity = amount of fair-weather clouds) |
| `/weather overcast [duration] [intensity]` | Grey, overcast sky without precipitation |
| `/weather fog [duration] [intensity]` | Fog bank |
| `/weather rain [duration] [intensity]` | Rain (snow in cold biomes and high mountains) |
| `/weather thunder [duration] [intensity]` | Thunderstorm |
| `/weather snow [duration] [intensity]` | Snowfall with a cold snap |
| `/weather blizzard [duration] [intensity]` | Blizzard: heavy snow, gale-force wind, white-out |
| `/weather wind <speed> [direction]` | Wind in m/s (0–120, capped by config), direction it blows **from**: `n`, `ne`, … or degrees |
| `/weather wind auto` | Natural wind again |
| `/weather wind` | Show current wind |
| `/weather intensity <0..1>` | Intensity of the current weather (`auto` for natural) |
| `/weather duration <seconds>` | How long the current weather lasts |
| `/weather dynamic <true\|false>` | Let the weather change on its own, or lock it |
| `/weather reset` | Clear all overrides and resume natural dynamic weather |

`duration` uses vanilla's time format: `600` (ticks), `30s`, `1d`.

Client-side command (works on any server) for the visual/audio settings:

| Command | Effect |
|---|---|
| `/realweather config` | Open the settings screen |
| `/realweather quality <low\|medium\|high\|ultra>` | Quality preset |
| `/realweather set <option> <value>` / `get <option>` | Change/read any client option (tab-completes) |
| `/realweather debug` | Toggle an on-screen readout of the local weather |
| `/realweather info` / `reload` | Status / reload `realweather-client.json` |

## Configuration

Both files are created on first launch in `.minecraft/config/` (or the server's `config/`). Unknown or invalid
values are corrected automatically; a broken file is backed up as `*.broken`.

**`realweather-common.json`** (server/world simulation): `dynamicWeather`, `transitionSpeed`,
`commandTransitionSpeed`, `durationMultiplier`, per-type `durations` (seconds `[min, max]`) and `weights`,
`dynamicColdSnaps`, `coldSnapStrength`, `intensityMultiplier`, `windMultiplier`, `maxWindSpeed`,
`snowAccumulation`, `maxSnowLayers`, `maxBlizzardSnowLayers`, `snowAccumulationRate`, `snowCoversPlants`, `snowMelting`,
`snowMeltRate`,
`freezeWaterInColdSnaps`, `accumulationRadius`, `extraLightning`, `distantLightning`, `lightningFrequency`,
`syncIntervalTicks`. Vanilla's `max_snow_accumulation_height` game rule set to 0 also disables accumulation.

**`realweather-client.json`** (per player, also editable in `/realweather config`): `quality`, precipitation
(`customPrecipitation`, `precipitationRadius`, `precipitationDensity`, `rainCurtains`), particles (`particleDensity`,
`splashes`, `ripples`, `snowflakes`, `windDebris`), sky (`volumetricClouds`, `cloudSteps`, `cloudShadows`,
`weatherFog`, `fogStrength`, `skyEffects`), lightning (`customLightning`, `flashBrightness`,
`realisticThunderDelay`), terrain (`foliageSway`, `swayStrength`, `wetSurfaces`, `wetnessStrength`), audio
(`ambientSounds`, `rainVolume`, `windVolume`, `thunderVolume`, `replaceVanillaRainSounds`), `debugOverlay`.

### Performance
* The quality preset scales the precipitation radius, particle counts, cloud ray-march steps and light samples.
  `low` is suitable for integrated graphics; `ultra` is for strong GPUs.
* The vanilla **Particles** setting (All/Decreased/Minimal) and **Clouds** setting (Fancy/Fast/Off) are respected:
  *Fast* halves cloud samples, *Off* disables clouds.
* Volumetric clouds are the most expensive effect. If your GPU struggles, lower `quality`, reduce the cloud
  distance in video settings, or set `volumetricClouds` to `false` (vanilla clouds return).
* Server cost is constant per player (a few heightmap samples per tick for snow), independent of view distance.

## Installation

1. Install [Fabric Loader](https://fabricmc.net/use/installer/) **0.19.2** for Minecraft **1.21.11**.
2. Put **Fabric API** (`fabric-api-0.141.x+1.21.11.jar`) and **`realweather-1.0.0.jar`** into `.minecraft/mods`.
3. Start the game with the Fabric profile. For servers, put both jars into the server's `mods` folder; clients
   should install the mod too for the full visuals (see below).

The built-in resource pack **"RealWeather: swaying plants, wet surfaces & cloud shadows"** is enabled by default;
disable it in *Options → Resource Packs* if it conflicts with another pack that replaces the terrain shader.

## Building from source

Requirements: JDK 21 (the game's runtime). Gradle is provided by the wrapper; internet access is needed on the first
build to download Minecraft, Fabric and the Gradle distribution.

```sh
./gradlew build
```

The mod jar is written to `build/libs/realweather-1.0.0.jar` (the `-sources` jar is optional).
Other useful tasks:

| Task | Purpose |
|---|---|
| `./gradlew runClient` | Start a development client with the mod |
| `./gradlew runServer` | Start a development dedicated server |
| `./gradlew runClientGameTest` | Automated in-game test (needs an OpenGL display) |
| `./gradlew runDemo -Prealweather.demo.pos="x z yaw pitch"` | Scripted tour through every weather type with screenshots (needs a world named `demo` in `build/run/demo/saves`) |

Assets are generated by scripts in [`tools/`](tools) (numpy + Pillow, and ffmpeg with libvorbis for audio); the
generated files are committed, so you only need these when changing them:

```sh
python3 tools/generate_textures.py
python3 tools/generate_sounds.py
```

## Multiplayer

* **Server and clients with the mod**: full experience; all weather (including wind, gusts, cloud positions and
  lightning) is synchronized, so every player sees the same sky.
* **Server with the mod, vanilla clients**: vanilla clients see vanilla rain/snow/thunder following the simulation;
  all commands work.
* **Client with the mod on a vanilla server**: visuals and sounds work, driven by the vanilla rain and thunder
  levels (cloud cover, wind and gusts are then generated locally).

RealWeather registers no blocks, items, particle types or sound events in the game registries, so it never causes
registry mismatches when mixing modded and unmodded clients and servers.

## Compatibility notes

* **Sodium / Iris**: Sodium replaces the terrain renderer, so swaying plants, wet surfaces and cloud shadows (which
  live in the terrain shader) are not visible with it; everything else works. Iris shader packs replace weather,
  clouds and sky rendering with their own.
* Mods that replace the vanilla cloud or weather renderers will take precedence over the corresponding effect.
* Lightning bolts are rendered by a replacement renderer for the vanilla entity; set `customLightning` to `false`
  to get vanilla bolts back.

## Technical overview

```
src/main/java/com/realweather          (common: runs on the server and in singleplayer)
├── weather/WeatherSimulator           regime selection, smoothing, wind, cloud drift, vanilla sync
├── weather/WeatherState/Type          simulation state (persisted via WeatherSavedData)
├── weather/CloudNoise, Climate        shared deterministic cloud field, temperature/precipitation queries
├── world/SnowAccumulation             snow layering, drifting, melting, freezing
├── world/LightningDirector            extra strikes and synchronized visual lightning
├── network/*                          S2C payloads (weather snapshots, lightning events)
├── command/WeatherCommands            /weather extensions (merged into vanilla's command tree)
└── mixin/                             vanilla /weather & sleep hooks, cold-snap aware precipitation
src/client/java/com/realweather/client
├── weather/ClientWeather, CloudLayer  interpolated state, vanilla-server fallback, exposure, wetness, flashes
├── render/                            precipitation, volumetric clouds, lightning, fog/sky, Globals extension
├── particle/                          splashes, droplets, ripples, snowflakes, leaves, mist
├── sound/WeatherSounds                ambience mixer and distance-delayed thunder
└── mixin/                             rendering hooks (weather pass, clouds, fog, sky, Globals UBO, lightning)
src/client/resources
├── assets/realweather/shaders         volumetric clouds, lightning, soft particles, shared GLSL includes
└── resourcepacks/terrain_effects      terrain shader with sway, wetness and cloud shadows
tools/                                 asset generators (textures, sounds)
```

Rendering details: the cloud field is evaluated by identical integer-hash value noise in Java and GLSL. Per-frame
weather data reaches all shaders by appending fields to vanilla's `Globals` uniform buffer (the buffer is enlarged;
vanilla shaders declaring the original block are unaffected). Clouds are ray-marched inside a camera-centred proxy
box so terrain occludes them through the normal depth test. Custom pipelines compile lazily and fail safe: if a
shader cannot compile, the vanilla effect is used instead.

## License

MIT — see [LICENSE](LICENSE). All textures and sounds are generated by the scripts in `tools/` and are covered by
the same license.
