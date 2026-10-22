# HALLOWELL

*the things left behind* — a short 2D psychological survival-horror adventure.
Kettle Run, Pennsylvania. October 18, 1996.

Tess Dolan is sixteen and moving away after Christmas, and she hasn't told her friends. Tonight the four of
them break into the old Hallowell School on a dare. The school is still taking attendance.

- Top-down exploration in the style of classic RPG Maker horror, with VN-style portraits.
- Prologue plus eight chapters, about 1–2 hours to finish.
- Four endings: DISMISSED, WITHDRAWN, PRESENT and TRUANT. The epilogues change with which friends you
  reached and how you answered the roll.
- Everything is generated in code: pixel art, portraits, CGs, lighting, music and sound. The whole game
  ships as one self-contained HTML file.

## Play

Open `dist/hallowell.html` in a desktop browser. It is tested in Chromium (Chrome, Edge); other modern
browsers should work. No server or install is needed: it runs straight from disk. Headphones are
recommended.

| Action | Keys |
|---|---|
| Move | Arrow keys / WASD |
| Run | Shift |
| Interact / advance / hold (eyes shut, breath, writing) | Z / Enter / Space |
| Back / cancel | X / Backspace |
| Pause menu (save, load, settings) | Esc |
| Flashlight on/off | F |
| Bag | Tab / I |
| Sketchbook (objective, notes, map) | M |
| The compact (once you have it) | Q |

Saving: the game autosaves at checkpoints and on map changes, and you can also save to three slots from the
pause menu. Saving is disabled while a period bell or a chase is under way. Settings cover volume (master,
music, effects, ambience), text speed, pixel-perfect scaling, CRT scanlines, film grain, reduced flashing
and fullscreen. After repeated game overs at the same checkpoint, the game quietly eases the next attempt.

A few rules worth learning early, because the school teaches them the hard way:
- When the bell rings, sit down.
- When he asks, you can answer. Or not.
- The light dies where he is.

## Build and run from source

Requires Node 22. Playwright with Chromium is only needed for the tests.

```sh
npm install
npm run build        # → dist/hallowell.html (single file, fonts inlined)
npm run dev          # dev server on http://localhost:8080 (ES modules, no build step)
```

Add `?debug` to the URL of the built file to enable the debug overlay (F3) and the `window.__HW` test API.
On the dev page they are always enabled.

## Tests

```sh
npm test                    # build, smoke, engine (dev + built), maps          ~2 min
npm test -- --all           # + systems, meta, full-game playthrough (dev + built)  ~20 min
node tests/story_n1.mjs     # chapter suites: n1 (Prologue–I) … n5 (VIII + endings)
node tests/playthrough.mjs  # one continuous game from the title to every ending
```

`tests/playthrough.mjs` starts a New Game from the real title menu. It plays every chapter in order with
simulated input and saves and reloads through the in-game menus. It reaches DISMISSED, then branches from
those saves to TRUANT, WITHDRAWN and PRESENT, and checks for zero errors throughout.

## Layout

```
src/engine   game loop, maps, entities, scripting, save/load, input, display
src/render   renderer, lighting (shadows, flashlight, the shroud), post FX
src/game     the Colonel's AI, periods, patrols, chases, the Assembly, endings model
src/ui       dialogue, HUD, menus, special screens (Register, breath, PA, VHS…)
src/audio    WebAudio synthesis: ambience beds, sfx, music
src/art      procedural pixel art: tiles, props, sprites, portraits, CGs
src/data     maps, chapter scripts, items, documents, puzzles
docs/        DESIGN.md (design bible), TECH.md (engine contract), CONTENT.md, API_NOTES.md
```
