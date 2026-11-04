# Chrome Ripples

A 60-second, 30 fps procedural Blender 4.5 animation. A polished chrome sphere
drops in slow motion onto a mirror-like liquid-metal surface. The impact sends
out ripples that set off a chain reaction: rings of chrome, gold and titanium
spheres bounce, each landing sends out new waves, and the waves interfere. At
the end the hero sphere hops one last time, and the camera, now overhead, shows
concentric rings bending the reflection of the studio ring light.

## Files

| File | Purpose |
|---|---|
| `sim.py` | Deterministic physics and timing (numpy only). Covers the wave model, sphere state machine (float, flight, contact), chain-reaction launches and the slow-motion time remap. |
| `build_scene.py` | Builds the whole Blender scene from the simulation: Geometry Nodes liquid, spheres, studio lights, camera path, Cycles and compositor settings. |
| `chrome_ripples.blend` | The generated scene, ready to open or render. |
| `render.sh` | Build, render all frames and encode the MP4. Re-running it picks up where it stopped. |
| `chrome_ripples.mp4` | The rendered animation (1280×720, 30 fps). |

## How it works

* **Liquid metal.** A 40 m Geometry Nodes grid. Its height is a sum of analytic
  ripple events: damped radial wave trains, plus a dimple that the sphere
  presses into the surface and a small rebound bump. The events are points with
  attributes on the hidden `RippleEvents` object. A Repeat Zone loops only over
  the ripples that are live in the current frame; the window is keyframed per
  frame. The node tree is a node-for-node copy of `sim.event_height`. The
  Geometry Nodes surface and the numpy heights agree to about 1e-7 m, so the
  floating spheres sit exactly on the waves.
* **Chain reaction.** A floating sphere is launched when a strong enough wave
  front reaches it. When it lands it makes a new ripple event. Six rings of
  spheres (6, 12, 18, 24 and 30 spheres, plus the hero) keep the cascade
  symmetric, and an energy envelope lets it build up and then settle.
* **Slow motion.** The physics runs at real gravity. Playback runs at about
  0.3× and drops to about 0.11× around the hero impact.
* **Studio look.** Cycles with soft emissive panels that the camera can't see:
  an overhead ring light and warm and cool vertical strips. A
  reflection-only world adds a cyclorama glow just above the horizon, which
  makes the liquid read as silver. AgX Medium High Contrast, bloom, vignette,
  and fades in and out.

## Usage

```bash
# build only (about 10 s)
blender -b --factory-startup --python build_scene.py -- --out chrome_ripples.blend

# full pipeline (1800 frames; about 4 h on a 4-core CPU at 6 spp + OIDN)
./render.sh
```

Options for `build_scene.py`: `--res 1920x1080`, `--samples 16` and
`--grid 640` (liquid vertices per side). To tune the choreography, run
`python3 sim.py`. It prints the impact timeline and how many ripple events are
live at once.
