# Tsutomu Yamaguchi: The Man Who Survived Both Atomic Bombs

A vertical 3D-animated historical short made in Blender 4.5.3 LTS.

## Deliverables
| File | What it is |
|---|---|
| `output/yamaguchi_short.mp4` | **Final video.** 1080×1920, 30 fps, 127.6 s, H.264 two-pass at about 5.9 Mbit/s, AAC 192 kbit/s, 94 MB. The subtitles are burned in. |
| `output/yamaguchi_short.en.srt` | Separate English subtitle file for upload. |
| `project/yamaguchi_master.blend` | **Master Blender project.** The edit scene `EDIT_Yamaguchi_Short` links all 28 shot scenes in the Video Sequencer, in story order, with the final mix, the muted narration, music and effects stems, subtitle text strips, and the final MP4 as a muted reference strip. |
| `project/seq_*.blend` | Sequence files holding the shot scenes: sets, characters, animation, cameras, lights, FX and compositor. They are compressed, and every texture and HDRI is in `project/assets/` with relative paths. Open any shot scene and render it, or render the master edit. |
| `audio/` | Final mix (`mix.wav`), stems, and narration clips with word timings. |
| `research_factsheet.md`, `narration.json` | Verified historical fact sheet with sources, and the narration script. |
| `CREDITS.md` | Every external asset and its licence. Kevin MacLeod's music (CC BY 4.0) requires attribution in the video description. |

A higher-bitrate version (CRF 17, 493 MB) is too large for GitHub. It can be rebuilt from the renders with `scripts/post.py`.

## Story (28 shots, chronological)
1. **Hook:** Yamaguchi on a Hiroshima street, then bandaged in Nagasaki.
2. **Before the trip:** designing tankers at Mitsubishi in Nagasaki. In May 1945 he leaves his wife and baby son for a three-month assignment in Hiroshima.
3. **6 August, Hiroshima:** the streetcar, then 8:15. A lone B-29 and two parachutes, the flash, and the blast wave.
4. **Aftermath:** burned and deafened in the dust. The cloud over the city (about 140,000 dead by the end of 1945). The night with his two colleagues.
5. **Journey home:** the train to Nagasaki on 7 August.
6. **9 August, Nagasaki:** back at work in bandages. His supervisor doesn't believe him, and at 11:02 the same white light fills the room ("I thought the mushroom cloud had followed me from Hiroshima").
7. **Survival:** his wife and son survive. About 74,000 people in Nagasaki do not.
8. **Later life:** decades of silence, then the UN in 2006 and the 2009 double certification. He died in 2010. The film closes with floating lanterns and an end card.

The forgotten-hanko story, the river swim and the "dignity" quote are left out because they could not be verified. See the fact sheet.

## How it was made
- **Characters:**
  - MakeHuman / MPFB2 humans: Yamaguchi at three ages, his wife and infant, his supervisor, colleagues and extras.
  - ARKit face units for expressions and blinks, visemes for speech.
  - Period wardrobe recolours and hand-built accessories: field cap, bandages, swaddled infant.
- **Animation:**
  - CMU motion capture retargeted from its T-pose onto the A-pose rig in world space (`scripts/anim.py`).
  - Hand-keyed additive layers on top: looks, bows, recoils, drafting strokes, a head-shake of disbelief, breathing.
  - Cameras keyed with handheld and impact shake.
- **Environments:** built by script.
  - Hiroshima street, field ruins, the Mitsubishi design office, the Nagasaki house, the station, the Nagasaki quay.
  - 1:100-scale city vistas with volumetric mushroom clouds, and the UN hall.
  - Poly Haven props, textures and HDRIs throughout.
- **Rendering:**
  - Eevee in software (no GPU in this environment) at 576×1024 with 3–4 samples; about 7.5 h for 3,829 frames.
  - `scripts/post.py` upscales to 1080×1920, grades, adds bloom, vignette and grain, and draws the titles and word-timed subtitles.
- **Audio:**
  - Kokoro-82M narration, checked with Whisper.
  - Kevin MacLeod score, CC0 and CC BY effects, and synthesised drone, ringing, sub-bass, clock and temple bell.
  - Ducked under the narration, −16 LUFS integrated.

Rebuild order: `timeline.py` → `shots_*.py` (builds `blend/`) → `render_queue.sh` → `mix_audio.py` → `post.py` → `package_project.py`.

## Known limitations
- **Characters:** MakeHuman humans, not bespoke hand-sculpted stylised characters. Mocap hands are stiff, and facial performance is limited to blend-shape expressions.
- **Resolution:** a software renderer forced a 576×1024 render that is upscaled to 1080×1920. Fine detail is softer than a native GPU render.
- **Weaker shots:** a few shots are simpler than the rest, notably the station, the blast-wave dust and the damaged-house reunion.
- **Narration:** synthetic TTS, not a human voice actor.
