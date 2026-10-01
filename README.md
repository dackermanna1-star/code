# Level Zero

A first-person exploration game set in an enormous, seemingly endless building of yellowed
offices, empty rooms and corridors, made to look, sound and play like a game from a late-1990s
home console.

There are no monsters, no enemies, no weapons, no health and no objectives. Nothing will chase
you. You walk, you get lost, you notice things, and you try to remember the way back.

## Playing

The game runs in any desktop or mobile browser with WebGL2. Nothing needs to be installed.

* **Single file:** run `node tools/build.mjs`, then open `dist/index.html` straight from disk.
* **From source:** serve the repository root and open `index.html`:

  ```
  python3 -m http.server 8765
  # then open http://127.0.0.1:8765/index.html
  ```

Click the screen to look around with the mouse. Every player walks through the same building
(fixed seed); add `?seed=anything` to the URL to visit a different one.

### Controls

| | Keyboard and mouse | Gamepad |
|---|---|---|
| Move | `W` `A` `S` `D` | left stick / d-pad |
| Look | mouse (`←` `→` turn) | right stick |
| Walk faster | `Shift` | `R2` / `L1` / `L3` |
| Crouch | `C` toggle, `Ctrl` hold | `○` / `B` |
| Climb onto something low | `Space` | `□` / `X` |
| Use / read / answer | `E`, `F`, `Enter` or left click | `×` / `A` |
| Pause | `Esc`, `P` or `Tab` | `Start` |

On touch screens the left half of the screen is a movement stick, the right half looks around,
and buttons appear for using, climbing, crouching and walking faster.

### Saving

Old telephones, payphones and typewriters can write to the memory card: walk up to one and
press use. The game also writes a quiet backup every minute or so and when the page is closed
(a small memory card icon blinks in the corner), so **Continue** on the title screen takes you
back to where you were.

### Options

Mouse sensitivity, invert look, field of view, vertex jitter (off / authentic / heavy),
dithering, a 30 fps cap, a widescreen mode, brightness and volume. Settings are stored in the
browser.

## What makes it look like 1998

The look is produced by the renderer itself, not by a filter laid over a modern image:

* rendered at 320x240 (426x240 in widescreen) and scaled up with hard pixels;
* vertex positions snapped to the screen's pixel grid, so geometry wobbles and jitters;
* affine (non perspective-correct) texture mapping, so textures swim and bend on large polygons;
* 64x64 textures with 16-colour palettes, nearest-neighbour sampling and no mipmaps;
* lighting baked into vertex colours (Gouraud shading), so light pools have visible polygon steps;
* 15-bit colour output with the console's 4x4 ordered dither, and the colour banding that comes with it;
* per-vertex distance fog and a short draw distance, with geometry that pops in;
* low-poly furniture with blocky, hand-placed-looking proportions.

All textures, models, rooms and sounds are generated from code when the game starts. There are
no image or audio files.

## The building

The building is generated as you walk and is effectively infinite in every direction, on many
floors. It is deterministic: the same seed always builds the same rooms.

It starts in the classic yellow rooms: striped wallpaper, damp carpet, buzzing ceiling panels.
From there it keeps going: offices with cubicles and meeting rooms, long corridors, storage
rooms and warehouses, maintenance spaces, schools, lobbies and waiting areas, and stairwells
that climb for longer than they should. Further out there are places that do not make sense,
and some doorways lead somewhere they cannot lead.

Sound is synthesised live: fluorescent hum, air handling, pipes, footsteps that change with the
floor, a primitive reverb that follows the size of the room, and things happening somewhere far
away that you will never find the source of.

## Development

See [docs/DEVELOPING.md](docs/DEVELOPING.md) for how the code is organised, how zones are
generated and how to add new rooms, props, textures and sounds.

* `node tools/check.mjs` imports every module and checks every material.
* `node tools/shots.mjs` takes headless screenshots (Playwright).
* `node tools/build.mjs` bundles everything into `dist/index.html`.
