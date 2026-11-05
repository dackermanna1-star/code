# Stranded — "What happens if you're stranded in the middle of the ocean?"

A 127-second vertical (1080×1920, 30 fps) 3D animated YouTube Short, made in **Blender 4.5 (Cycles)**.

**Final video:** `output/Stranded_What_Happens_If_You_Are_Stranded_In_The_Ocean_1080x1920.mp4`

## What's in here

| Path | Contents |
|---|---|
| `story/narration.json`, `story/vo_timing.json` | Final fact-checked narration and word-level voice timings |
| `story/shots.json` | Shot list with cut times (30 shots) |
| `story/captions.ass` | Burned-in captions and on-screen labels |
| `research/fact_check.md` | Fact-check of every claim, with sources |
| `blender/scripts/build_character.py` | Builds the castaway (MPFB2/MakeHuman) with rig, ARKit face units and condition controls (wet, sunburn, fatigue, cold, salt) |
| `blender/scripts/lib/env.py` | Ocean (FFT displacement, variable-density mesh), water shading, foam, caustics, skies, grading, cameras |
| `blender/scripts/lib/char.py` | Acting library: poses, swim/tread/float cycles, IK, breathing, shivering, blinks, saccades, expressions, buoyancy from the simulated sea |
| `blender/scripts/lib/marine.py` | Fish school, shark, bubbles, marine snow, god rays, helicopter |
| `blender/scripts/shots/sh*.py` | One script per shot (camera, acting, FX) |
| `blender/scripts/render_shot.py`, `worker.sh` | Shot builder/renderer and the render queue |
| `blender/scripts/tools/` | Voice generation, sound synthesis, mix, captions, final assembly |
| `audio/` | Voiceover, music, synthesised SFX, final mix and stems |
| `docs/CREDITS.md`, `docs/youtube_description.md` | Licences/attributions and upload text |

## Reproducing

1. Blender 4.5 LTS at `/opt/blender_dl/blender-4.5.15-linux-x64/`; MPFB 2.0.18 extension plus MakeHuman asset packs (see `docs/CREDITS.md`).
2. `blender -b --factory-startup -P blender/scripts/build_character.py -- blender/assets/character.blend blender/assets/character_variant.json`
3. `/opt/tts/bin/python blender/scripts/tools/make_vo.py`, then `.../synth_sfx.py`, then `.../mix_audio.py`; and `python3 blender/scripts/tools/make_subs.py`
4. Render: list shot IDs in `render/queue.txt` and start `blender/scripts/worker.sh` (one or more workers).
5. `python3 blender/scripts/tools/assemble.py`

Large downloaded source assets (`blender/assets_src/`) and rendered frames (`render/`) are not committed.
