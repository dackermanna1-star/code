# Credits & licenses

## Characters
- **MakeHuman / MPFB 2.0.18** (MakeHuman Community) — base meshes, `game_engine` rig, skins, clothes
  (`male_worksuit01`, `female_casualsuit01`, shoes), hair, eyebrows, eyes; **CC0** system assets.
- **MakeHuman face units (faceunits01)** — ARKit-style facial shape keys, CC0.

## Motion capture
- **Carnegie Mellon University Graphics Lab Motion Capture Database** (mocap.cs.cmu.edu), BVH conversion by
  B. Hahne (cgspeed), mirrored at github.com/una-dinosauria/cmu-mocap. Free for all uses.
  Clips: 79_68 (cold), 80_41/80_42 (freezing), 82_16 (bang on high object), 90_17 (banana-peel slip),
  111_36 (walk and carry), 79_80 (handheld device), 91_09 (drunk walk), 91_14 (depressed walk),
  111_06 (get up from floor), 82_05 (sitting on ground), 22_03/23_03 (sit & kneel-comfort pair),
  23_01/22_01 (pulled up & walk pair). Retargeted, then hand-layered (fingers, face, shiver,
  breathing, IK hand contacts, look/startle layers, sit-down and slump in-betweens).

## Environment props & textures — Poly Haven (polyhaven.com), **CC0**
cardboard_box_01, plastic_crate_01, plastic_crate_03, industrial_pastic_container, plastic_container,
WetFloorSign_01, crowbar_01, hand_truck, utility_box_01, security_camera_01, industrial_wall_lamp, wooden_crate_01;
textures box_profile_metal_sheet, factory_wall, concrete_floor_worn_001, metal_plate.
Freezer-specific hardware (wire shelving, pallet racking, evaporator & fans, insulated door with ice-jammed
safety release, temperature display, pipes, icicles, ice) modelled procedurally for this project.

## Voice
- Narration synthesised with **Kokoro-82M** (Apache-2.0) via kokoro-onnx, voice `am_michael`.
- Word timings for captions from **faster-whisper** (MIT).

## Music — Kevin MacLeod (incompetech.com), licensed under **Creative Commons: By Attribution 4.0**
- "Interloper" — http://creativecommons.org/licenses/by/4.0/
- "Echoes of Time v2" — http://creativecommons.org/licenses/by/4.0/

Suggested YouTube description credit:
> Music: "Interloper" and "Echoes of Time v2" by Kevin MacLeod (incompetech.com), licensed under CC BY 4.0.

## Sound effects — Mixkit (mixkit.co), **Mixkit Sound Effects Free License**
Industrial hum loop, refrigerator hum, storm wind atmosphere, prison metal door close, shut and lock,
furnace door lever, industrial metal sliding door, wood hard hit, hitting metal armor, meat hit,
footsteps on frozen ground, body impact falling, falling hit on gravel, knocking sub bass, human single
heart beat, strong breathing, male scared effort breathing, sleep breathing, campfire crackles (as frost
crackle), cloth slide, click sounds, dropping keys, whooshes, thriller impact swell, suspense cinematic impact,
cinematic impact echo, drone terror ambience, office ambience. Teeth chatter, foil-blanket crinkle and the
tinnitus tone are synthesised in `scripts/audio_mix.py`.

## Fonts
- Montserrat, Roboto Mono — SIL Open Font License 1.1 (Google Fonts).

## Software
Blender 4.5.15 LTS (Cycles), OpenColorIO (Blender AgX config), OpenCV, NumPy, Pillow, FFmpeg.
