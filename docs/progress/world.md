# World + Rendering — progress log (key: world)

Owner dirs: `src/world/`, `src/render/`, `sandbox/world*.html`, `src/sandbox/world*.ts`, `tests/world*.test.ts`, `tools/world*`.

## Plan
1. Layout data (src/world/layout): coast, river, ridges, hills, quarry, forests, fields, locations, lots, roads, bridges, props, vehicle spawns.
2. Terrain generation in a Web Worker (src/world/terrain/generate.ts, pure + testable): 1537² heights @2 m, EDT-based coast,
   river carve, road cut/fill, lot flattening, surface/tree/cover/reserved grids, splat maps, normals, map raster.
3. Rapier heightfield + exact getHeight (same triangulation as Rapier: diagonal (x0,z1)-(x1,z0)).
4. Terrain rendering: CDLOD quadtree, single instanced grid mesh, heights by texelFetch (VTF), height-only geomorphing,
   splat material via onBeforeCompile on MeshStandardMaterial (texture arrays, anti-tiling, triplanar rock).
5. Environment: sky dome (scattering + clouds + stars + moon), time of day, weather presets + transitions, PMREM IBL,
   global height fog (ShaderChunk patch), rain.
6. Lighting: three r186 SunLight with a custom 1–4 cascade shadow (global, no per-material setup).
7. Water, roads, bridges. 8. Post-processing. 9. Map image. 10. Debug + sandbox + validation.

## Log
