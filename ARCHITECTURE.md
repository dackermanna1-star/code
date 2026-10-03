# Architecture & contracts

Private, non-commercial fan recreation of Minecraft ("Minecraft: Photorealistic Physics Edition").
Gameplay, world structure, blocks, items, mobs and progression follow Minecraft (Java Edition, ~1.20)
as closely as practical. Presentation is replaced by a modern deferred PBR renderer and realistic
physics. **Art direction rule:** every visual must still read instantly as Minecraft — keep the voxel
grid, block silhouettes, Minecraft colour language and texture *layouts* (e.g. oak planks show 4
horizontal boards per block, cobblestone is irregular rounded stones, diamond ore is stone with cyan
gems), but render them as if photographed: high-detail PBR materials, bevelled edges, real lighting.

## Stack

* TypeScript (strict), Vite (multi-page dev server), Three.js r186 (`WebGLRenderer`, WebGL2 only,
  custom `RawShaderMaterial`s with `glslVersion: THREE.GLSL3`), Rapier3D (`@dimforge/rapier3d-compat`)
  for rigid bodies & ragdolls, Vitest for unit tests.
* `npm run dev` – dev server · `npm run build` – typecheck + production build · `npm test` – unit tests.
* `node tools/screenshot.mjs "/index.html?query" out.png` – headless Chromium (SwiftShader, slow but
  correct WebGL2) screenshot. Pages set `window.__shotReady = true` when a frame worth capturing has
  been drawn and may set `window.__shotInfo`. Use debug pages under `debug/*.html` (served by Vite at
  `/debug/<name>.html`) to test subsystems in isolation. SwiftShader is ~50-200x slower than a GPU:
  use small sizes (e.g. 640x360) and few frames.

## Layout

```
src/core/        constants, dirs, math, rng, noise, events (worker-safe)
src/world/       blocks/ (registry + definitions), chunk.ts, biomes.ts, world.ts, light.ts, fluids.ts
src/world/gen/   world generators (overworld, nether, end, features, structures) — run in workers
src/world/worker gen.worker.ts, mesh.worker.ts
src/render/      deferred renderer, chunk meshes, materials/, sky/, post/, water, particles, entities
src/physics/     AABB entity movement, Rapier world (voxel colliders), ragdolls
src/entity/      entities, mobs, AI, models/animation
src/game/        game loop, items, inventory, crafting, survival, combat, redstone, brewing, ...
src/ui/          DOM UI (HUD, menus, inventory screens)
src/audio/       procedural audio (WebAudio)
src/save/        IndexedDB persistence
debug/           standalone debug pages for subsystems
```

Files under `src/core`, `src/world/blocks`, `src/world/chunk.ts`, `src/world/biomes.ts`,
`src/world/gen/generator.ts`, `src/render/materials/textureList.ts` are shared contracts — do not
change their existing exports' meaning. Adding *new* blocks must be appended at the end of
`blocks.ts` (ids are positional).

## Coordinates & conventions

* Right-handed, **Y up**. Minecraft directions: north = -Z, south = +Z, west = -X, east = +X.
* `Dir`: DOWN=0, UP=1, NORTH=2, SOUTH=3, WEST=4, EAST=5. Horizontal facing (2 bits): SOUTH=0,
  WEST=1, NORTH=2, EAST=3.
* 1 block = 1 metre. World height 0..255, sea level 63 (the top water block is y=62, its surface at
  y=63). Bedrock at y=0..4 (noisy). Deepslate transitions in around y=0..16.
* Chunk = 16x256x16 column split into 16 sections of 16³. Section index = `(y&15)<<8 | z<<4 | x`.
* Block **state** = `(id << 4) | meta` (uint16). `S('oak_log', 0)` gives a state. Air = 0.
* Light is packed per block in a uint16: sky(4) | R(4) | G(4) | B(4) (coloured block light).
* Game logic runs at 20 TPS; physics at 60 Hz fixed steps; rendering interpolates.
* World time in ticks; `timeOfDay = (ticks % 24000) / 24000`, tick 0 = sunrise (06:00),
  6000 = noon, 12000 = sunset, 18000 = midnight (Minecraft convention).

## Rendering pipeline (deferred, HDR, linear)

1. **Shadow pass** – cascaded shadow maps (4 cascades in one depth atlas) from the sun/moon.
2. **G-buffer pass** (MRT, opaque + alpha-tested geometry):
   * `gAlbedo`  RGBA8 : albedo (linear) .rgb, .a = subsurface/translucency amount
   * `gNormal`  RGBA16F: world normal .xyz (unit), .w = roughness
   * `gMaterial` RGBA8: .r metalness, .g emissive (0..1, ×EMISSIVE_SCALE), .b baked AO (vertex AO ×
     texture cavity), .a material flags (bit0 foliage, bit1 water-submerged, bit2 entity, bit3 hand)
   * `gLight`   RGBA8 : propagated light .r sky (0..1), .gba block light RGB (0..1)
   * depth: DEPTH24/32F texture (standard perspective, reverse-Z not used)
3. **SSAO** (half res, GTAO-style) → blurred.
4. **Lighting pass** → HDR `RGBA16F`: sun/moon GGX + Burley diffuse with CSM PCF/PCSS shadows and
   cloud shadows, sky ambient (from the atmosphere) × sky light × AO, coloured block light, emissive,
   foliage subsurface, specular sky reflection.
5. **Sky** drawn where depth = 1 (atmosphere + sun/moon/stars + volumetric clouds).
6. **Translucent forward pass**: water (SSR + refraction + absorption + foam), glass, ice, particles.
7. **Volumetrics/fog**: shadowed in-scattering (god rays), aerial perspective, underwater fog.
8. **TAA** → **bloom** → **auto exposure** → **tonemap (AgX/ACES) + grading** → screen.

### HDR units (shared by every shader)

* Sun illuminance at top of atmosphere `SUN_ILLUMINANCE = 20.0`; full-moon illuminance
  `MOON_ILLUMINANCE = 0.08`. The atmosphere supplies the attenuated sun colour at the ground.
* Block light: level 15 ≈ radiance 6.0 at the source with a perceptual falloff; emissive surfaces
  write `emissive × EMISSIVE_SCALE (=8.0)`.
* Auto exposure targets middle grey; nights are dark but readable.

### Block materials

Block textures live in two `sampler2DArray`s produced by `src/render/materials/`:

* `albedo` (RGBA8, sRGB data — decode in shader): `.rgb` albedo, `.a` = opacity for textures used by
  `cutout`/`translucent` blocks, or **tint mask** for opaque textures (1 = apply biome/dye tint to
  this texel, e.g. grass blades on `grass_block_side`; 0 = untinted, e.g. the dirt part).
* `normal` (RGBA8, linear): `.xy` tangent-space normal (`n*0.5+0.5`; x along +u, y along +v),
  `.z` height (1 = highest surface point, used for parallax occlusion mapping), `.w` roughness.
* `props` (DataTexture, width = layer count, RGBA8): per-layer constants
  `.r` metalness, `.g` emissive strength, `.b` emissive luminance threshold (texels whose albedo
  luminance exceeds it glow — lets ore specks / furnace fire / lava cracks emit), `.a` subsurface.
* Layer index = `textureLayer(name)` from `textureList.ts`. UV origin is the bottom-left of the
  image as seen on a block side (v = 1 is the top edge of a side face). On top/bottom faces +u = east
  (+X), +v = north (-Z).

## Worker protocol

* `gen.worker.ts` – generation (`createGenerator(dimension, seed)` from `src/world/gen/index.ts`).
* `mesh.worker.ts` – meshing of 16³ sections given padded 18³ block/light data.

## Testing rules for contributors / agents

* Keep `npm run typecheck` clean for files you own. Run unit tests you add with `npx vitest run <file>`.
* Prefer debug pages + `tools/screenshot.mjs` to verify visuals; look at the PNGs.
* Don't modify files owned by other workstreams (see each task brief); integrate through the
  documented interfaces. If an interface is insufficient, add a new export rather than changing an
  existing one, and mention it in your final report.

## Game layer (src/game, src/entity, src/ui)

* `Game` (`src/game/game.ts`) owns everything: `game.world` (current dimension `World`), `game.chunks`
  (`ChunkManager`), `game.entities` (`EntityManager`), `game.player`, `game.renderer`, `game.input`,
  `game.ui`, `game.audio` (procedural `AudioEngine`), `game.settings`, `game.events` (emitter),
  `game.dayTime` (ticks, 0 = sunrise), `game.ticks`, `game.weather` ({rain, thunder, raining...}),
  `game.difficulty`, `game.gamerules`, `game.dimension`. Helpers: `breakBlock`, `resolveDrops`,
  `dropItem`, `spawnXp`, `spawn(entity,x,y,z)`, `message(text)`, `enterDimension(dim,pos)`.
  Service slots filled by systems: `game.itemModels` (item visuals), `game.particles`,
  `game.physics` (Rapier), `game.saver`.
* Loop: 20 TPS `tick()` (world scheduled/random ticks → interaction → systems.tick → entities.tick →
  item pickup), 60 Hz `physicsStep` (entities then systems.physics), per-frame `update` + render.
* **Systems**: implement `GameSystem` (`src/game/systems.ts`: init/tick/physics/update/onWorldChange/
  save/load) and add an instance in `src/game/systemList.ts`.
* **Blocks behaviour**: `addBehavior(nameOrTagOrPredicate, { onUse, onRandomTick, onScheduledTick,
  onNeighborChange, onPlace, onRemove, onEntityInside, onEntityStep, canSurvive, getPlacementState,
  getWeakPower, getStrongPower, ... })` (`src/world/blocks/behaviors.ts`). Hooks chain across modules.
  `world.setBlock(x,y,z,state, SetFlags.ALL)` updates light/mesh, calls hooks and notifies neighbours.
  `world.scheduleTick(x,y,z,delay)`, `world.get/setBlockEntity(x,y,z,data)` (plain JSON-able data).
* **Items**: `registerItem(name, props)` / `addItemBehavior(names, { use, useOnBlock, useOnEntity,
  useTick, release, holdUse, usePose, inventoryTick })` (`src/game/items/registry.ts`). Block items are
  auto-registered under the block's name. `ItemStack = { item, count, damage, ench?, data? }`.
  Player inventory slots: 0-8 hotbar, 9-35 main, 36-39 armor (feet, legs, chest, head), 40 offhand.
* **Entities**: extend `Entity` / `LivingEntity` (`src/entity`), call `registerEntity(type, Ctor,
  category)`. Set `model` (THREE.Object3D) built with `createEntityMaterial()` (G-buffer MRT
  material; uniforms `u_hurt`, `u_light` (use `setEntityLight`), `u_wounds[8]`/`u_woundCount`,
  `u_bloodType`). Entity models are rendered from `entities.scene` into the G-buffer and cast shadows
  (depth override). Living entities: `intent` (forward/strafe/jump/sneak/sprint) drives Minecraft-like
  movement in `physicsStep`; `hurt(DamageSource, amount)`, `knockback()`, `addEffect()`; optional
  `sounds = { hurt, death, say, step }` for the audio glue. `Projectile`/`ArrowEntity` in
  `src/entity/projectile.ts`.
* **Rendering hooks** for systems: `game.renderExtras = { gbuffer?: Scene[], forward?: Scene[],
  shadow?: Scene[], hand?: {scene, camera}, overlayScene?: Scene, overlay?: Vector4 }`. Forward scenes
  draw into the HDR buffer after translucents with depth testing; useful textures:
  `renderer.linearDepthTexture`, `renderer.sceneColorTexture`, `renderer.lightUniforms`
  (u_lightDir, u_lightColor, u_sh[9] ambient SH, …), `renderer.atmosphere` (glsl + uniforms),
  `renderer.blockMaterials()`, `createBlockMesh(renderer, state)` for single-block meshes.
* **UI**: `ui.open(screen)` / `ui.close()`; screens are DOM elements (`src/ui/ui.ts`, helper `h()`),
  styles in `src/ui/style.css`. `setItemIconProvider(stack => dataURL)` (`src/ui/hud.ts`).

* **Gore** (`game.gore`, `src/game/gore/*`): typed wounds (blunt bruise / cut slash / pierce puncture /
  burn char, `classifyDamage(DamageSource)`, max 8 per entity in a `WoundSet`, encoded into
  `u_wounds` (w = type*100 + severity*10 + size) and `u_woundDir` (xyz dir, w growth) via
  `rig.setWounds`), blood spray/drips (bleeding wounds keep dripping), `BloodDecals` (instanced forward
  quads, 200 max, 60 s life, pools under corpses) and dismemberment: the RagdollSystem calls
  `gore.planDismember(entity, source)` before building a ragdoll without those bone subtrees and
  `gore.detach(...)` afterwards (parts are Rapier bodies with mesh clones + red stump caps + spurts).
  Blood colour per mob: `bloodFor(entity)` (`gore/blood.ts`). Needs `game.physics` for parts only.

### Events (`game.events.on(name, fn)`)
`entityAdded/Removed {entity}`, `entityHurt {entity, source, amount}`, `entityDeath {entity, source}`,
`entityFallDamage {entity, distance, damage}`, `footstep {entity, block}`, `jump {entity}`,
`blockStartBreak / blockHitting {x,y,z,state,player,progress}`, `blockBroken {x,y,z,state,player,tool}`,
`blockPlaced {x,y,z,state,oldState,player}`, `blockLanded {x,y,z,state,entity,speed}`,
`itemPickup {player, entity, stack, count}`, `itemDropped`, `itemBroke`, `levelUp`, `xpPickup`,
`spawnXp {pos, amount, handle()}`, `playerAttack {player,target,damage,crit,sweep,strength,weapon,point}`,
`playerAttackMiss`, `sweepAttack`, `swingAir`, `arrowHit`, `arrowStuck`, `explosion {pos, power}`,
`chat {text,color}`, `title {title,subtitle,time}`, `worldReady`, `dimensionChanged {dimension}`,
`chunkReady {chunk}`. Add new events freely (document them in your report).

### Testing the game
`node tools/screenshot.mjs "/index.html?autostart=1&seed=123&mode=creative&time=6000&x=0&y=90&z=0&yaw=30&pitch=-15&rd=4&frames=10" out.png --w 960 --h 540`
starts a world directly (no menus) and captures after N frames. `window.game` is the Game instance
(use `page.evaluate` in your own Playwright scripts to drive it).
