# DOOM — modern rebuild

A faithful recreation of DOOM (1993) that runs in the browser. It renders the original game data (maps, textures, sprites, sounds, music) through the original palette and light-diminishing model, so screenshots look like 1993 DOOM. Underneath it adds modern FPS handling, smarter monsters, 3D monsters with full ragdoll physics, dismemberment and layered combat effects.

Shareware Episode 1 ("Knee-Deep in the Dead") is included and playable out of the box. If you own the full game you can load `DOOM.WAD` (Ultimate DOOM) or `DOOM2.WAD` from the in-game menu (Options → Game Files). The file is stored only in your browser.

## Running

**Single file:** `npm install && npm run build:html` writes `dist/doom.html`, a self-contained 8 MB page (code, workers and WADs embedded) that you can open straight from disk.

**From source:**

ES modules and audio worklets need an HTTP server (opening `index.html` from disk won't work):

```sh
npm start            # serves on http://localhost:8080 (no dependencies)
# or
python3 -m http.server 8080
```

Then open http://localhost:8080/ in a WebGL 2 browser (Chrome, Edge, Firefox or Safari 15+). Click the screen to capture the mouse.

Handy URL parameters for testing: `?map=E1M3&skill=4` starts a map directly (skill 1–5), `&god` enables god mode, `?shareware` ignores a stored IWAD.

`npm test` runs every map headlessly with a scripted player and the full effects layer. It also checks that a game saved mid-level and reloaded stays in exact lock-step with the original. Run it with `VOX=1` to include the 3D models and ragdolls. `npm run check` validates the game data tables against the WAD.

## Default controls

| Action | Keys |
|---|---|
| Move / strafe | W A S D (arrows also work) |
| Fire / aim down sights | Left mouse / right mouse |
| Use (doors, switches) | E |
| Jump / crouch (sprint + crouch = slide) | Space / C |
| Sprint / walk | Left Shift / Left Alt |
| Reload / quick melee | R / V |
| Weapons | 1–7, mouse wheel, Q = last weapon |
| Automap | Tab |
| Menu / pause | Esc / Pause |
| Help, save, load, options | F1, F2, F3, F4 |
| Quick save / quick load | F6 / F9 |

Every action can be rebound in Options → Key Bindings. Gamepads with the standard mapping work as well: left stick moves, right stick looks, RT fires, LT aims, A jumps, B crouches, X reloads/uses, Y / LB switch weapons, RB is quick melee, L3 sprints and Back opens the automap.

The original cheat codes work (`iddqd`, `idkfa`, `idclip`, `idclev`, `idbehold`, `iddt`, …).

## What's original and what's new

**Kept from 1993 DOOM:**
- Every map, thing, texture, sprite, sound and music lump comes straight from the WAD.
- Monster, weapon and item behaviour is a direct port of the released source (`info.c`, `p_*.c`): states and timings, damage, P_Random, infighting, sound propagation, door/lift/crusher timings, secrets and exits.
- The renderer outputs palette indices. Lighting uses COLORMAP, with the original sector light levels, distance falloff and wall "fake contrast". There is no texture filtering. Damage, pickup and radiation-suit palette flashes, spectre fuzz and the screen melt are all there.
- The original status bar, menus, intermission, finale text screens and automap.
- Music plays through a bit-exact OPL3 emulation driven by the WAD's GENMIDI bank, using the same voice logic as Chocolate Doom. It sounds like a Sound Blaster, not a General MIDI synth.

**Modern layer (each part can be switched off in Options):**
- **Controls:**
  - Mouse look with free aim (autoaim is optional), adjustable FOV, and aspect-correct "tall pixel" rendering.
  - Jump, crouch, sprint and slide, built on DOOM's own momentum model, so run speed and feel are unchanged.
- **Weapons:**
  - Magazines for the pistol (12+1) and chaingun (50); tactical reloads and slower empty reloads that finish with a slide or bolt rack.
  - A tube-fed shotgun that loads shell by shell. Firing interrupts the reload and an empty tube is pumped afterwards.
  - The rocket launcher, plasma rifle and BFG keep their original ammo systems.
  - Aim down sights: the weapon's front sight lines up with the screen centre, the view zooms slightly, spread tightens, and movement and recoil are reduced.
  - Per-weapon recoil (the chaingun climbs), camera shake, weapon kick and sway, casings, magazine drops, muzzle smoke and dynamic muzzle light.
- **Damage and AI:**
  - Locational damage: head shots deal 1.5×.
  - Monsters flinch away from hits and stagger under sustained fire.
  - When a monster loses track of you it pathfinds across the map's sector graph instead of walking into walls. Some flank, and hitscan zombies and imps side-step when you aim at them. Their attacks and timing are unchanged.
- **3D monsters:**
  - Every monster is a voxel model built from its own sprites, so it looks like the original art from every angle (see below).
  - Monsters play the original animation frame by frame, turn smoothly instead of snapping between eight angles, and lean away from hits.
- **Ragdolls and gore:**
  - Dead monsters become articulated ragdolls: pelvis, chest, head, upper and lower arms and legs, and whatever they hold, joined by hips, knees, waist, neck, shoulders and elbows with realistic joint limits.
  - The killing blow throws the body; it topples, buckles at the knees, hits walls and steps, and settles. Bodies pile on each other, and you and live monsters push them around.
  - Bullets hit corpses where they lie and move them. Limbs and heads tear off under enough damage and the stumps bleed.
  - Explosions throw bodies. Overkill and crushers break them apart, and head shots send heads flying.
  - An arch-vile's resurrection pulls a body back into its standing pose.
  - Blood and debris particles, and persistent blood, bullet-hole and scorch decals on walls and floors.
  - Blood colour depends on the monster (cacodemons blue, barons green), and metal surfaces spark.
  - With 3D monsters off, corpses are physical billboards and overkill cuts the sprite art into chunks, as before.
- **Audio:**
  - 3D positional sound using DOOM's 200–1200 unit falloff.
  - Muffling through walls (line-of-sight occlusion) and reverb sized to the current room.
  - Synthesized layers under the originals: casing tinkles, reload mechanics, impacts and sub-bass explosion thumps.

The cosmetic layer uses its own random numbers, so it never changes the game's deterministic simulation.

### How the visual style is kept

Dynamic lights brighten through the COLORMAP light levels rather than adding colour. Particles, decals and gibs are palette-indexed pixel art lit like everything else, and translucency is done with ordered dithering. There is no smoothing or post-processing besides optional scanlines, so effects stay inside the 1993 look.

### How the 3D monsters are made

There are no 3D models in the WAD, so the game builds them from the sprites:

- **Carving:** each rotated animation frame becomes a block of voxels, carved down to the silhouettes of its eight sprite rotations (a visual hull), one voxel per sprite pixel.
- **Colouring:** every surface voxel takes its colour from the rotation that faces it best, so the model matches the original art when seen head-on from any of the eight angles. Between those angles it shows true 3D in-between views.
- **Splitting into parts:** the model is cut at anatomical heights into rigid body parts. Each part gets its mass and inertia from its voxels, and its collision shape is a set of spheres fitted inside it.
- **Building:** models are built in background workers when a level starts. Monsters stay sprites until their models are ready.
- **Rendering:** the GPU raymarches each part through a 3D texture of palette indices. Faces are lit with COLORMAP and the original light diminishing, with DOOM's wall-style contrast, so the models stay inside the 1993 look. Spectres keep their fuzz.
- **Physics:** ragdolls use extended position-based dynamics (rigid bodies, substepped). Joints are ball sockets with swing and twist limits, plus hinge knees and elbows. Joints keep a little muscle tone for the first instant, so a body topples before it goes limp.

Lost souls and pain elementals keep their original exploding death animations. Options → Effects has switches for 3D monsters, ragdoll physics and the number of ragdolls simulated at once. With 3D monsters off, monsters are the original sprites.

The game's own corpse objects behave exactly as in the original. Ragdolls are cosmetic and aren't saved: a loaded game lets its corpses settle into fresh ragdolls.

## Assets

- `assets/wads/doom1.wad`: the official DOOM shareware v1.9 IWAD (freely redistributable unmodified).
- `assets/wads/doomx-extras.wad`: a small fallback built by `tools/build-extras.py` from [Freedoom](https://freedoom.github.io/) (BSD licence, see `FREEDOOM-COPYING.txt`). It supplies the plasma rifle, BFG 9000, cell ammo and the episode 2–4 monsters, which aren't in the shareware file, so the full arsenal works via `idkfa`. Any lump present in a loaded IWAD always takes priority.

## Project layout

```
src/
  wad/       WAD reading and graphic decoding
  render/    WebGL 2 renderer: atlas, world geometry, shaders, camera/sprites/weapon view
  game/      game simulation (ported from the original C source) + modern player/weapons/AI
    specials/  doors, lifts, floors, ceilings, lights, switches, teleports, animations
  fx/        particles, decals, gibs, corpse physics, explosions
  vox/       voxel models from sprites, body-part segmentation, ragdoll physics, model workers
  audio/     sound effects system, OPL3 emulator, MUS/MIDI sequencer, music worklet
  ui/        status bar, menus, options, intermission, finale, automap, cheats
tools/       dev server, extras WAD builder, data validation, offline music renderer
```

Map-specific movement rules (for example disabling jumping in boss arenas) live in `src/game/compat.js`.

Saved games (six slots plus a quick-save slot) are kept in the browser's local storage. A save restores the level exactly, including monsters' AI state and every moving door and lift. Cosmetic effects such as decals and gibs are not saved.

## Known limitations

- Demos (`.lmp`) aren't played back; the title screen cycles the title, credit and help pages.
- Multiplayer and deathmatch aren't supported.
