# St. Agatha General

A first-person exploration game set in an abandoned hospital, rendered to look like a
PlayStation 1 game. Built with Three.js. Every texture and sound is generated in code
at startup; there are no external assets.

There is no combat and nothing jumps out at you. You walk through the building, read
what people left behind, and work out what happened on Ward A.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
```

`npm run build` writes a single self-contained `dist/index.html`. Three.js, the shaders,
the texture generator and the audio synth are all inlined, so the file runs offline,
including straight from disk (`file://`).

### Controls

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Shift | Sprint |
| C | Crouch (toggle) |
| F | Flashlight |
| E or left click | Open/close doors, read documents |
| Space | Let go of a ladder |
| Esc | Pause and settings |
| `` ` `` | Performance overlay (FPS, draw calls, triangles) |

On a ladder, W climbs and S descends. Look down and press W to climb down. Strafe
sideways to step off onto a ledge.

## The building

Three floors, laid out the way a real hospital would be:

- **First floor (y = 4):** Ward A, rooms 101–110 off a long corridor; a nurse station;
  the day room where some urban explorers camped; a scrub room and operating theatre;
  recovery; Ward B (an open ward); and isolation room 112.
- **Ground floor (y = 0):** lobby and reception, where you start; medical records,
  pharmacy, administration, two exam rooms, radiology, emergency/triage, restrooms, a
  chapel and the staff lounge.
- **Basement (y = −4):** boiler room with the generator, maintenance, the mortuary (cold
  storage and autopsy), pathology, laundry, the records archive and mortuary receiving.

How the floors connect:

- **Stairwell A**, by the lobby, is a switchback stair from the ground floor to the first
  floor. Its basement flight has collapsed into rubble.
- **The elevator shaft** has its doors pried open on the ground and first floors. The car
  lies wrecked at the bottom. A maintenance ladder runs the full height of the shaft.
- **Stairwell B**, the service stair at the east end, connects the basement and the
  ground floor. Its ground-floor door is locked from the stairwell side, so once you
  reach the basement you can open it as a shortcut back up.

Wayfinding works the way it would in a real building. There are hanging corridor signs,
signs over every door, room-number plates, painted floor markers in the stairwells, and
a lobby directory you can read. Thirteen documents are scattered through the building.
Room 108's door is nailed shut, and there is light under it.

## How the PS1 look is done

| Feature | Implementation |
| --- | --- |
| 240p, nearest-neighbour upscale | The canvas is rendered at 240 lines (width follows the window's aspect, or 4:3 in settings) and CSS-scaled with `image-rendering: pixelated`. |
| Vertex jitter | Clip-space positions are snapped to the 240p pixel grid in the vertex shader (`src/ps1.js`). |
| Affine texture warping | UVs are interpolated as `uv·w` and `w`, then divided per fragment, which cancels perspective correction. Large polygons visibly swim. |
| No texture filtering | Nearest sampling with no mipmaps. All textures sit in one 1024² atlas, used like PS1 texture pages, with per-vertex page rectangles and `fract()` wrapping. |
| 15-bit colour + dither | A post-process pass adds the PS1's 4×4 ordered dither, then truncates to 5 bits per channel. Textures and HUD text are 15-bit as well. |
| Low-res textures | 64×64 to 128×128 (some 32 px) in `src/textures.js`, painted with Canvas2D from a seeded random generator. Transparency is 1-bit cutout. |
| Vertex lighting | All lighting is Gouraud. Fixtures and moonlight are baked into vertex colours with grid line-of-sight occlusion and a corner-darkening term. Each vertex also stores its strongest unstable lamp, so flicker modulates it at runtime. The flashlight is a per-vertex spotlight in the shader. |
| Distance fog | Per-vertex, to near-black, ending at 17 m. The far plane is 19 m. |

Toggle jitter, affine warping and dithering in the settings to compare.

## Performance

- **Batching:** static geometry is merged into 8 m chunks, one material and one draw call
  per chunk.
- **Occlusion:** a chunk is drawn only if it is on the camera's floor (other floors are
  added only inside stair or shaft zones) and inside the fog distance. It also has to
  pass a line-of-sight test from the camera to sample cells inside it, run on the floor
  plan grid.
- **Typical frame:** 10–35 draw calls and 5–17k triangles at about 427×240.
- **Frame rate:** simulation runs at a fixed 60 Hz and rendering is capped at 60 FPS.

## Code map

| File | Purpose |
| --- | --- |
| `src/main.js` | Boot, render loop, culling, interaction, menus, scripted beats |
| `src/ps1.js` | World shader (vertex lighting, jitter, affine UVs, fog) and the dither/quantise post pass |
| `src/plan.js` | Floor-plan grid (0.5 m cells with vertical open spans) and spatial queries |
| `src/layout.js` | The hospital: rooms, doors, windows, lights and all set dressing |
| `src/architecture.js` | Grid → walls/floors/ceilings, windows, stairwells, elevator shaft |
| `src/props.js` | Procedural low-poly props: beds, gurneys, wheelchairs, IV stands, boilers, the morgue drawer wall, the campsite… |
| `src/lighting.js` | Light baking and the flicker controller |
| `src/doors.js` | Hinged single and double doors with segmented colliders |
| `src/player.js` | Controller: collision push-out, steps and ramps, ladder, crouch, head bob, footstep surfaces |
| `src/textures.js` | Procedural texture atlas |
| `src/audio.js` | Procedural Web Audio: ambience beds, positional drips, buzzing ballasts, wind, machinery, surface footsteps, reverb |
| `src/hud.js` | 240p HUD with dithered text |
| `src/notes.js` | Document texts |
