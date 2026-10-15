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
- `getSurface`: exact road-edge distance (RoadQuery spatial hash of the road polylines): 'asphalt' / 'dirt' on the
  road, 'gravel' on the 1.4 m asphalt shoulder, bridge decks 'asphalt' (also reported for the ground right under a
  deck); else the 4 m surface class (grass, dirt [also forest floor/fields], mud, rock, sand, gravel, concrete; cells
  touching a road fall back to their dominant splat layer), 'water' where water. Terrain collider ColliderInfo.surface
  is just 'grass' — for terrain hits call `ctx.world.getSurface(hit.point.x, hit.point.z)`.
- `getWaterHeight`: sea/river/channel (sea level + the same Gerstner waves the shader renders, attenuated near shore
  and in rivers) and ponds (their own level; organic outlines from `layout/pondShape.ts`). null on dry land.
- `getTreeDensity` (0 on roads/lots/water/beach/fields/towns, forests 0.6-0.9, meadows ~0.04),
  `getGroundCover` (fields 1, meadows ~0.7-0.9, forest floor ~0.4, plowed 0.12, roads/sand/rock 0),
  `isReserved(x,z,margin)` (distance field to roads, bridges, lot footprints and prop footprints; margins ≤ 25 m).
- `World.reservedDistance(x,z)`, `World.surfaceClass`, `World.waterLevelAt`, `World.layout` (full authored data:
  fields, forests, ponds, river, ridges, bridges with `deckY`, ground patches…).
- `lots[]`: BuildingLot with `groundY` = flattened pad height (terrain is flat at groundY over footprint + 2.9 m;
  lots whose padded footprints overlap are clustered and share one groundY, so neighbouring pads never fight).
  Front door faces local +Z rotated by rotationY (lots along streets face the street).
- `props[]`: kinds + nominal footprints in `PROP_FOOTPRINTS` (src/world/layout/propFootprints.ts, re-exported by props.ts).
  Linear props (fences/walls/rails) are split where a road or the river crosses them (gaps = road edge + 1.5 m), so a
  fence never blocks a road; their `y` is the ground at the centre only — sample the terrain along long fences:
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
- Render order: sky 1000 (opaque list, drawn after all opaques so early-z skips covered pixels; on the far plane,
  no depth write; below the horizon it renders the open sea out to the true horizon), roads -1 (transparent, no
  depth write), water 1 (transparent), rain 10 (drops are culled under building roofs, see RainOcclusion).
- Camera: the world system's lateUpdate sets `camera.far` (view distance, wider with altitude) and grows
  `camera.near` from the engine's 0.05 up to 0.4 between 60 and 400 m above ground (plane/freefall: depth precision
  so low land and the sea don't z-fight). If another module sets `camera.near`, that value becomes the base.
- Physics timing: the terrain heightfield is raycastable only after the first physics step (Rapier registers new
  colliders in its query structures during `step`); during install use `ctx.world.getHeight` instead.

### Debug helpers (window.__game)
`teleport(x,z[,y])`, `debugCam(x,y|null,z,yawDeg,pitchDeg)` (sets debugState.freeCam), `debugCamOff()`,
`flycam(on)`, `setTime(h)`, `setWeather(w[,seconds])`, `screenshotTour()` (viewpoints for towns/bridges/coast),
`worldInfo([x,z])`, `renderStats()`, `terrainDebug(mode)` (1 flat albedo, 2 weights, 4 normals, 12 terrain normal…),
`showTerrainLayers(on,'albedo'|'normal')`. Note: in the full game the characters module registers its own
`teleport` after the world, which wins; `debugCam`/`flycam` are world-only and work in both.
Sandbox: `/sandbox/world.html?time=19.5&weather=fog&preset=low&nopost=1&texres=512&modules=buildings,vegetation`.
Tools: `tools/world-shot.mjs` (multi-view screenshots, `--views "name:x,y,z,yaw,pitch;..."`, `--tour`, `--map out.png`),
`tools/world-preview.ts` (node map preview, `npx vite-node tools/world-preview.ts out.png`),
`tools/world-vite.config.ts` (HMR-free dev server for long headless runs), `tools/world-perf.mjs` (draws/tris per
view & config), `tools/world-functional.mjs` (end-to-end checks: queries, collider agreement, weather/time, map).

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
  blended, hex-tiling anti-tiling (Mikkelsen) + world-space breakup, triplanar rock, per-pixel terrain normals + detail normals, macro variation, wetness, cloud
  shadows.
- Why not CSM.js: it needs `setupMaterial` on every material (unregistered materials get lit N times). r186 SunLight
  path is global; CascadedSunShadow extends it to 4 cascades.

## Known issues / todo
- Textures: public/assets/textures is empty so far → all 9 terrain layers are procedural; asset sets are picked up
  automatically from manifest.json (keyword matching) on the next load.
- getSurface for forest floor and fields returns 'dirt' (no dedicated SurfaceType).
- Water depth color uses the 4 m terrain height texture (no screen-space depth); objects in water don't get foam.

## Performance (tools/world-perf.mjs, headless Chromium + SwiftShader, 640x360, preset high)
- Town at ground level, full world: 55 draws / 0.91 M tris (102 terrain nodes in one instanced draw + shadow prefixes).
- Terrain + water + sky + post only: 43 draws / 0.63 M tris; no shadows: 43 / 0.56 M; no post: 21 / 0.70 M.
- Plane view at 600 m: 51 draws / 0.49 M tris (camera.far grows with altitude, LOD ranges keep node count ~50).
- Draw/triangle counts are resolution-independent; the box has no real GPU (SwiftShader fps is meaningless), so the
  60 fps @1080p GTX 1660 target is unverified here — draw/tri budget (≤150 draws, ~1.5 M tris) is met.

## Log
- Layout: 12 locations, ~265 lots, 58 roads, 5 bridges (2 channel, 3 river), ~620 props, 41+9 vehicle spawns
  (after the QA pass: 264 lots, 638 props — fences split at roads; same 50 spawns).
- Worker generation ~3.3 s warm / 4-6 s cold on a loaded 4-core box (base relief ~1.2 s, classify ~0.8 s, map raster ~0.4 s).
- Pitfalls found: sun disc HDR overflowed half floats (Inf → NaN black frames) → disc capped; road winding;
  vite HMR reloads from other agents' edits interrupt headless runs → tools/world-vite.config.ts (hmr off).
- Final validation: tsc clean (whole project), 27 vitest tests (tests/world*.test.ts), tools/world-functional.mjs (25 end-to-end in-browser checks) all
  PASS (getHeight vs Rapier collider max err ~1e-4 m over 400 rays), 36-view screenshot tour (towns aerial+street,
  bridges, beach, quarry, summit, forest edge, river valley, island overview) reviewed; gravel recipe reworked from
  "paving" look to loose mixed-size gravel after the tour.
- Tour fixes: asphalt gravel shoulders moved from the 4 m splat (aliased into regular white spots along roads)
  into the road ribbon (per-vertex shoulder factor, off on bridge decks and where other roads join); far-view
  z-fighting of the sea plane over low land fixed (water discards where the terrain is above the surface, margin
  shrinking with distance, + near-plane growth with altitude); out-of-map water no longer smears the edge texels
  into bands (seabed keeps sloping down); cliff-foot deep water blends back into the shelf (was a dark slab from the
  air); whitecap foam only with wind (clear weather open sea had big white cellular blotches).

## QA pass (independent QA + fix, 2026-10-15)
Method: code review of src/world + src/render, data analysis of the generated world against the terrain
(`npx vite-node tools/world-qa-analyze.ts`, `tools/world-qa-bprof.ts`), regression tests (`tests/world.qa.test.ts`),
in-browser functional checks (`node tools/world-functional.mjs`, extended), the full game with the real player
character (`node tools/world-qa-game.mjs http://localhost:5301 <outDir>`), and ~40 reviewed screenshots
(`tools/world-shot.mjs`, views now accept `name:x,y,z,yaw,pitch@time@weather`).

Defects found and fixed:
- **Fences/walls across roads** (13 cases: military perimeter, power-plant and school fences, prison wall, farm yards):
  `LayoutBuilder.linearProp` now splits linear props where a road (edge + 1.5 m) or the river crosses them.
- **Bridge ends**: a 0.6-1.4 m dip/step between the deck end and the approach ramp on 4 of 10 ends (roads carved later —
  junctions, farm tracks — overwrote the ramp; the valley was left open under the last metres of the deck). The last
  2 deck samples are now filled as an embankment just under the slab, later roads never re-carve an earlier road's
  core, and a final pass re-asserts each bridge road over its deck ends + 24 m ramps. Verified by the player walking
  on and off every deck end in the full game.
- **Road grade spikes** of 24-25 % on highways A1/A2 where side streets joined (same root cause) → now ≤ 8.5 % + blends.
- **Vehicle spawn inside a fence**, **water tower standing in the river**, **ruin wall across the road**: spawns check
  props/river/coast and slide along the road; farm water towers and ruin walls use clearance checks.
- **Steep banks in front of doors** on hillside lots (up to 3 m drop 3 m from the door): lot skirts widen with the
  height difference (9 → 22 m).
- **getSurface** reported 'asphalt' up to ~3 m off the road (2 m mask / 4 m class cells) and 'concrete' on bridge
  decks: exact road-edge queries (RoadQuery), 'gravel' on the rendered shoulder, decks 'asphalt'.
- **isReserved(x, z, margin ≥ 25.5)** returned true for the whole map (saturated distance field).
- **setTimeOfDay(NaN)** (e.g. `?time=abc`) turned all lighting into NaN: ignored now; non-finite timeSpeed reset.
- **Cliffs were grassy slopes with a regular comb of grooves** (EDT staircase error ×2 on steep faces): cliffs use the
  exact distance to the island outline and a steep craggy rock face with a narrow foot.
- **Perfectly circular ponds** with a hard pale edge: organic lobed outlines (`layout/pondShape.ts`, shared by
  carving, classification, map raster, water mesh and getWaterHeight); pond water uses the terrain depth for a soft
  shore.
- **Water looked tropical** (bright cyan river/ponds/channel): colder, darker sea; darker olive fresh water.
- **Grey band between the clipped ocean and the sky** from the plane / high altitude: the sky dome renders the open
  sea (fresnel sky reflection + height fog) below the horizon; IBL bake keeps a ground-coloured lower hemisphere.
- **Road paint/grit aliasing** (white dotted lines along every road at distance, sparkling pebbles, moiré slab joints):
  box-filtered markings and dashes, footprint-faded grit/pebbles/joints.
- **Foam rings** around the island from altitude: shore/whitecap foam fades with distance; beach sand toned down.
- **Rain fell inside buildings**: RainOcclusion roof-height map (from IBuildings.buildings lots + bounds) culls drops
  under roofs (active as soon as the buildings module lists buildings).
- **1-frame lag** of water/rain/underwater fog behind the camera rig: moved to the world's lateUpdate.
- Perf/alloc: sky drawn after opaques (early-z skips covered pixels; was full-screen first), allocation-free terrain
  node sort, no per-frame allocations in the fly camera / DOF focus ray.

Known remaining (not fixed):
- 60 fps @1080p on a GTX 1660 is still unverified (SwiftShader only); draw/triangle budgets re-measured below.
- No terrain texture / HDRI assets exist yet → all ground layers procedural.
- Cliff faces lit at grazing sun angles show bright V-shaped patches where sunlight passes notches in the cliff top
  (physically plausible, slightly regular).
- Under a bridge deck getSurface reports the deck ('asphalt') because the query has no height.
- Long fences (military perimeter 170-200 m pieces) cross 7-13 m of relief: the props module must conform them to the
  terrain (PropPlacement.y is the ground at the centre only).
