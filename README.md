# Minecraft: Photorealistic Physics Edition (fan recreation)

A private, non-commercial fan recreation of Minecraft that runs in the browser. The gameplay, world
structure, blocks, items and progression follow Minecraft, while the presentation is rebuilt with a
modern deferred HDR renderer and realistic physics.

> Not affiliated with or endorsed by Mojang Studios or Microsoft. No Minecraft assets are used;
> every texture, model, sound and piece of music is generated procedurally at runtime.

## Running

Requirements: Node.js 20+ and a desktop browser with WebGL2 (Chrome, Edge or Firefox). A dedicated
GPU is strongly recommended.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build in dist/ (then: npm run preview)
npm test           # unit tests
```

On first launch the game generates all block materials on the GPU (a few seconds), builds the
atmosphere lookup tables and pre-renders the most common sounds.

## Controls (Minecraft defaults)

| Action | Key |
|---|---|
| Move / jump / sneak / sprint | `W A S D` / `Space` / `Shift` / `Ctrl` (or double-tap `W`) |
| Break / attack | Left mouse |
| Place / use | Right mouse |
| Pick block | Middle mouse |
| Hotbar | `1`–`9`, mouse wheel |
| Inventory | `E` |
| Drop item (stack) | `Q` (`Ctrl+Q`) |
| Swap hands | `F` |
| Perspective | `F5` |
| Debug overlay | `F3` |
| Hide HUD | `F1` |
| Chat / command | `T` / `/` |
| Fly (creative) | double-tap `Space` |
| Zoom | `C` |
| Pause | `Esc` |

## Graphics

* Deferred PBR pipeline (WebGL2, HDR): cascaded soft shadows (PCSS), screen-space ambient occlusion,
  coloured block light propagation (RGB flood fill) with smooth per-vertex lighting, physically based
  sky (Hillaire atmosphere LUTs) with volumetric clouds, moon phases and stars, aerial perspective,
  volumetric god rays, water with screen-space reflections, refraction, absorption, caustics and
  foam, rain wetness and puddles, TAA, bloom, auto exposure, ACES tonemapping and lens flare.
* Blocks keep the voxel grid but are rendered with bevelled edges, parallax-occlusion-mapped
  procedural materials (albedo, normal, height, roughness, metalness, emission, subsurface) in
  Minecraft's colour language, grass tufts and leaf foliage cards that sway in the wind.
* Distant terrain LOD renders the landscape far beyond the loaded chunks.
* Quality presets (Low / Medium / High / Ultra), render distance, render scale and texture
  resolution are in **Options**.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for contracts, the rendering pipeline and the game-layer APIs.

```
src/core      math, noise, RNG, input, worker pool
src/world     blocks, chunks, light engine, fluids, world generation (workers)
src/render    mesher, deferred renderer, materials, sky, post-processing, LOD
src/entity    entities, player, items, projectiles, mobs
src/game      game loop, interaction, combat, placement, systems
src/ui        HUD and menus
src/audio     procedural audio engine and generative music
debug/        standalone test pages (render, materials, sky, audio ...)
tools/        headless screenshot tool, world map renderer, audio checks
```
