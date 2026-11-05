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

## Review passes

Two adversarial reviews were run on the cut (`research/prerender_review.json`, `research/final_review.json`).
Fixes after the final review:

- **Helicopter rotor:** the main rotor is split off the model by mesh island (4 blades + hub) and spins on the mast; nothing is left frozen or orbiting the fuselage.
- **Rescue (SH25–SH29):** hoist hover at ~10.5 m with the hook over him. SH27 is a water-level shot of the strop being paid out to him. SH28 is a side-on hoist with legs trailing and the cable on a chest D-ring. SH29 reels him in through the door before the helicopter leaves. Labels sit in the sky, clear of the helicopter.
- **Bodies under water (SH09, SH22, SH12, SH24):** the water surface's deep-navy base colour was tinting everything seen through it nearly black. Near the camera, transmission now uses a light tint, so skin, shirt and shorts keep their colour.
- **Face close-ups (SH12, SH24):** the camera is overhead with the face upright in frame, instead of looking up the throat. SH24 is lit by the rescue's golden evening light.
- **Other shots:** SH16 continues SH15's flat float and fish. SH17B keeps the shark's pass in frame. SH20 has readable eyes and the waterline at the collarbones. SH03's splash no longer fountains off the crown. SH18 is graded into a sunset.
- **Captions and labels:** events are split at cuts, so carried-over words take the incoming shot's position. Captions sit low in the water-level face close-ups. Word captions are dropped where the labels already show the same words.
- **Mix:** the distant rotor is audible before he looks up, and the hope cue is lined up with the hover.

## Known limitations

- **Resolution:** frames are rendered at 576×1024, or 648×1152 for close-ups, on a 4-core CPU with no GPU, then Lanczos-upscaled to 1080×1920. Fine detail is softer than a native 1080p render.
- **Character:** an MPFB2/MakeHuman figure with stylised materials. The orange T-shirt can read as a thick collar in some angles, and the eyelid redness in SH19 is strong.
- **Sound:** the music is Kevin MacLeod (CC-BY). Most SFX (helicopter, wind, heartbeat, underwater) are synthesised. Only one recorded splash is used.
- **Day-1 shots (SH01–SH15):** these were rendered with an earlier sun-azimuth mapping, kept for internal consistency.
