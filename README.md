# Alley

A cinematic first-person walking game set in a narrow, wet, graffiti-covered
service alley at blue hour. No HUD, no UI, no crosshair, no combat. You walk.

Everything is procedural and built at load time from code: the voxel
architecture, brick relief, graffiti, props, lighting, and all of the sound.
There are no texture, model, or audio files.

## Play

```bash
npm install
npm run dev          # http://localhost:5173
```

Click once to enter (the browser needs a gesture to start audio and pointer
lock). Then:

| Input | Action |
| --- | --- |
| Mouse | Look (drag to look if pointer lock is unavailable) |
| W A S D / arrow keys | Walk |
| Shift | Brisk walk |
| F | Fullscreen |
| Esc | Pause |
| Gamepad | Left stick walks, right stick looks, L1/LB is a brisk walk |
| Touch | Left half of the screen walks, right half looks |

Look down to see your boots and the hem of your skirt. Headphones help: the
heel clicks echo between the walls, and the slap-back from the far end shortens
as you approach it.

### Build

```bash
npm run build        # dist/index.html + dist/assets, and dist/alley.html
```

`dist/alley.html` is a single self-contained file (about 0.9 MB) that runs from
any static host.

### URL parameters

| Parameter | Effect |
| --- | --- |
| `q=low\|medium\|high` | Quality preset (fog steps, reflection resolution, TAA) |
| `dpr=1` | Cap the device pixel ratio (default 1.5) |
| `fixedRes` | Disable dynamic resolution scaling |
| `exp=10` | Exposure override |

Resolution scales between 50% and 100% to hold the frame rate.

## How it is made

**Voxel world.** Every surface is built on voxel grids and meshed with a
greedy mesher that bakes per-vertex ambient occlusion
(`src/voxel/`). Architecture snaps to one brick course (6.77 cm). Props use
1.35 cm and 2.7 cm voxels, and the walker's body uses 0.9 cm voxels.

**Brick relief.** Facade faces are flat in geometry. In the fragment shader,
each face is treated as a heightfield on a 1.35 cm grid: bricks, recessed
mortar, chipped corners, and spalled faces are voxel columns, and a short 2D
DDA walks the view ray through them. Joints and chips therefore read as real
stepped geometry at grazing angles (`src/render/facadeMaterial.js`).

**Wet ground.** The floor is a stepped heightfield built from a drainage
V-profile, wandering tire ruts, potholes (with old brick pavers showing
through), patches, aprons, and drains. A priority-flood fill finds the
basins, and each basin is capped to a rain depth to make the puddles. Wet
asphalt samples a planar reflection with roughness blur and vertical streaks.
Puddles reflect sharply and ripple under drips and heels
(`src/world/ground.js`).

**Light.** The scene is lit in blue-hour sky light with warm lamps:
- A baked irradiance volume stores per-direction sky visibility from a horizon
  scan, a wall-to-wall bounce term, and lamp and window bounce.
- Spot lamps use static shadow maps, and the walker gets a soft capsule shadow.
- A PMREM capture of the alley provides image-based specular.
- Windows show interior-mapped rooms with curtains, blinds, TV flicker, and the
  occasional silhouette.

**Post.** The post pipeline runs in this order:
1. Half-resolution ray-marched volumetric fog. Spot lights are sampled through
   their real shadow maps, and steam plumes are density sources.
2. Depth-aware upsample.
3. Temporal AA with static-world reprojection.
4. Bloom.
5. AgX tone mapping with a restrained grade, vignette, grain, slight chromatic
   aberration, and dither.

**Graffiti.** A stroke font is turned into handstyles, throw-ups, pieces, and
rollers. These are layered over years of eras with buffs, posters, stickers,
drips, and fading, then sampled by the facade shader. Paint thins in mortar
joints (`src/textures/graffiti/`).

**Sound.** All sound is synthesized with the Web Audio API:
- Heel and toe impacts per surface, matched to the gait phase. Surfaces are
  wet asphalt, concrete, metal grates, puddles, and debris.
- An alley impulse response with flutter echo between the walls, plus dynamic
  slap-back from the end walls.
- HRTF emitters: condenser hum, kitchen exhaust, transformer hum, lamp buzz
  locked to the flicker, drains, and trickles.
- Muffled TV, voices, and radio behind lit windows.
- Distant traffic, sirens, an elevated train, wind gusts shared with the
  visuals, drips synced to falling droplets, and kicked cans
  (`src/audio/`).

## Layout

```
src/core      engine, frame loop, soundscape bridge, RNG/noise
src/voxel     voxel grid, greedy mesher, static batching
src/world     layout, facades, ground, irradiance, windows, wires, props
              placement, collision, ambient life, traffic, debris
src/render    materials (facade relief, voxel props), sky, post pipeline
src/player    first-person walker and the procedurally animated body
src/props     voxel prop generators (dumpsters, fire escapes, poles, ...)
src/textures  graffiti generator, weathering maps, paint atlas
src/audio     procedural audio engine
tools/        dev pages (prop preview, graffiti test, audio test)
scripts/      headless screenshot / play-test / build helpers
```
