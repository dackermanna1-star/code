# EVENT HORIZON

A 60-second cinematic short made entirely in **Blender 4.5 LTS** (Cycles), generated procedurally
from Python: no hand-modelled assets, no downloaded textures.

> A lone astronaut walks across a tiny planet. Stars shimmer. A massive black hole opens in the
> sky, tears the planet apart and pulls everything — the astronaut included — into its accretion
> disk.

Final film: [`output/event_horizon.mp4`](output/event_horizon.mp4) (1280×720, 24 fps, H.264, with
a procedural soundtrack). Stills from each shot are in [`output/stills/`](output/stills).

## Shot list

| Time | Shot | What happens |
|------|------|--------------|
| 0–8 s | A · Establishing | Slow dolly towards the tiny planet, its debris belt and thin blue atmosphere; twinkling starfield and nebula. |
| 8–15 s | B · Low tracking | Low-angle 22 mm shot as the astronaut walks; the planet turns under the astronaut's feet. |
| 15–22 s | C · Profile | Back-lit side view on the planet's curvature; the astronaut slows and stops. |
| 22–30 s | D · Reveal | Over the shoulder, the astronaut looks up: the black hole opens, the disk ignites from the inside out, focus racks to infinity, and the ground starts to shake. |
| 30–36 s | E · Visor | Close-up: the black hole is reflected in the gold visor, the crust cracks and glows, and the astronaut is lifted off the ground. |
| 36–46 s | F · Breakup | Wide shot: the planet's crust peels apart, the molten core is exposed, and everything streams towards the disk. |
| 46–54 s | G · Drift | Tracking the tumbling astronaut through the stream of glowing fragments. |
| 54–60 s | H · Finale | The camera rushes after the astronaut towards the disk; the disk flares to white, cuts to black, and the title appears. |

## How it is built

* **Planet** – displaced icosphere (fBm + craters) fractured into 34 closed wedge-shaped crust
  chunks (Voronoi cells on the sphere, with jagged walls). Custom split normals keep the surface
  seamless before the breakup. The fracture faces glow from inside via a molten core and a core light.
* **Astronaut** – rigged hierarchy (pelvis, torso, head, shoulders, elbows, hips, knees) with
  suit fabric, hard shell, gold visor, helmet lamps and spotlight. Walk cycle is phase-locked
  to the planet's rotation, then blends into look-up, brace and zero-g float poses.
* **Physics** – crust chunks, 150 belt rocks, loose pebbles and the core are integrated under
  the black hole's gravity with a transient tidal stretch, then baked to keyframes. A
  collision-avoidance pass nudges anything that would fly through a camera or the astronaut.
  Bodies shrink as they cross ~2.4 horizon radii.
* **Black hole** – black event horizon; accretion disk with differential rotation, a blackbody
  temperature ramp and Doppler beaming; camera-facing lensed halo and photon ring; and
  **gravitational lensing of the starfield** done in the world shader (point-lens deflection
  β = θ − θE²/θ, driven per frame by the active camera).
* **Sky** – procedural starfield and nebula baked once to 8k/4k equirectangular EXRs
  (`bake_sky.py`). Twinkle is a cheap 4D noise on top, and the sun disc is analytic.
* **Atmosphere/fog** – an impact-parameter haze shell (exp(−(b−R)/H)) for the limb glow, plus
  camera-distance ground haze in the rock shader. This looks like a volume at a fraction of the cost.
* **Camera** – 8 cameras with baked moves, procedural shake that ramps with the destruction,
  rack focus, anamorphic-ratio bokeh, and marker-based cuts.
* **Look** – AgX (Medium High Contrast), compositor bloom, anamorphic streaks, chromatic
  aberration, lift/gamma/gain grade and vignette. In the encode: fade-in, white flash, title card, film grain.

## Reproduce

Requires Blender 4.5 (tested with 4.5.15 LTS), Python 3 with numpy, and ffmpeg.

```bash
./render.sh            # bake sky -> build scene -> render 1440 frames -> soundtrack -> encode
```

The render resumes if it is interrupted (existing frames are skipped). Options:
`RES_PCT=150` renders at 1920×1080, `SAMPLES=48` raises quality, and `DEVICE=GPU` renders on a GPU.
On a 4-core CPU the default 720p render takes roughly 8–10 s per frame.

Individual steps:

```bash
blender -b -P bake_sky.py -- work/textures 8192
blender -b -P build_scene.py -- work/event_horizon.blend      # open this in Blender to explore
blender -b work/event_horizon.blend -P render_stills.py -- work/stills 50 24 300 650 1000
blender -b work/event_horizon.blend -P render_preview.py -- work/preview 3
python3 make_soundtrack.py work/soundtrack.wav
./encode.sh work/frames work/soundtrack.wav output/event_horizon.mp4
```
