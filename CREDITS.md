# Asset credits

Generated from `assets/credits/*.md` (one file per module). Three.js is MIT licensed (vendor/three/LICENSE).

---

# Airport module – asset credits

| Asset | Source | License | Used for |
|---|---|---|---|
| Asphalt015 (1K JPG: color, normal GL, roughness) | ambientCG – https://ambientcg.com/get?file=Asphalt015_1K-JPG.zip | CC0 1.0 | `assets/textures/airport-asphalt/` – runway, taxiways, landside roads |
| Concrete034 (1K JPG: color, normal GL, roughness) | ambientCG – https://ambientcg.com/get?file=Concrete034_1K-JPG.zip | CC0 1.0 | `assets/textures/airport-concrete/` – apron slabs, pads, building concrete |

Both sets were renamed to `color.jpg / normal.jpg / roughness.jpg` and recompressed (JPEG q82).

Everything else in the airport module is procedural / self-generated (CC0):
runway & taxiway markings (shader), stand markings, runway numerals, signs, VDGS display,
car-park bays and chain-link fence (canvas textures), terminal interiors (parallax
"interior mapping" shader), noise textures, all geometry (terminals, tower, hangars,
jet bridges, ground support equipment, ramp crew, cars).

---

# Audio module (src/audio/, assets/audio/)

## Self-generated (original work, no external samples)

* **All aircraft, airport and foley sounds** (engines, APU, packs, airflow, rolling, gear, flaps, PTU,
  brakes, touchdown, rattles, bins, trays, belts, lavatory, galley, doors, footsteps, chimes...) are
  synthesised at runtime by `src/audio/aircraft.js` and `src/audio/foley.js` (oscillators, filtered
  noise and modal-resonator synthesis). No sample libraries are used.
* **Boarding music** (`src/audio/music.js`): original generative composition, synthesised at runtime.

## Announcements (`assets/audio/announcements/*.ogg`)

Pre-rendered from the script in `src/flight/announcements.js` with the offline neural TTS
[Piper](https://github.com/rhasspy/piper) (MIT licence) using `src/audio/tools/gen_announcements.py`,
then processed with ffmpeg (PA band-limiting, saturation, compression, small reverb).
Voice models from https://huggingface.co/rhasspy/piper-voices :

| Speaker | Piper voice | Training data | Licence (per the voice's MODEL_CARD) |
|---|---|---|---|
| Captain (male) | `en_US-norman-medium` | LibriVox recordings, dataset by Bryce Beattie (https://brycebeattie.com/files/tts/) | Public domain |
| Purser (female) | `en_US-ljspeech-high` | LJ Speech Dataset by Keith Ito (https://keithito.com/LJ-Speech-Dataset/), LibriVox recordings | Public domain |

The rendered speech is therefore free of third-party rights; credit is given to the Piper project,
Bryce Beattie (norman voice), Keith Ito / LJ Speech and the LibriVox volunteers.

---

# Cabin module — asset credits

All external textures are **CC0 1.0** (public domain) from [ambientCG](https://ambientcg.com) (1K JPG sets),
resized/recompressed (and partly recoloured / combined with procedural patterns) by `src/aircraft/cabin/tools/make_textures.py` (run: `python3 make_textures.py <extracted-downloads-dir> assets/textures`).

| Folder | Source | License | Use |
|---|---|---|---|
| `assets/textures/cabin-carpet/` | ambientCG **Carpet012** — https://ambientcg.com/get?file=Carpet012_1K-JPG.zip | CC0 | fibre colour/normal/roughness/AO; the Halcyon airline pattern (navy/teal diamonds, gold flecks) is procedurally composited on top |
| `assets/textures/cabin-fabric/` | ambientCG **Fabric030** — https://ambientcg.com/get?file=Fabric030_1K-JPG.zip | CC0 | class-divider curtain (recoloured navy), bin interior felt normal |
| `assets/textures/cabin-plastic/` | ambientCG **Plastic010** roughness — https://ambientcg.com/get?file=Plastic010_1K-JPG.zip | CC0 | wipe/smudge roughness variation; stipple normal + colour mottling are procedural (FFT noise) |
| `assets/textures/cabin-metal/` | ambientCG **Metal032** — https://ambientcg.com/get?file=Metal032_1K-JPG.zip | CC0 | aluminium trims, thresholds, curtain track |
| `assets/textures/cabin-vinyl/` | procedural (numpy) | self-generated, CC0 | galley / door-area non-slip vinyl floor |

Everything else (sidewall seams & scuffs, dado louvres, PSU faces, passenger signs, EXIT signs, placards,
airline logo panel, window shade, acrylic scratches, floor AO) is drawn procedurally on canvases at runtime
(`src/aircraft/cabin/textures.js`).

---

# City & settlements module — asset credits

The city module (`src/world/city/`) uses **no external assets**. Everything is generated at runtime:

| Content | How it is made |
|---|---|
| Building facades (curtain walls, punched / ribbon windows, residential, industrial, shop fronts) | Procedural GLSL in `materials.js`: analytically box-filtered window grids driven by per-vertex facade coordinates, PBR glass (sky reflections from the scene environment map), mullions, spandrels, grime; per-window night lighting (warm / cool / TV flicker, lit office floors) |
| Roofs (flat membrane / gravel, clay tiles, asphalt shingles), lawns, pools, containers | Procedural GLSL (value noise + filtered stripes) |
| Roads, lane markings, railway, pier boards, street-light pools | Procedural GLSL in `createRoadMaterial` |
| Houses, barns, boats, trees, palms, conifers | Procedural unit meshes (`shapes.js`), custom GPU instancing |
| Towers, mid-rises, port (cranes, ships, stacks), marina, pier + Ferris wheel, stadium, church, water tower, grain elevator, pylons, wind turbines | Procedural geometry (`buildings.js`, `landmarks.js`, `departure.js`) merged per region |
| Traffic (cars, trucks, buses, freight trains) and their lights | GPU-animated instances along road splines stored in a float texture (`traffic.js`) |
| Street lights, warning lights, yard lights | Additive point sprites (`roads.js`, `materials.js`) |
| Sun shadows of buildings / houses / trees | Projected shadow geometry (`shadows.js`) |

Layout data comes from the shared geography contract (`src/world/geo.js`) and the airport layout
(`src/world/layout.js`). No third-party code or data was copied.

---

# Clouds & weather module — asset credits

No external assets are used by the clouds module. Everything is generated procedurally at startup:

| Asset | Source | License |
|---|---|---|
| 3D base cloud noise (Perlin-Worley + Worley fBm, 128³ / 64³ at low quality) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated (project license) |
| 3D detail/erosion noise (Worley fBm, 32³) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated |
| Cirrus / cirrostratus texture (512²) | generated on the GPU (`src/world/clouds/noise.js`) | self-generated |
| Weather / coverage map (256², 4 channels) | generated on the CPU (`src/world/clouds/noise.js`) | self-generated |

Techniques follow published real-time cloud rendering work (Schneider & Vos, "The real-time volumetric
cloudscapes of Horizon Zero Dawn", SIGGRAPH 2015; Hillaire, "Physically Based Sky, Atmosphere and Cloud
Rendering in Frostbite", 2016; Wrenninge et al., multiple-scattering octave approximation). No code was copied.

---

# Environment module — asset credits

All external textures are **CC0 1.0 (public domain)** from [ambientCG](https://ambientcg.com)
(Lennart Demes). Downloaded as 1K-JPG sets, renamed and recompressed (JPEG q82) for this project.

| Folder | Source asset | URL | License | Maps used |
|---|---|---|---|---|
| `assets/textures/env-grass/` | Grass 004 | https://ambientcg.com/view?id=Grass004 (https://ambientcg.com/get?file=Grass004_1K-JPG.zip) | CC0 | color, normal (GL) |
| `assets/textures/env-dirt/` | Ground 103 | https://ambientcg.com/view?id=Ground103 (https://ambientcg.com/get?file=Ground103_1K-JPG.zip) | CC0 | color, normal (GL) |
| `assets/textures/env-rock/` | Rock 030 | https://ambientcg.com/view?id=Rock030 (https://ambientcg.com/get?file=Rock030_1K-JPG.zip) | CC0 | color, normal (GL) |
| `assets/textures/env-sand/` | Ground 054 | https://ambientcg.com/view?id=Ground054 (https://ambientcg.com/get?file=Ground054_1K-JPG.zip) | CC0 | color |
| `assets/textures/env-meadow/` | Ground 037 | https://ambientcg.com/view?id=Ground037 (https://ambientcg.com/get?file=Ground037_1K-JPG.zip) | CC0 | color |

Generated at runtime (no external data): atmosphere LUTs (transmittance / multiple scattering after
Bruneton 2017 and Hillaire 2020 — algorithms, no code copied), sky-view LUT, procedural noise, macro-relief
and ocean-wave normal textures, star field, moon.

---

# Exterior aircraft module – asset credits

All exterior textures are generated procedurally at runtime (HTML canvas) by
`src/aircraft/exterior/textures.js` and `src/aircraft/exterior/liveries.js`:

* wing atlas (paint, panel lines, rivet rows, access panels, walkway, LE erosion,
  hydraulic grime, winglet paint) – colour, normal (from a height canvas) and
  roughness/metalness maps
* nacelle paint, inlet/fan details, spinner swirl, fan blur disc, reverser cascades
* tyres, stencil decal sheet (NO STEP, EXIT, walkway…), contrail puffs (shader)
* fictional liveries: Halcyon Airways, Northwind, Solaris, Coral Air, Atlas Cargo,
  Meridian Blue (all invented – no real airline branding)

No external image, model or font files are used by this module (text uses the
browser's built-in sans-serif / serif fonts).

Geometry is fully procedural (planform/airfoil lofting, lathes, lofts) and based on
public Boeing 737-800 dimensions from `src/core/constants.js`.

---

# Flight director (src/flight/)

No external assets. All motion, aerodynamics, engine and journey models are original code.
Fictional route data (Cedar Bay CBY -> Port Solano PSX, coordinates, times) is invented.

---

# Galley module — asset credits

External source textures are **CC0 1.0** (public domain) from [ambientCG](https://ambientcg.com) (1K JPG sets),
combined with procedural (numpy) brushing / stipple and recompressed by
`src/aircraft/galley/tools/make_textures.py` (run: `python3 -I make_textures.py <extracted-downloads-dir> assets/textures`).

| Folder | Source | License | Use |
|---|---|---|---|
| `assets/textures/galley-steel/` | ambientCG **Metal012** roughness (smudges) — https://ambientcg.com/get?file=Metal012_1K-JPG.zip ; brushing, scratches, colour and normal are procedural | CC0 | brushed stainless: galley inserts, work decks, carts, sinks, thresholds |
| `assets/textures/galley-laminate/` | ambientCG **Plastic013A** colour + roughness — https://ambientcg.com/get?file=Plastic013A_1K-JPG.zip ; stipple normal procedural | CC0 | textured laminate of galley monuments, lavatory walls, door linings, closet |

Everything else is generated at runtime (`src/aircraft/galley/textures.js`, self-made, CC0):
placard atlas (lavatory / galley / door / flight-deck / crew placards, cart branding of the fictional
Halcyon Airways, magazine covers, keypad face, circuit-breaker panel), glow atlas (lit signs, LEDs,
oven timers, diffusers), fabric weave normal map and the forward attendant panel touchscreen.

---

# HUD / menus — credits

| Asset | Source | License |
|---|---|---|
| `assets/ui/fonts/inter-var.woff2` — **Inter** variable typeface (Latin subset) by Rasmus Andersson | https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.0.16/files/inter-latin-wght-normal.woff2 (Fontsource packaging of https://rsms.me/inter) | SIL Open Font License 1.1 |

Everything else in the interface (Halcyon Airways logo, boarding pass, barcode, icons, seat map) is drawn
procedurally as SVG/CSS in `src/ui/` — self-made, CC0.

---

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

---

# Player module (src/player/) – credits

No external assets are used. All camera motion, head bob, motion-feel noise and
cinematic camera logic are original code written for this project.

---

# Seats module – asset credits

| Asset | Source | License | Use |
|---|---|---|---|
| `assets/textures/seats-fabric/*` | ambientCG **Fabric030** – https://ambientcg.com/get?file=Fabric030_1K-JPG.zip | CC0 1.0 | Economy seat upholstery (colour recoloured to Halcyon navy heather, normal GL, roughness) |
| `assets/textures/seats-leather/*` | ambientCG **Leather026** – https://ambientcg.com/get?file=Leather026_1K-JPG.zip | CC0 1.0 | Business seat leather (recoloured slate navy, normal GL, roughness) |
| `assets/textures/seats-twill/*` | ambientCG **Fabric062** – https://ambientcg.com/get?file=Fabric062_1K-JPG.zip | CC0 1.0 | Headrest covers, pillows, blankets (normal map; colour desaturated) |
| `assets/textures/seats-plastic/*` | Self-generated (numpy procedural stipple) | CC0 (own work) | Seat shell plastic normal / roughness |

All airline artwork (Halcyon logo, headrest covers, tray placards, seat-row labels, life-vest / exit-row /
USB / power placards, seat-pocket literature, safety card, newspaper, headphone box, belt webbing) is drawn
procedurally with Canvas 2D in `src/aircraft/seats/textures.js` (own work, fictional airline).
