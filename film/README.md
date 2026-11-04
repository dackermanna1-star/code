# Minecraft: Journey to the Far Lands

A 4 minute 46 second animated short, built entirely from code in **Blender 4.5 LTS** (EEVEE).
Every block, texture, character, camera move, light change, note of music and sound effect
is generated procedurally by the scripts in this directory. There are no external assets.

Steve spawns into a sunrise meadow and walks east. He passes through forest, river, hills and a
village, where a weaponsmith gives him an iron sword. Night brings zombies, a skeleton and a
thunderstorm, and he takes shelter in a cave of glowing ores above a lava ravine. Then come snow,
desert, jungle and a desolate plain. The world starts to break apart. At last he reaches the
colossal Far Lands, where something moves in the fog. *The end... or the beginning?*

## Layout

| Path | What it does |
| --- | --- |
| `mcfilm/textures.py` | Paints the 16×16 pixel-art block and plant atlases (numpy). |
| `mcfilm/voxel.py` | Voxel world, face mesher with Minecraft-style vertex AO, tree builders. |
| `mcfilm/worldgen.py` | Generators for all 8 environments: overworld, night forest, cave, snow, desert, jungle, edge, Far Lands. The Far Lands use stretched "overflowing" noise and view-based face culling. |
| `mcfilm/characters.py` | Box-UV skins in the Minecraft layout for Steve (with wear), zombie, skeleton, villagers, animals and birds, the shadow figure, and items (sword, bow, arrows). |
| `mcfilm/blcore.py` | Materials (atlas, biome tint, AO, emission, distance/height fog), sky shader, bulk F-curve writer, render settings. |
| `mcfilm/direct.py` | Direction layer: per-frame shot functions, path following with ground snapping, gaits, footstep events, lighting presets, weather, wind. |
| `mcfilm/props.py` | Clouds, spawn sparkles, death puffs, flocks, projectiles, lightning. |
| `mcfilm/timeline.py` | The master shot list (52 shots, 6864 frames at 24 fps). |
| `seqs/*.py` | One module per environment with its shots. |
| `render.py` | Blender entry point: builds a sequence and renders its frames. |
| `audio/make_audio.py` | Original score plus SFX and ambience, synced to animation events. |
| `tools/assemble.py` | Letterbox, vignette, grain, transitions, pixel-font titles, and the audio mux into an MP4. |

## Rendering

```bash
# one sequence (frames go to build/frames/NNNNN.png, numbered on the global timeline)
xvfb-run -a blender -b --python render.py -- overworld
# quick contact sheet of a sequence
tools/stills.sh farlands
# everything, then audio, then the final film
tools/render_all.sh
```

The output is 1280×536 (2.39:1), letterboxed into a 1280×720 H.264 file with 48 kHz AAC stereo.
On a 4-core CPU with software OpenGL, a frame takes about 3 s per worker.
