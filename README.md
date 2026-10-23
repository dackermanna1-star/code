# What Derry Keeps

**Episode One: Welcome Home** — a choice-driven visual novel set in Derry, Maine, in the autumn of 1991.

Augusta "Gus" Brennan is fourteen, newly arrived at her grandmother's house on Larch Street, and starting her first year at Derry High. She records sounds on a cassette recorder she's had as long as she can remember. Her grandmother keeps calling her "Junie." And on Gus's tapes, under the hiss, a girl's voice is waiting.

About 90 minutes for a first playthrough, with branching scenes, a free-roam Saturday on the Derry map, relationships that remember what you did, and an ending that changes depending on what you learned, who you trusted, and what you were willing to give up.

## Play

Open `index.html` in a browser. No server or build step is needed to play. Best with sound.

- **Click / Space / Enter**: advance. **1–9**: pick a choice. **J** notebook, **L** history, **S** save/load, **A** auto-advance, **Ctrl** (hold) skip seen text, **H** hide the interface, **Esc** settings.
- Every choice is labeled with its tone (Kind, Joke, Blunt, Probe, Lie…). Gus's personality forms from the tones you pick.
- **Say something else…** lets you write Gus's words or actions yourself. When the game runs on claude.ai, Claude answers in the characters' voices and steers to the nearest scripted path; elsewhere your words are matched to the closest scripted reply.
- Saves live in your browser. The Save screen can also give you a save code to keep.

## Make

```
npm install          # inkjs (story compiler) and playwright-core (screenshots/tests)
npm run build        # compile story/*.ink -> js/story.js, emit dist/artifact.html
npm run playtest     # play 500 random runs; report dead ends, missing assets, word counts
npm run shots -- bg standpipe:all   # render art to .shots/ for review
```

| Path | What it is |
|---|---|
| `story/*.ink` | The script, in [Ink](https://github.com/inkle/ink). `main.ink` includes the chapters. |
| `js/engine.js` | Visual-novel runtime: Ink loop, `@commands`, stage, sprites, choices, saves. |
| `js/ui.js` | Title, notebook, history, saves, settings, the Derry map, end-of-episode summary. |
| `js/freeform.js` | "Say something else…": Claude when available, a tone matcher otherwise. |
| `js/data.js` | Speaker table and notebook content (people, clues, tapes, theories). |
| `js/px/*.js` | All artwork, drawn as pixel art by code: `px.js` (palette ramps, light, the 320×180 kit), `pxchar.js` (the cast's shared portrait rig), `cast_*.js`, backgrounds (`bg_*.js`), CGs, and the pixel UI (`ui_px.js`). |
| `js/audio.js` | All music, ambience and sound effects, synthesized with the Web Audio API. |
| `docs/ART_DIRECTION.md` | The visual identity. |
| `docs/ENGINE.md` | Script conventions and module APIs. |
| `docs/STORY_BIBLE.md` | ⚠️ Spoilers for the whole series. Play first. |

Derry and its landmarks come from Stephen King's fiction; this story, its characters, and its mysteries are original fan work.
