# World + Rendering — progress log & reference (key: world)

Owner dirs: `src/world/`, `src/render/`, `sandbox/world.html`, `src/sandbox/world.ts`, `tests/world*.test.ts`, `tools/world*`.

## Status
Done & tested: authored layout, worker terrain generation, exact heightfield physics, CDLOD terrain + splat
material, water, roads, bridges, sky/time/weather, fog, cascaded sun shadows, IBL, post-processing, map image,
spatial queries, debug helpers, sandbox. See "Known issues" for gaps.

## Reference for other modules

### ctx.world (src/world/World.ts implements IWorld)
- Map 3072 x 3072 m (0..size on X/Z, -Z = north), sea level 0. 12 named locations (`world.locations`).
- `getHeight(x,z)`: EXACT surface of the rendered LOD0 mesh and of the Rapier heightfield (same triangle split,
  proven by tests/world.heightfield.test.ts). Ignores bridges/buildings — raycast physics for those.
- `getNormal` = smooth (bilinear vertex normals, what the terrain is shaded with); `World.getTriangleNormal` = exact
  collider triangle normal.
- `getSurface`: roads at 2 m (asphalt/dirt), else 4 m surface class (grass, dirt [also forest floor/fields], mud,
  rock, sand, gravel, concrete), 'water' where water. Terrain collider ColliderInfo.surface is just 'grass' — for
  terrain hits call `ctx.world.getSurface(hit.point.x, hit.point.z)`.
- `getWaterHeight`: sea/river/channel (sea level + the same Gerstner waves the shader renders, attenuated near shore
  and in rivers) and ponds (their own level). null on dry land.
- `getTreeDensity` (0 on roads/lots/water/beach/fields/towns, forests 0.6-0.9, meadows ~0.04),
  `getGroundCover` (fields 1, meadows ~0.7-0.9, forest floor ~0.4, plowed 0.12, roads/sand/rock 0),
  `isReserved(x,z,margin)` (distance field to roads, bridges, lot footprints and prop footprints; margins ≤ 25 m).
- `World.reservedDistance(x,z)`, `World.surfaceClass`, `World.waterLevelAt`, `World.layout` (full authored data:
  fields, forests, ponds, river, ridges, bridges with `deckY`, ground patches…).
- `lots[]`: BuildingLot with `groundY` = flattened pad height (terrain is flat at groundY over footprint + 1.5 m).
  Front door faces local +Z rotated by rotationY (lots along streets face the street).
- `props[]`: kinds + nominal footprints in `PROP_FOOTPRINTS` (src/world/layout/props.ts, exported data):
  fence_wood, fence_metal, wall_concrete, wall_ruin, guard_rail (linear: `length` along local X, origin = center),
  power_pole, street_lamp, container (12.2 m), container_small (6.1 m) — stacked containers have y = ground + 2.6·level,
  car_wreck, hay_bale, barrier_concrete, sandbags, crane, cooling_tower, tank_industrial, chimney, radio_tower,
  water_tower, bus_stop, pallet_stack, barrel, conveyor. `y` is the ground height at the prop (or stack level).
- `vehicleSpawns[]`: 41 land (y = ground + 0.4, `prefer` hints) + 9 water (y = water level).
- `roads[]`: polylines (6 m resampled splines), widths 8 (highways), 6.5 (streets), 4.5-6 (dirt). Bridge spans are
  straight; bridges are real colliders (deck tagged kind 'terrain'/surface 'asphalt', parapets/piers 'building').
- `getMapImage()`: 2048² canvas (1.5 m/px; pixel = world/1.5): relief, land colors, forests, water, roads,
  bridges, buildings, containers. No labels.

### ctx.environment (src/world/env/Environment.ts)
- `timeOfDay`, `setTimeOfDay(h)`, `weather`, `setWeather(w, transitionSeconds = 0)`, `timeSpeed`.
- `sunDirection` (unit, toward the sun), `visibility` (0..1 for AI: 1 day clear, ~0.3 night, fog ~0.35),
  `fogDistance` (m, 95 % fog), `params` (cloudCover, fogDensity, rain, wetness, wind…), `night`, `underwater`.

### Rendering (src/render/index.ts)
- Shadows: three r186 `SunLight` + `CascadedSunShadow` (1-4 cascades in one atlas, settings-driven). Works for
  every MeshStandard/Physical/Lambert/Phong material automatically — **no registration needed**;
  `registerShadowMaterial(m)` is a no-op kept for API compatibility. Set `castShadow`/`receiveShadow` as usual.
  Do NOT add other shadow-casting DirectionalLights.
- Fog: global height fog via patched fog chunks. Custom ShaderMaterials get it by including the fog chunks and
  `fog: true`; for custom fog math use `HEIGHT_FOG_GLSL` (exported).
- IBL: `scene.environment` = PMREM of the sky (rebaked when time/weather change, throttled). Indoor materials may
  want `envMapIntensity` < 1.
- Post: pmndrs postprocessing composer (N8AO, bloom, ACES tone mapping, grade, vignette, SMAA/FXAA), ADS
  depth-of-field reads `ctx.cameraRig.adsBlend` automatically (or `setAdsDepthOfField(focusMeters|null)`).
  Graphics settings apply live (`settings:changed`), except terrain texture resolution (next load).
- Render order: sky -1000, roads -1 (transparent, no depth write), water 1 (transparent), rain 10.

### Debug helpers (window.__game)
`teleport(x,z[,y])`, `debugCam(x,y|null,z,yawDeg,pitchDeg)` (sets debugState.freeCam), `debugCamOff()`,
`flycam(on)`, `setTime(h)`, `setWeather(w[,seconds])`, `screenshotTour()` (viewpoints for towns/bridges/coast),
`worldInfo([x,z])`, `renderStats()`, `terrainDebug(mode)` (1 flat albedo, 2 weights, 4 normals, 12 terrain normal…),
`showTerrainLayers(on,'albedo'|'normal')`.
Sandbox: `/sandbox/world.html?time=19.5&weather=fog&preset=low&nopost=1&texres=512&modules=buildings,vegetation`.
Tools: `tools/world-shot.mjs` (multi-view screenshots, `--views "name:x,y,z,yaw,pitch;..."`, `--tour`, `--map out.png`),
`tools/world-preview.ts` (node map preview, `npx vite-node tools/world-preview.ts out.png`),
`tools/world-vite.config.ts` (HMR-free dev server for long headless runs).

## Design decisions
- Layout is authored data (src/world/layout): coast polygons, river, ridges/hills, quarry, forests, fields, flat
  areas, town street plans; lots are placed along streets by LayoutBuilder (rejects overlaps / roads / water).
- Terrain generation is pure TS (src/world/terrain/gen) run in a Web Worker: coast SDF (EDT) + domain-warped relief +
  ridges/hills/cliffs + quarry, river/pond carving, road profiles (smoothed, grade-limited, junction-pinned, bridge
  ramps) with cut/fill shoulders whose width grows with height difference, lot pads with skirts, then
  classification (4 m), normals, reserved distance field (2 m), water data (4 m half floats), map raster.
- CDLOD: 64 m LOD0 nodes (32x32 quads of 2 m), 5 levels, height-only geomorphing toward the coarser triangle (same
  diagonal) so there are no cracks and the near field (<~135 m) is exactly the physics surface. One instanced draw
  per pass; nodes sorted by distance so each shadow cascade draws only its prefix.
- Terrain material: 9 layers in two texture arrays baked on the GPU (procedural recipes or asset sets), height-
  blended, IQ anti-tiling, triplanar rock, per-pixel terrain normals + detail normals, macro variation, wetness, cloud
  shadows.
- Why not CSM.js: it needs `setupMaterial` on every material (unregistered materials get lit N times). r186 SunLight
  path is global; CascadedSunShadow extends it to 4 cascades.

## Known issues / todo
- Textures: public/assets/textures is empty so far → all 9 terrain layers are procedural; asset sets are picked up
  automatically from manifest.json (keyword matching) on the next load.
- getSurface for forest floor and fields returns 'dirt' (no dedicated SurfaceType).
- Water depth color uses the 4 m terrain height texture (no screen-space depth); objects in water don't get foam.

## Log
- Layout: 12 locations, ~265 lots, 58 roads, 5 bridges (2 channel, 3 river), ~620 props, 41+9 vehicle spawns.
- Worker generation ~2.5-4 s on a loaded 4-core box (base relief ~1.2 s, classify ~0.8 s, map raster ~0.4 s).
- Pitfalls found: sun disc HDR overflowed half floats (Inf → NaN black frames) → disc capped; road winding;
  vite HMR reloads from other agents' edits interrupt headless runs → tools/world-vite.config.ts (hmr off).
