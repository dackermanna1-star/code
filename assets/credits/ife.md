# In-flight entertainment (src/ife) — asset credits

## Films (assets/video/*.mp4, stills in assets/ife/stills/)

All films are open movies by the Blender Foundation, licensed under the
Creative Commons Attribution 3.0 licence (https://creativecommons.org/licenses/by/3.0/).
They were re-encoded for the seatback screens (H.264 Constrained Baseline, 480 px wide,
CRF 28 / max 450 kbit/s, AAC-LC 48 kbit/s stereo, +faststart). Still frames (used for posters,
backdrops and thumbnails) were extracted with ffmpeg. The IFE detail pages show the credit and
licence text for every title.

| File | Title | Credit | Source |
|---|---|---|---|
| big_buck_bunny.mp4 | Big Buck Bunny (2008) | © copyright 2008, Blender Foundation, www.bigbuckbunny.org — CC BY 3.0 | https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip |
| sintel.mp4 | Sintel (2010) | © copyright Blender Foundation, durian.blender.org — CC BY 3.0 | https://archive.org/details/Sintel (sintel-2048-stereo_512kb.mp4) |
| caminandes_1.mp4 | Caminandes: Llama Drama (2013) | © Blender Foundation, caminandes.com — CC BY 3.0 | https://archive.org/details/Caminandes1LlamaDrama |
| caminandes_2.mp4 | Caminandes: Gran Dillama (2013) | © Blender Foundation, caminandes.com — CC BY 3.0 | https://download.blender.org/demo/movies/caminandes_gran_dillama.mp4.zip |
| caminandes_3.mp4 | Caminandes: Llamigos (2016) | © Blender Foundation, caminandes.com — CC BY 3.0 | https://archive.org/details/CaminandesLlamigos |

## Self-generated (CC0, part of this project)

* `assets/ife/map/day.jpg`, `night.jpg`, `geo.json` — fictional moving-map geography (shaded relief,
  coastlines, lakes, night lights, city names) generated procedurally with Python/numpy for this project.
* `assets/ife/catalog.json` — catalogue metadata; synopses written for this project.
* Music: all albums ("Cirrus", "Cabin Pressure", "Blue Hour Trio", "Études in Motion") are original
  generative compositions synthesised live with Web Audio (src/ife/media/music.js); album art is drawn procedurally.
* All UI artwork, icons, the Halcyon Airways logo, safety-briefing illustrations and posters are drawn
  procedurally on canvas at runtime.
* Fonts: system UI fonts only (no font files are bundled).
