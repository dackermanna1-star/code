# Could You Survive Trapped Inside a Giant Industrial Freezer?

A vertical (1080x1920, 30 fps) 3D-animated science Short made in **Blender 4.5 LTS (Cycles)**, about 133 s long
(the narration ends at 130.4 s; the end card holds to the fade).

**Final video:** `output/could_you_survive_freezer.mp4` (H.264 + AAC, loudness-normalised to about −14 LUFS)

## Pipeline
1. `scripts/fetch_assets.py` – CC0 props/textures from Poly Haven. `scripts/make_textures.py` – baked frost noise, brushed steel, lens frost, phone screen.
2. `scripts/build_character.py` – MPFB/MakeHuman characters (Leo, rescuer Maya) with game-engine rig + ARKit face shapes.
3. `scripts/build_environment.py` – the walk-in freezer (collections ENV_Structure/Door/Shelving/Products/Equipment/Ice, LGT_Practicals), animatable frost overlay on every material.
4. `scripts/build_master.py` – assembles set + characters, cold-aware skin shader (pallor, cold flush, blue lips, pale fingers, goosebumps, frosted hair), thermal-camera materials, props, breath volumes; `scripts/lib_blanket.py` builds the emergency foil blanket.
5. `scripts/lib_anim.py`, `scripts/shots.py`, `scripts/build_anim.py` – CMU mocap retargeting + hand-keyed layers (fingers, face, shiver, breathing, IK contacts such as tucked hands and the rescuer's hands, in-betweens), 39 shot cameras.
6. `scripts/render_shot.py`, `scripts/render_queue.sh`, `scripts/finish.sh` – per shot: high-quality environment plate, per-frame character pass (env holdout), low-res breath-vapour pass, or thermal pass; then a fix pass, compositing and the encode.
7. `scripts/composite.py` (plate homography re-projection, shadow catcher, fog, bloom, AgX via OCIO, grade, lens frost), `scripts/overlays.py` (captions, HUD, infographics), `scripts/audio_mix.py`, `scripts/assemble.py` (encode).
8. Voice: `scripts/make_voiceover.py` (Kokoro TTS), `scripts/align_words.py` (Whisper word timings for captions).

Docs: `docs/narration.txt`, `docs/shot_list.md`, `docs/science_factsheet.md`, `docs/factcheck_report.md`, `docs/CREDITS.md`.

## How it was checked
- Science: every narration claim went through an adversarial multi-agent fact-check (researcher, skeptic, judge);
  14 of 28 items were reworded and the narration was re-voiced (`docs/factcheck_report.md`). No survival time is
  stated anywhere and the narration says "likely / may / can" where people differ.
- Picture: shots were reviewed frame by frame as they rendered (plus an independent multi-agent visual review);
  framing, pose and prop problems found that way were fixed and re-rendered.

## Limitations (honest list)
- The narrator is a synthetic voice (Kokoro-82M TTS), not a voice actor.
- Running time is about 133 s, a little over the 100–120 s target; the script needed that time to cover the
  requested science without rushing.
- To fit the CPU render budget, the character layer is rendered at 0.7× resolution and upscaled over full-resolution
  environment plates, so the character is slightly softer than the set. Plates are static per shot and re-projected
  for camera moves, so there is no parallax inside a shot.
- Motion is retargeted motion capture plus hand-keyed layers and IK (seated poses, planted feet, self-hug, hand
  contacts), not bespoke performance capture; some hand poses and contacts are approximations.
- The MakeHuman clothing deforms imperfectly in a few poses: T-shirt sleeves balloon at the shoulders when his arms
  are crossed or raised, the overall straps can stand off the shoulders, and the hands read a little like mittens
  in the tightest close-ups.
- The thermal-camera shots are stylised illustrations, not measured data; frost is exaggerated for readability.
