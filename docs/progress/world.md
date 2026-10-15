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
- Layout authored (src/world/layout): 12 named locations, ~265 lots, 58 roads, 5 bridges (2 channel, 3 river),
  ~620 props, 41 land + 9 water vehicle spawns. Tests: tests/world.layout.test.ts.
- Terrain generation (src/world/terrain/gen/*) runs in a Web Worker: ~2.5-4 s on a loaded 4-core box
  (base relief 1.0-1.3 s, classify 0.5-1 s at 4 m, map raster 0.35-0.5 s). Splat/surface/tree/cover grids are 4 m;
  heights/normals/reserved/roadMask are 2 m.
- Exactness: tests/world.heightfield.test.ts proves heightAt() == Rapier heightfield raycasts (diagonal (x0,z1)-(x1,z0)).
- Rendering: CDLOD instanced terrain (1 draw call/pass), procedural layer arrays baked on GPU (asset sets auto-used
  when public/assets/textures/manifest.json lists them), water (MeshStandardMaterial ext.), roads (one merged ribbon
  mesh), bridges (merged + colliders), sky dome + PMREM IBL, SunLight with 1-4 cascades (CascadedSunShadow).
- Pitfalls found: sun disc HDR overflowed half-float (Inf -> NaN black frames) → disc capped; road winding.
