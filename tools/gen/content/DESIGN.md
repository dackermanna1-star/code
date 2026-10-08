# Portal Gun Multiverse — content framework design

Minecraft **1.21.11**, Fabric Loader 0.19.5, Fabric API 0.141.6, **Mojang (official) mappings**, Java 21.
Decompiled Minecraft sources: `/tmp/claude-0/ref/mc` (grep them — never guess an API). Fabric API sources:
`/tmp/claude-0/ref/fabric` (intermediary names like `class_2248` in signatures; real names are Mojang's).
Vanilla generated data (exact 1.21.11 JSON formats for biomes, dimension types, noise settings, features, tags,
loot tables, models…): `/tmp/claude-0/ref/vanilla/gen/data/minecraft/` and vanilla assets inside
`~/.gradle/caches/fabric-loom/1.21.11/minecraft-client.jar` (unzip to inspect blockstates/models).

## Pipeline

```
tools/gen/content/dims/<id>.py   (DIMENSION = Dimension(...), DSL in tools/gen/content/dsl.py)
        │  tools/generate.py  →  gen.content.build(RES, lang, sound_table, only=[...]) -> spec dict
        ▼
src/main/resources/
  portalgun/content.json            read by Java ContentSpec (dimensions, blocks, items, creatures)
  data/portalgun/dimension/<id>.json, dimension_type/<id>.json, worldgen/** , loot_table/**, tags/**, ...
  data/minecraft/tags/**            (logs, leaves, mineable/*, dirt ... additions)
  assets/portalgun/{blockstates,models,items,textures,lang,geometry,...}
```
`gen.content.build` returns `{"dimensions": [...], "blocks": [...], "items": [...], "creatures": [...]}` whose
entries match the fields of `src/main/java/dev/portalgun/content/ContentSpec.java` (Gson, unknown fields ignored,
missing fields keep Java defaults). Modules may ADD fields to ContentSpec classes they own (see ownership below).
It also fills `lang` (en_us) with every translation key it introduces.

Run: `cd tools && python3 generate.py [--only sporewood]`. Compile: `cd /home/user/code && flock /tmp/claude-0/gradle.lock ./gradlew compileJava compileClientJava --no-daemon -q`.
ALWAYS wrap gradle in `flock /tmp/claude-0/gradle.lock` — several engineers share the checkout.
In-game smoke test (client under Xvfb, takes screenshots):
`cd /home/user/code && flock /tmp/claude-0/gradle.lock env PORTALGUN_TEST=tour:sporewood xvfb-run -a -s "-screen 0 1280x720x24" ./gradlew runClientGameTest --no-daemon`
(`PORTALGUN_TOUR_AERIAL=1` adds a high vantage shot per dimension; `PORTALGUN_TEST=creatures` runs the creature
gallery/behaviour test, which needs the creature lab dimension, i.e. a `generate.py --gallery` build.)
The client game-test run sets `-Dfabric.client.gametest.disableNetworkSynchronizer=true` itself (build.gradle).
→ screenshots in `build/run/clientGameTest/screenshots/` (view them with the Read tool). Game log in the gradle output
(look for `ERROR`, `Exception`, `Failed to`, `Couldn't`, registry/codec parse errors — data pack errors are FATAL for the world load).

Dedicated-server smoke test (headless; generates 100 chunks in every portalgun dimension, finds an arrival spot,
spawns each dimension's creatures, ticks 200 ticks, logs `[smoketest]` lines and stops the server; needs
`run/eula.txt` with `eula=true`):
`cd /home/user/code && flock /tmp/claude-0/gradle.lock env JAVA_TOOL_OPTIONS="$JAVA_TOOL_OPTIONS -Dportalgun.smoketest=true" ./gradlew runServer --no-daemon < /dev/null`

Test-only content: `generate.py --gallery` adds the `gallery_*` terrain dimensions and every `dims/*.py` that sets
`TEST_ONLY = True` (the creature lab `zz_creature_lab`). A plain `generate.py` (release build) never emits them.

## Module ownership (do not edit files you don't own; ask via your summary instead)

| module | owns |
|---|---|
| **W1 worldgen-python** | `tools/gen/content/__init__.py` (build), `worldgen.py`, `blocks.py`, `items.py`, `sky_art.py`, `features.py`, `validate.py`; the DSL file `dsl.py` (may extend, must stay backward compatible with `dims/sporewood.py`) |
| **W2 worldgen-java** | `dev/portalgun/registry/ModBlocks.java`, `ModWorldgen.java`, `dev/portalgun/block/**`, `dev/portalgun/world/**`, `dev/portalgun/mixin/**` (server) , client `ClientBlocks.java`, `client/sky/**`, `mixin/client/**`, both mixin json files; `ContentSpec.BlockSpec`/`DimensionInfo`/`Celestial` fields |
| **C creatures** | `tools/gen/content/creatures.py` (+ creature art helpers), `dev/portalgun/creature/**`, `registry/ModCreatures.java`, `client/creature/**`; `ContentSpec.CreatureSpec`/`Ranged`/`Sounds` fields |

## Contract W1 ⇄ W2 (Java worldgen types emitted by Python)

All config fields use vanilla codecs (BlockState as `{"Name": "...", "Properties": {...}}`, IntProvider as int or
`{"type":"minecraft:uniform","min_inclusive":a,"max_inclusive":b}`, BlockStateProvider as vanilla
`minecraft:simple_state_provider` / `minecraft:weighted_state_provider`).

### Feature types (`minecraft:worldgen/feature` registry, ids `portalgun:<name>`)
| type | config |
|---|---|
| `portalgun:giant_plant` | `stem`: BlockState, `head`: BlockState, `decoration`: optional BlockState, `shape`: string (dome flat sphere cone flower puff umbrella palm tuft), `height`: IntProvider, `radius`: IntProvider, `stem_width`: int 1..3, `bend`: float 0..1 |
| `portalgun:boulder` | `blocks`: BlockStateProvider, `radius`: IntProvider, `hollow`: bool, `squash`: float, `floating`: bool |
| `portalgun:spire` | `blocks`: BlockStateProvider, `tip`: optional BlockState, `cap`: optional BlockState, `height`: IntProvider, `radius`: IntProvider, `lean`: float, `hanging`: bool |
| `portalgun:crystal_cluster` | `block`: BlockState, `small`: optional BlockState, `size`: IntProvider |
| `portalgun:structure` | `kind`: string, `blocks`: map role→BlockState, `size`: IntProvider, `params`: map string→float (optional) |
| `portalgun:tree` (optional) | for shapes vanilla `minecraft:tree` can't do (palm, twisted, mushroom_like): `log`, `leaves`, `decoration` (optional) BlockStates, `shape`, `height` IntProvider |

Structure kinds and roles: `arch` (main, alt), `ring` (main, alt), `gear` (main, axle), `ribcage` (bone, spine), `lily_pad` (pad, flower, vein),
`monolith` (main), `geyser` (vent, mound) — vent is a `vent` kind block, `cuboids` (main, alt, trim), `tendril` (main, tip),
`nest` (main, egg). Features must be robust: never place outside the 3x3-chunk region a feature may touch (keep
horizontal extent ≤ 16 blocks from origin), never throw, use `WorldGenLevel#setBlock(pos, state, 2|16)` / `Feature.setBlock`.

### Density function types (`minecraft:worldgen/density_function_type`, ids `portalgun:<name>`)
| type | fields | value |
|---|---|---|
| `portalgun:coord` | `axis` x/y/z, `scale` double | coordinate × scale |
| `portalgun:sine` | `argument` DF, `frequency`, `amplitude` | amplitude·sin(argument·frequency) |
| `portalgun:terrace` | `argument` DF, `step` double, `smoothness` 0..1 | quantized argument with smoothed risers |
| `portalgun:cell_shapes` | `noise` (noise holder, seeds jitter), `shape` sphere/cube/blob, `cell_size` int, `min_radius`, `max_radius`, `y_min`, `y_max`, `probability` 0..1 | >0 inside shapes (≈ +1 deep inside, ≈ −1 far outside), smooth |
| `portalgun:cell_pillars` | `noise`, `cell_size`, `min_radius`, `max_radius`, `probability`, `top_min`, `top_max`, `bottom` | >0 inside pillars |
| `portalgun:craters` | `noise`, `cell_size`, `min_radius`, `max_radius`, `depth`, `rim`, `probability` | 2D height offset in blocks (negative in bowls, positive rims) |
| `portalgun:cells` | `noise`, `cell_size` | 3D Worley F2−F1 distance in blocks (≈0 on cell walls) |
All must be thread safe, deterministic per world seed (derive randomness by sampling the noise holder), implement
`minValue/maxValue` conservatively and `mapAll` (visit noise holders) so the RandomState wires noises.

### Blocks (Java registers from content.json `blocks`)
`BlockSpec.kind` is one of `dsl.BLOCK_KINDS`. Java chooses the block class + properties; Python generates blockstate,
model, item model (`assets/portalgun/items/<id>.json`), textures, loot table, tags (mineable/<tool>, needs tool,
`minecraft:logs`/`logs_that_burn`, `minecraft:leaves`, `minecraft:dirt` for grass/soil kinds so vanilla plants grow,
`minecraft:sand`, `minecraft:ice`, `portalgun:hazards` …) and lang. `layer` tells the client render layer
(`solid`/`cutout`/`translucent`). `emissive` blocks use models whose elements set `"light_emission": 15`.
Plant-like kinds (plant, tall_plant, hanging_plant, crystal_cluster, vine, lily) may be placed by features on ANY
solid surface of their dimension — their `canSurvive` must accept any block with a sturdy face in the right direction.

### Sky bodies
Python writes celestial textures to `assets/portalgun/textures/environment/<dimension>_<n>.png` and lists them in
`DimensionInfo.sky` (`texture` = `portalgun:textures/environment/<dimension>_<n>.png`, size/yaw/pitch/roll/speed/alpha/additive).
The client draws them after the vanilla sun/moon (mixin into `SkyRenderer`) using the celestial pipeline.

## Contract W1 ⇄ C (creatures)
`gen/content/creatures.py` exposes `build_creatures(dim, res_dir, lang) -> list[dict]` (CreatureSpec dicts, also
writes geometry JSON, textures, spawn egg texture + item model, loot tables, lang) and
`spawn_category(creature) -> str` (`monster`, `creature`, `ambient`, `water_creature`, `water_ambient`).
W1 calls it from `build()` and uses `spawn_category` when writing biome `spawners`
(entity id `portalgun:<creature id>`; vanilla ids pass through). Entity ids are `portalgun:<creature id>`.
Creature drops reference item ids from `dim.items` (W1 generates those items) or vanilla items.

## Quality bar
This is a polished showcase mod: every dimension must feel distinct (terrain silhouette, palette, sky, fog,
ambience, landmarks, creatures). Generated textures must be clean pixel art. No log spam, no data pack errors,
no crashes when generating chunks in any dimension, reasonable worldgen performance.
