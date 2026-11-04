# City in a Bottle

A surreal 60-second Blender 4.5 animation. An antique glass bottle lies on a walnut desk in
a painter's workshop at golden hour. Inside it, a 1:1000 miniature city is alive with traffic,
lit windows, street lamps, blinking aircraft beacons, a drifting airship, and soft volumetric
clouds.

Everything is generated procedurally by `build_scene.py`: geometry, materials, animation,
camera, lights, and compositing. The only external asset is a CC0 HDRI from
[Poly Haven](https://polyhaven.com/a/artist_workshop) used for the room reflections in the glass.

## Shot list (24 fps, 1440 frames)

| Time | Shot |
|------|------|
| 0–11 s | Cinematic close-up. A slow dolly along the bottle shows the city through the glass, with soft workshop reflections and shallow depth of field. |
| 11–19 s | The camera drifts past the shoulder to the open neck; the cork lies on the desk. It swings round to line up with the mouth. |
| 19–24 s | It pushes through the neck into the bottle. |
| 24–40 s | Flythrough: it descends over the city's edge and flies down the main avenue at rooftop height. It threads the downtown canyon past traffic, headlights, and storefronts. |
| 40–46 s | It climbs between the towers, through a cloud, and up through the glass ceiling. |
| 46–60 s | It pulls back and arcs round to reveal the whole bottle on the desk. |

## What's in the scene

- **Glass bottle**: the profile is lathed with a punted base, shoulder, neck, and lip ring, then given a 2.5 mm wall and subdivided. The glass has a faint aqua tint, smudge-driven roughness, and a slight hand-blown waviness. Shadow rays pass through it with a tinted transparent shader, so the city and desk get light through the glass without fireflies.
- **City**: 112 buildings with setback towers, round towers, parapets, cornices, rooftop AC units, water tanks, and antennas. It also has a park with a pond and trees, a plaza with an obelisk, street trees, about 200 street lamps, zebra crossings, and a double yellow line on the avenue.
  - The building height falls off from a downtown core and is clamped under the curved glass.
  - Buildings are also kept clear of the camera's flight path, so the camera never clips.
- **Windows**: a procedural shader draws the window grid, recessed panes, and glowing shopfronts. Each window gets a random warm or cool colour. Lights switch on and off slowly over time, driven by `frame/24`.
- **Traffic**: 54 vehicles (cars, vans, and buses) on six loop routes with right-hand traffic. Each vehicle has headlights, tail lights, and its own headlight spot lamp. They drive at scale speed (about 45 km/h at 1:1000).
- **Sky**: seven noise-eroded volumetric cumulus clouds drift across the bottle. A small airship with a beacon drifts through them, and red beacons blink on the tallest towers.
- **Desk**: a walnut desktop, a cork with a cellular texture, a pencil, a leather notebook, a stack of books, a brass magnifying glass, and fairy lights in the background that turn into bokeh.
- **Camera**: the path is a C1 Hermite spline through 18 keyframes, baked per frame. Focal length, f-stop, focus distance, and roll are all animated, and it uses a 7-blade aperture. Motion blur is on.
- **Look**: Cycles with AgX Medium High Contrast. The compositor adds bloom, slight chromatic dispersion, and a vignette.

## Usage

Install Blender 4.5 LTS (tested with 4.5.15):

```bash
curl -LO https://download.blender.org/release/Blender4.5/blender-4.5.15-linux-x64.tar.xz
tar xf blender-4.5.15-linux-x64.tar.xz && export PATH="$PWD/blender-4.5.15-linux-x64:$PATH"
```

Regenerate the `.blend`:

```bash
blender -b --factory-startup --python bottle_city/build_scene.py
```

Options go after `--`, for example:

```bash
blender -b --factory-startup --python bottle_city/build_scene.py -- --res 1920 1080 --samples 32 --haze
```

| Option | Meaning |
|--------|---------|
| `--res W H` | Render resolution (default 1280×720). |
| `--samples N` | Max samples per pixel, denoised with OIDN (default 6). |
| `--haze` | Adds a volumetric haze inside the bottle that makes god rays between the towers. It renders about 35% slower. |
| `--save PATH` / `--no-save` | Where to save the `.blend`. |

Render the frames and encode the MP4. This is resumable, so you can stop it and run it again:

```bash
bash bottle_city/render.sh
```

On a 4-core CPU the default settings take about 15–25 s per frame. A GPU is much faster: set
Cycles to CUDA or OptiX under Preferences, then System. For a final-quality version, raise the
resolution to 1920×1080, use 32–64 samples, and add `--haze`.

## Files

- `build_scene.py`: the scene generator.
- `bottle_city.blend`: the generated scene, ready to render or open in the UI.
- `render.sh`: renders the frames and encodes `render/city_in_a_bottle.mp4`.
- `assets/artist_workshop_2k.hdr`: the CC0 HDRI by Poly Haven.
- `render/`: the final video and stills.
