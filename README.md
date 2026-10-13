# DOOM — modern rebuild

A faithful recreation of DOOM (1993) that runs in the browser. It renders the original game data (maps, textures, sprites, sounds, music) through the original palette and light-diminishing model, so screenshots look like 1993 DOOM. Underneath it adds modern FPS handling, smarter monsters, physics-driven corpses, dismemberment and layered combat effects.

Shareware Episode 1 ("Knee-Deep in the Dead") is included and playable out of the box. If you own the full game you can load `DOOM.WAD` (Ultimate DOOM) or `DOOM2.WAD` from the in-game menu (Options → Game Files). The file is stored only in your browser.

## Running

**Single file:** `npm install && npm run build:html` writes `dist/doom.html`, a self-contained 8 MB page (code, music worklet and WADs embedded) that you can open straight from disk.

**From source:**

ES modules and audio worklets need an HTTP server (opening `index.html` from disk won't work):

```sh
npm start            # serves on http://localhost:8080 (no dependencies)
# or
python3 -m http.server 8080
```

Then open http://localhost:8080/ in a WebGL 2 browser (Chrome, Edge, Firefox or Safari 15+). Click the screen to capture the mouse.

Handy URL parameters for testing: `?map=E1M3&skill=4` starts a map directly (skill 1–5), `&god` enables god mode, `?shareware` ignores a stored IWAD.

`npm test` runs every map headlessly with a scripted player and the full effects layer. It also checks that a game saved mid-level and reloaded stays in exact lock-step with the original. `npm run check` validates the game data tables against the WAD.

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
- **Gore and physics:**
  - Corpses are thrown by the killing blow: they tumble, bounce off walls, slide down stairs and get tossed by later explosions.
  - Overkill tears a monster into chunks cut from its own sprite art. Head shots can pop heads.
  - Blood and debris particles, and persistent blood, bullet-hole and scorch decals on walls and floors.
  - Blood colour depends on the monster (cacodemons blue, barons green), and metal surfaces spark.
- **Audio:**
  - 3D positional sound using DOOM's 200–1200 unit falloff.
  - Muffling through walls (line-of-sight occlusion) and reverb sized to the current room.
  - Synthesized layers under the originals: casing tinkles, reload mechanics, impacts and sub-bass explosion thumps.

The cosmetic layer uses its own random numbers, so it never changes the game's deterministic simulation.

### How the visual style is kept

Dynamic lights brighten through the COLORMAP light levels rather than adding colour. Particles, decals and gibs are palette-indexed pixel art lit like everything else, and translucency is done with ordered dithering. There is no smoothing or post-processing besides optional scanlines, so effects stay inside the 1993 look.

### A note on "ragdolls"

The monsters are 2D sprites, so there are no skeletons to ragdoll. Corpses are instead physical billboards: they carry momentum and spin, collide with walls, floors and steps, then settle onto the original death frames. Dismemberment cuts the actual sprite art into pieces that are simulated individually. This keeps the original animation and silhouettes intact while still giving physical deaths.

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
  audio/     sound effects system, OPL3 emulator, MUS/MIDI sequencer, music worklet
  ui/        status bar, menus, options, intermission, finale, automap, cheats
tools/       dev server, extras WAD builder, data validation, offline music renderer
```

Map-specific movement rules (for example disabling jumping in boss arenas) live in `src/game/compat.js`.

Saved games (six slots plus a quick-save slot) are kept in the browser's local storage. A save restores the level exactly, including monsters' AI state and every moving door and lift. Cosmetic effects such as decals and gibs are not saved.

## Known limitations

- Demos (`.lmp`) aren't played back; the title screen cycles the title, credit and help pages.
- Multiplayer and deathmatch aren't supported.
