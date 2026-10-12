# Mineception — design

A Fabric mod for Minecraft 1.21.11 (Mojang mappings, Fabric Loader ≥ 0.17.3, built against 0.19.2, Fabric API
0.141.6+1.21.11, Java 21).

## The experience

You craft a **Laptop** and place it. Its screen shows a live picture: a small Minecraft world (Level 1). In that
picture there is a desk with a laptop on it, and *that* laptop's screen shows Level 2, which shows Level 3, which shows
Level 4 (Limbo), whose laptop only shows static. It is screens inside screens, four levels deep.

Right-click the laptop to "play Minecraft on it": a laptop-shaped screen opens showing Level 1 full size. You walk
around (WASD, mouse look, jump), break and place blocks from a hotbar, and walk up to the laptop on the desk.
Right-click that laptop and the camera **dives into its screen** and you are now playing Level 2. And so on down to
Level 4. Esc takes you back up one level (camera pulls back out of the screen). Falling out of a level gives you
"the kick" back up a level. Changes you make in any level are saved in the laptop (also when it is picked up) and
everyone on the server sees them.

The levels are an homage to the dream layers of *Inception*:

| Depth | Theme | Look | Time |
|---|---|---|---|
| 1 | The City | rainy streets, brick and stone buildings, street lamps, a café table with the laptop | ×1 |
| 2 | The Hotel | indoors: lobby, red carpet, quartz floors, lamps, reception desk with the laptop | ×20 |
| 3 | The Fortress | snowy mountains, spruce trees, frozen lake, stone-brick fortress | ×400 |
| 4 | Limbo | endless dusk, beach and sea, crumbling ruins, fog; the laptop shows only static | stopped |

## How it works

The dream levels are **not** real Minecraft dimensions. Each level is a 40×32×40 voxel world of `MiniBlock`s,
generated deterministically from the laptop's seed (`WorldGen`), plus a list of player edits (`LaptopData`). Only the
seed and edits are stored and synced.

They are drawn by a **software voxel raycaster** (`Raycaster`) that uses the real Minecraft block textures, so a level
looks like Minecraft at a low resolution. Because it is our own renderer, a laptop inside a level can show another
rendered picture on its screen: rendering level *d* first renders level *d+1* (smaller) and samples it on the laptop
screen, recursively. The same renderer feeds the in-world laptop screen (a block entity renderer drawing a dynamic
texture) and the laptop GUI.

### Package layout

```
com.mineception
  Mineception, ModContent, ClientHooks          entrypoint, registrations, client hook
  block/   LaptopBlock, LaptopBlockEntity, LaptopDataCodecs
  network/ EditBlockPayload (+ server handler)
  dream/   PURE JAVA (no net.minecraft imports, no jspecify): MiniBlock, Face, MiniWorld, Theme, LaptopGeometry,
           LaptopData, MiniInput, MiniHit, MiniPlayer, WorldGen
  dream/render/  PURE JAVA: Raycaster, Camera, TextureSource, ScreenImage (+ texture naming rules)
com.mineception.client  (client source set)
  MineceptionClient                                client entrypoint
  render/  DreamSession, LaptopRendering, block entity renderer, resource-pack TextureSource
  screen/  LaptopScreen
```

The `dream` packages must stay free of Minecraft classes so they can be unit-tested with plain JUnit
(`./gradlew test`) and previewed offline.

## Frozen contracts (do not change; report needed changes instead)

These scaffold files are shared by all modules: `Face`, `MiniBlock` (ids are persisted — append-only, and frozen for
this round), `MiniWorld`, `Theme` (field set frozen; module A may tune the colour/time values), `LaptopGeometry`,
`LaptopData`, `MiniInput`, `MiniHit`, `Camera`, `TextureSource`, `ScreenImage`, `EditBlockPayload`, `ClientHooks`,
the build files. The **public signatures** of `WorldGen`, `MiniPlayer`, `Raycaster`, `DreamSession`, `LaptopRendering`
and `LaptopScreen(BlockPos)` are contracts too; their bodies are placeholders to be replaced by their owners.

Conventions:
- Yaw/pitch use Minecraft's convention: yaw 0 looks +z (south), 90 looks −x (west); positive pitch looks down.
  `Camera.forward()/right()/up()` implement this.
- `MiniWorld.index(x,y,z) = (y*SZ + z)*SX + x`. Out-of-bounds reads are AIR (the void).
- `MiniWorld.laptopFacing` is the direction the laptop's screen faces (where the viewer stands).
- `LaptopGeometry` defines the laptop's boxes and screen rectangle inside its cell; the dream raycaster, the dive
  animation and the real block model/screen renderer all use it so the picture lines up with the lid.
- Image buffers are ARGB `int[]`, row-major, top row first.
- Real-world laptop `FACING` = direction the screen faces (toward the player who placed it).

## Module ownership

Each module is built by one agent in its own git worktree. **Only edit files you own.** New files are fine inside
your own areas.

### Module A — dream content, physics, block & server

Owns: `dream/WorldGen.java`, `dream/MiniPlayer.java`, new non-render files in `dream/`, `Mineception.java`,
`ModContent.java`, `block/**`, `network/**`, `src/main/resources/**`, `src/test/java/com/mineception/dream/*`
(not `render/`), `src/gametest/java/com/mineception/test/LaptopGameTests.java`, `src/gametest/resources/**`,
`tools/**` (resource generator scripts).

1. **WorldGen** — four themed generators (table above), deterministic in `(seed, depth)`; different seeds give
   different layouts of the same theme. Requirements for every level:
   - bedrock at y=0 everywhere inside the bounds; the world is surrounded by void beyond its edges except the hotel,
     which is fully enclosed (walls + ceiling);
   - exactly one `LAPTOP` cell (`laptopX/Y/Z`, `laptopFacing` set) standing on a desk/table block, facing the spawn;
   - spawn: feet on a solid block with two free (non-solid) cells of headroom, 3–5 blocks in front of the laptop,
     `spawnYaw`/`spawnPitch` aimed at the centre of the laptop screen so the screen is near the middle of the view;
     the line of sight from the eye to the screen centre must be unobstructed (the in-world thumbnails rely on the
     idle avatar looking at its laptop);
   - the laptop must be reachable on foot from the spawn (walk/jump one block up);
   - recognisable at a 40×25-pixel thumbnail: strong silhouettes and colours per theme.
2. **MiniPlayer** — Minecraft-like movement and collision: AABB 0.6×1.8, eye 1.62; gravity 0.08/tick with 0.98 drag;
   jump velocity 0.42 (≈1.25 block jump); walk ≈4.3 blocks/s, sprint ≈5.6 blocks/s; reduced air control; axis-separated
   collision (Y, then X, then Z) against `solid()` blocks (out of bounds = air); water (body overlapping `WATER`):
   weak gravity, strong drag, jump swims up; sneak walks slowly and does not walk off ledges; `fellOut()` below
   `KICK_Y`; `pick()` = exact voxel DDA from the eye along the look direction within `reach`, ignoring AIR and WATER,
   returning the hit face; `canPlaceAt` rejects cells overlapping the player's box. Keep `xo/yo/zo/yawO/pitchO`
   updated for interpolation.
3. **Block, block entity, item** — refine the scaffold: the laptop keeps its `LaptopData` when broken and placed again
   (implicit data component + loot table `copy_components`), fresh laptops get a random seed, block entity syncs to
   clients on load and after edits. Creative tab entry (e.g. functional blocks tab). Recipe (e.g. iron ingots, glass
   pane, redstone, a diamond for the "dream core" — your call, keep it reasonable).
4. **Server edit handling** — register a receiver for `EditBlockPayload`. Validate everything: sender alive and in the
   laptop's level within 8 blocks of it; the block entity exists; depth 1..4; index in range; new block is AIR
   (break) or `placeable()`; when breaking, the current block (generated + edits) must be `breakable()`; when
   placing, the current cell must be AIR or WATER; never the laptop cell or y=0; rate limit (~20 edits/s per player);
   respect the edit cap. Cache the built level per block entity for validation (rebuild on change). Apply via
   `LaptopBlockEntity.applyEdit`, which syncs to clients.
5. **Resources** — blockstate with the 4 facings (model authored facing SOUTH: y rotations south 0, west 90,
   north 180, east 270); block model built from `LaptopGeometry` numbers (deck with keyboard, lid with a bezel; the
   screen area dark — the live picture is drawn on top by the renderer); item model definition
   (`assets/mineception/items/laptop.json`) + item model; 16×16 textures generated by a script in `tools/` (PIL is
   available) and a mod `icon.png`; `lang/en_us.json` with the block name, the four level names
   (`dream.mineception.<key>`), and server messages; recipe; loot table; mineable tag.
6. **Tests** — JUnit (`src/test/java/com/mineception/dream/`): generator determinism and per-level invariants above
   (for many seeds), path from spawn to laptop, physics (falls and lands, walls block, jump height 1.1–1.3, water,
   kick, pick hits the laptop from spawn, canPlaceAt). Game tests (`LaptopGameTests`): placement and seed, codec
   round trip, persistence through save/load, item keeps data when broken, and the server validation rules (invalid
   edits rejected, valid ones applied and synced).

### Module B — rendering

Owns: `dream/render/**` (main, except the frozen contract files `Camera`, `TextureSource`, `ScreenImage`),
`src/test/java/com/mineception/dream/render/**`, `src/client/java/com/mineception/client/render/**`.

1. **Raycaster** (pure Java, thread-safe):
   - per-pixel rays from the camera (vertical FOV), Amanatides–Woo DDA through the grid; rays starting outside the
     bounds are clipped to the bounding box first (cameras can be outside during transitions);
   - textures from `TextureSource` (cache them per block/face/theme), nearest sampling, with the same UV orientation
     Minecraft uses (side textures upright, logs/sandstone/grass with distinct top/side/bottom);
   - Minecraft-like face shading (top 1.0, north/south 0.8, east/west 0.6, bottom 0.5) × daylight from the theme's
     time of day; emissive blocks full-bright; indoor themes use a constant interior light;
   - cutout (alpha-tested leaves/glass), translucent ice, water drawn only at water/air boundaries, tinted and
     semi-transparent, with an underwater tint when the camera is in water;
   - the laptop (`SPECIAL`): intersect its two boxes from `LaptopGeometry.boxes(facing)` inside the cell; body in dark
     grey with a simple key pattern; the screen rectangle shows `child` sampled at (u, v) (or animated static when
     `child == null`), full-bright;
   - sky gradient (day/night blend), Minecraft-style square sun and moon following the time of day, stars at night;
     weather overlay (rain streaks for RAIN, flakes for SNOW); distance fog toward `theme.fogColor` up to
     `theme.fogDistance`; block highlight outline;
   - performance: 320×200 must render in well under 15 ms on this 4-core machine (rows may be split across a
     ForkJoinPool; keep it thread-safe).
2. **Texture naming** — a pure mapping from (MiniBlock, Face) to vanilla texture names plus tint rules (grass/foliage/
   water tints from the theme, first frame of animated strips). Verify against the real PNGs in the Minecraft client
   jar (find it under `~/.gradle/caches/fabric-loom/`), e.g. whether `grass_block_side` already has coloured grass or
   needs the tinted overlay.
3. **Offline preview** — a test-source tool (and/or JUnit test) that loads textures straight from the client jar and
   renders each level's spawn view to PNGs under `build/preview/`, including the nested laptop screens. Look at the
   PNGs (Read tool) and iterate until they look right. Note that until merge, `WorldGen` is the flat placeholder.
4. **DreamSession** (client) — sessions keyed by laptop position (+ level), created from the client
   `LaptopBlockEntity`; levels rebuilt when `revision()` changes (avatars keep their positions); idle avatars look at
   their laptop with a gentle sway; recursive rendering (child level at about half the resolution each step, child
   aspect `LaptopGeometry.SCREEN_ASPECT`, level 4's laptop shows static); `edit()` validates like the server, applies
   locally and sends `EditBlockPayload`; sessions are released when the laptop is removed, the level changes, or it
   has been far away for a while.
5. **Real-world screen** — block entity renderer drawing a per-laptop `DynamicTexture` (≈128×80) exactly on the
   screen rectangle of the real block (from `LaptopGeometry`, rotated by `FACING`, a hair in front of the lid),
   full-bright; refreshed at most ~15 times per second and only when near (≤ 24 blocks) and visible; textures
   released with their session. Resource reloads clear the texture cache.
6. `LaptopRendering.init()` registers all of the above (renderer, client tick, reload listener).

### Module C — laptop screen and client test

Owns: `src/client/java/com/mineception/client/screen/**`, `client/MineceptionClient.java`,
`src/gametest/java/com/mineception/test/ClientGameTests.java`, and `lang-fragments/gui.json` (GUI strings, merged into
`en_us.json` at integration).

1. **LaptopScreen** — a laptop drawn around a 16:10 monitor that fills most of the window, breadcrumbs
   ("Real World › Level 1: The City › Level 2: The Hotel"), the current level rendered every frame through
   `DreamSession.render` into a `DynamicTexture` (resolution tied to the monitor's on-screen size, capped around
   427×267) and blitted to the monitor.
2. **Controls** — click the monitor to capture the mouse (GLFW cursor disabled; deltas → yaw/pitch using the player's
   mouse sensitivity), Tab releases it; movement via the player's own key mappings (`keyUp/Down/Left/Right/Jump/
   Sprint/Shift` matched against key events, tracking press/release); left click breaks, right click places the
   selected block or, on the laptop, dives deeper; 1–9 and the scroll wheel select the hotbar slot; Esc goes up a
   level (or closes at Level 1). Avatar ticks at 20 Hz in `tick()`; render with partial ticks.
3. **HUD** in the monitor — crosshair, hotbar with real item icons (`MiniBlock.vanillaId`), level title and time
   dilation ("Time ×20", "Time has stopped" in Limbo), a first-time controls hint, short messages ("Can't go deeper
   — this is Limbo").
4. **Transitions** — dive: ease the camera from the avatar's eye to a point in front of the laptop screen where the
   screen fills the view (use `LaptopGeometry.screenFrame` + the laptop cell), then switch to the next level (avatar
   at its spawn on first visit) with a short flash and the "BWAAAM" (vanilla raid horn at low pitch). Exit is the
   reverse. The kick (falling out) = exit with a "KICK!" flash.
5. **Polish** — block break/place sounds from the matching vanilla block, release the mouse and stop controlling
   (`setControlledDepth(0)`) on close.
6. **Client game test** — place a laptop with a command, screenshot the in-world live screen up close, open the
   `LaptopScreen`, walk, break and place a block, dive to Levels 2, 3 and 4 (screenshots of each, including the dive
   mid-animation and Limbo's static), go back up with Esc, and check on the server that the edit reached the block
   entity. It must compile; it is run during integration (do not launch the client yourself).

## Rules for every agent

- Decompiled Minecraft 1.21.11 sources: `/tmp/claude-0/-home-user-code/debfa5fd-77d1-5840-9eea-57a50d6dbbe9/scratchpad/mc`,
  Fabric API sources: `.../scratchpad/fapi`. Check real signatures there instead of guessing.
- Build from `mineception/`: `./gradlew compileJava compileClientJava compileGametestJava test` (retry with a pause if
  Maven Central answers 429). Module A may also run `./gradlew runGameTest`. **Do not launch the Minecraft client**
  (`runClient`, `runClientGameTest`) — the machine is shared.
- Style: tabs, Javadoc on public types, comments only where they explain intent.
- When done: make sure everything compiles and your tests pass, commit your work on your worktree branch with a clear
  message, and report what you built, what you verified and how, anything unfinished, and any contract change you
  need.
