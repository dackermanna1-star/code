# Credits and licences

*Tsutomu Yamaguchi: The Man Who Survived Both Atomic Bombs*, a vertical 3D animated short (1080×1920, 30 fps, about 128 s).

## Music (attribution required, CC BY 4.0)
Kevin MacLeod (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/
- "Heartbreaking"
- "Long Note Four"
- "Impact Lento"
- "Eternal Hope"

## Sound effects
OpenGameArt.org:
- **CC0:**
  - cicada sounds (syncopika)
  - wind1–4 (lukerustltd)
  - ambient bird sounds (isaiah658)
  - park ambiences (thimras)
  - water waves (qubodup / transitking)
  - heartbeat sounds (bart)
  - steam release sounds (bart)
  - steam boiler loop (bart)
  - steamboat engine (spring-spring)
  - breathing tired (mikeask)
  - fire crackling (antumdeluge)
  - Fantozzi's footsteps (qubodup)
  - "100 CC0 SFX" and "100 CC0 SFX #2" (rubberduck)
- **CC BY 3.0:**
  - "2 High Quality Explosions" (qubodup)
  - "Rumble/explosion" (qubodup)

I synthesised these myself: the B-29 engine drone, the tinnitus ring, the sub-bass impacts, the clock ticks and the temple bell.

## Narration voice
Generated with Kokoro-82M (hexgrad, Apache-2.0), voice `am_michael`. Pronunciation was checked with faster-whisper (MIT).

## 3D assets
- **Characters:** MakeHuman / MPFB2 for Blender (makehumancommunity.org). The base mesh and system assets (skins, eyes, hair, eyebrows, clothes) are CC0. ARKit face units and visemes come from the MakeHuman asset packs (CC0).
- **Motion capture:** CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), free for all uses, with BVH conversion by B. Hahne (cgspeed). Retargeted onto the MPFB `cmu_mb` rig and layered with hand-keyed head, spine and arm animation.
- **Props, textures and HDRIs:** Poly Haven (polyhaven.com), CC0.
  - Props: wooden crates, barrels, buckets, wicker basket, tea set, vintage suitcase, wooden table and chair, desk lamp, notepads, stationery, binder, hanging industrial lamps, wooden stool, shrub.
  - Textures: Japanese cedar planks, hinoki planks, Japanese stone wall, grey roof tiles, plastered wall, raked dirt, gravel, burned ground, dry mud, dark planks, old wooden floor, fine-grained wood, concrete, green metal rust, concrete debris.
  - HDRIs: Qwantani (mid morning, night, sunset, dusk 2), Kloofendal (48d partly cloudy, 28d misty), overcast soil.
- **Built for this production in Blender Python** (scripts in `production/scripts/`):
  - Buildings: 1940s machiya rows, streets, the Nagasaki house interior, the design office, the station, the quay.
  - Vehicles from reference dimensions: B-29 Superfortress, a D51-style steam locomotive and coaches, a Hiroden 650-style streetcar, Nagasaki's giant cantilever crane.
  - Accessories: field cap, bandages, wartime women's clothing, the infant, floating lanterns.
  - Effects: the volumetric mushroom clouds, dust, steam.
- **Procedural textures** (drawn with PIL): tanker blueprints, clock face, tatami, washi paper, smoke sprites.
- **Handbook cover lettering:** Noto Serif JP (SIL Open Font License).

## Software
Blender 4.5.3 LTS (Eevee), FFmpeg, Python (NumPy, SciPy, Pillow).

## Historical sources
See `production/research_factsheet.md`. Main references:
- Obituaries in the New York Times, The Independent and the Telegraph (January 2010)
- AP and the Mainichi on the March 2009 double certification
- AFP, NPR
- The *Niju Hibaku* documentary synopsis
- Yamaguchi's memoir excerpts
- Hiroshima City and the Nagasaki Atomic Bomb Museum (times and death tolls)
