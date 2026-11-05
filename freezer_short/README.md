# Could You Survive Trapped Inside a Giant Industrial Freezer?

A 131-second vertical (1080x1920, 30 fps) 3D-animated science Short made in **Blender 4.5 LTS (Cycles)**.

**Final video:** `output/could_you_survive_freezer.mp4`

## Pipeline
1. `scripts/fetch_assets.py` – CC0 props/textures from Poly Haven. `scripts/make_textures.py` – baked frost noise, brushed steel, lens frost, phone screen.
2. `scripts/build_character.py` – MPFB/MakeHuman characters (Leo, rescuer Maya) with game-engine rig + ARKit face shapes.
3. `scripts/build_environment.py` – the walk-in freezer (collections ENV_Structure/Door/Shelving/Products/Equipment/Ice, LGT_Practicals), animatable frost overlay on every material.
4. `scripts/build_master.py` – assembles set + characters, cold-aware skin shader (pallor, cold flush, blue lips, pale fingers, goosebumps, frosted hair), thermal-camera materials, props, breath volumes.
5. `scripts/lib_anim.py`, `scripts/shots.py`, `scripts/build_anim.py` – CMU mocap retargeting + hand-keyed layers (fingers, face, shiver, breathing, IK contacts, in-betweens), 39 shot cameras.
6. `scripts/render_shot.py`, `scripts/render_queue.sh` – per shot: high-quality environment plate, per-frame character pass (env holdout), low-res breath-vapour pass, or thermal pass.
7. `scripts/composite.py` (plate homography re-projection, shadow catcher, fog, bloom, AgX via OCIO, grade, lens frost), `scripts/overlays.py` (captions, HUD, infographics), `scripts/audio_mix.py`, `scripts/assemble.py` (encode).
8. Voice: `scripts/make_voiceover.py` (Kokoro TTS), `scripts/align_words.py` (Whisper word timings for captions).

Docs: `docs/narration.txt`, `docs/shot_list.md`, `docs/science_factsheet.md`, `docs/CREDITS.md`.
