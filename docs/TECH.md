# HALLOWELL — Technical Specification (engineering contract)

Read `docs/DESIGN.md` for *what* happens. This file defines *how*: architecture, module ownership, data
formats and every cross-module API. **APIs here are contracts** — implement them exactly; if you must extend,
add (never rename/remove) and document the addition at the bottom of this file under *Changelog*.

---

## 1. Platform & build

- HTML5 Canvas 2D + WebAudio, **vanilla ES modules**, no frameworks, **no runtime dependencies**.
- Dev: `npm run dev` → `tools/serve.mjs` serves the repo at http://localhost:8080 ; open `/index.html`.
- Build: `npm run build` → `tools/build.mjs` bundles `src/main.js` with esbuild (IIFE, minify off by default)
  into **`dist/hallowell.html`** — a single self-contained file (JS + fonts inlined as base64) that runs from
  `file://` by double-click. This is the shipped game.
- Screenshots / headless checks: `node tools/shot.mjs <page.html> <out.png> [--w=960 --h=540 --wait=ms
  --eval="js"]` serves the repo, opens the page in headless Chromium, waits for `window.__ready === true`
  (or the timeout), screenshots, prints console errors. Use it for art contact sheets and smoke checks.
- Playwright is global: `import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'`.
  Launch with `args: ['--autoplay-policy=no-user-gesture-required']`.
- Fonts (OFL/Apache, in node_modules/@fontsource): `pixelify-sans`, `dotgothic16`, `vt323`, `special-elite`,
  `patrick-hand`, `caveat`. The build inlines latin `.woff2` files declared in `src/ui/fonts.json`
  (owned by UI). In dev, `index.html` loads them from node_modules via @font-face.

## 2. Code conventions

- 2-space indent, semicolons, single quotes, `camelCase` functions, `UPPER_SNAKE` constants.
- Modules talk through the **`HW` registry** (`src/engine/hw.js`) at runtime — never import another
  subsystem's internals. Import data catalogs (`src/data/*.js`) and `src/art/palette.js` freely.
- **Art is deterministic:** use the seeded RNG in `src/art/util.js` (never `Math.random` in art).
- No per-frame allocation in hot loops; cache canvases; target 60 fps at 480×270.
- Comments: brief, explain *why*. Match surrounding density.
- Every subsystem has a stub with the final API (created before parallel work). Replace your own stubs;
  never edit files you don't own (see §15). If you need something from another module that doesn't exist
  yet, guard it (`HW.audio?.sfx?.(...)`) and list it in your report.

## 3. Coordinates, resolution, layers

- **World buffer** 480×270 (`HW.display.worldCtx`). **UI buffer** 960×540 (`HW.display.uiCtx`), i.e. one
  UI pixel = ½ world pixel. Both are composited onto the screen canvas at the same rect, integer-scaled
  when `settings.pixelPerfect` (default) else fit; letterboxed in black.
- Tiles 16 px. Tile coords `(tx, ty)`; world px `x = tx*16`. **Entity position = feet point** in world px.
  Placing an entity on a tile/anchor puts its feet at `(tx*16+8, ty*16+12)`.
- Directions: `'up' | 'down' | 'left' | 'right'`.
- Render order (renderer.js): floor tiles (prerendered) → decal props → wall tiles faces (prerendered) →
  wall-mounted props → **y-sorted** floor props + entities (key = feet y / footprint bottom) → wall tops
  (prerendered, so characters pass "under" the top rows of north walls) → `over` props → lighting
  (multiply) → light glows / particles → post FX → (UI buffer drawn separately).

## 4. Boot & loop (engine)

`src/main.js`: create display → load settings → `HW.art.init()` (show a minimal loading bar) →
`HW.audio.init()` (context created suspended; unlocked on first key/click) → `HW.ui.init()` →
`HW.lighting.init()`, `HW.fx.init()` → register data → `HW.ui.title()` → loop.

Loop: fixed-step update at 60 Hz (accumulator), render on rAF. Game modes: `title`, `play`, `cutscene`
(a blocking script is running; player control off), `menu` (UI modal), `gameover`, `ending`.
Update order: input → scripts → player (if `play`) → entities → registered game systems
(`HW.game.addSystem({ update(dt), render?(ctx), onMapLoad?(map) })`) → interaction probe → camera → audio
listener → fx → ui. `HW.time` advances only when not paused.

## 5. Data: maps (`src/data/maps/<id>.js`)

```js
export default {
  id: 'west1', name: 'West Hall — First Floor', floor: '1F',      // '1F','2F','B','B2','B3','EXT'
  offset: [-2, 22],                // floor-plan offset in tiles (sketchbook map)
  ambience: 'hall', music: null,   // audio ids (§10)
  dark: 0.94,                      // 0..1 darkness outside lights (1 = black)
  ambient: '#0b1020',              // ambient tint applied in darkness
  legend: { },                     // optional per-map extra tile chars (merged over data/tiles.js LEGEND)
  tiles: [                         // REQUIRED. all rows same length = map width
    '##########', ...
  ],
  propLegend: { d: 'desk_student', L: 'locker' },   // optional: chars for the prop layer
  propLayer: [ '..........', ... ],                 // optional, same size as tiles; top-left cell of footprint
  objects: [ /* prop instances, see below */ ],
  doors: { 'x,y': { /* overrides for an auto door whose bottom-left cell is (x,y) */ } },
  rooms: [ { id: 'w1_room103', name: 'Room 103', rect: [x, y, w, h], kind: 'classroom' } ],
  anchors: { from_lobby: [61, 15, 'left'], danny_vanish: [30, 15] },
  exits: [ { rect: [61, 13, 1, 4], to: 'lobby', anchor: 'from_west1', cond: null, fade: true } ],
  triggers: [ { id: 'vanish', rect: [28, 13, 4, 4], script: 'ch1.danny_vanish', once: true, cond: (s) => ... } ],
  lights: [ { type: 'fluor', x: 10, y: 14, group: 'period' }, { type: 'exit_sign', x: 3, y: 12 } ],
  patrol: { nodes: { a: [5, 15], b: [30, 15] }, edges: [['a', 'b']], folds: [[12, 13]],
            peeks: [ { room: 'w1_room103', door: [20, 12], look: [20, 9] } ] },
  past: [ /* compact 1979 views, §5.6 */ ],
  onEnter: null,                   // optional script id run (non-blocking) each time the map loads
};
```

### 5.1 Tiles & walls
- Characters → tile keys via `src/data/tiles.js` `LEGEND` (+ map `legend`). Unknown char = build error.
- Walls autotile: faces look south. **North walls of rooms/halls: 3 cells thick (top + 2 face rows).**
  Side walls and south walls: 1+ cells (render as tops). Leave ≥1 row of `' '` (void) or wall around the map.
- Windows (`W`, `U`) only show as windows in face rows; they emit moonlight south and flash on lightning.
- `^`/`v` stairs are visual; the actual transfer is an `exit` rect over them.

### 5.2 Props (objects)
Instance fields (all optional except `type`, `x`, `y`):
```js
{ id: 'w1_lockerA', type: 'locker', x: 12, y: 14, dir: 'down', state: 'closed', variant: 2,
  hide: 'locker',                        // make this locker a hiding spot
  solid: true,                           // override catalog
  cond: (s) => s.chapter >= 3,           // present only when true (re-evaluated on HW.game.refresh())
  examine: "[skeptical] That's a pentagram. Badly drawn.",   // see §5.3
  banter: { danny: "...", leah: "...", marcus: "..." },     // said after examine if friend in party
  script: 'ch1.portrait',                // interaction runs this script instead of default behaviour
  item: 'battery', count: 1,             // for type 'pickup' (and backpack)
  doc: 'walt_log',                       // for note_paper / examine → opens document reader
  lock: 'item:keyring' | 'flag:office_open' | ((s) => bool),   // doors: locked while not satisfied
  lockedText: "[n] Locked.", unlockSfx: 'key_unlock',
  to: { map: 'exterior', anchor: 'front_doors' },               // doors/props that transfer
  light: { type: 'lamp_green', group: 'library' },             // attached light override
  text: 'DANIEL KOVACH — PRESENT',        // dynamic props (chalkboard text, etc.)
  occupant: 'husk_b',                     // aud_seat occupant
  pastOnly: false, hideInPast: false,     // compact visibility
  label: 'Room 103',                      // door plate / hover name
}
```
- Auto ids for prop-layer props: `${mapId}_${type}_${x}_${y}`. Auto doors: `${mapId}_door_${x}_${y}`.
- **Persistent state:** `HW.state.mapState[mapId][propId] = { state, taken, params }` — set via
  `g.setProp(id, state, params)`; restored on map load.

### 5.3 Examine text mini-format
`examine` is a string, an array of strings (shown in sequence), or an array of `{ cond, text }` (first
matching wins; `text` may itself be a string or array). Each string may start with a tag:
- `[expr]` → Tess's inner voice with that portrait expression (default `neutral`), e.g. `[worried] ...`
- `[n]` → plain narration (no portrait), for physical descriptions ("Locked.")
- `[tess:expr]`, `[danny:expr]`, `[leah:expr]`, `[marcus:expr]` → a spoken line by that character.
Dialogue markup in any text: `{p}` pause 0.4 s, `{p=1.2}` custom pause, `*word*` emphasis (italic),
`{shake}…{/shake}`, `{slow}…{/slow}`, `{red}…{/red}`, `{dim}…{/dim}`. Use sparingly.

### 5.4 Doors (automatic)
- Each vertical run of `D` cells cut through a north/south wall becomes one door prop at the **bottom two
  cells** of the run (`door_class` default). Two adjacent D columns = one `door_double`. A `D` cell in a
  vertical wall (walls N & S of it) becomes a `door_side`.
- Override with `doors: { 'x,y': { type, state, lock, lockedText, label, id, to } }` keyed by the door's
  bottom-left cell, or by an `objects` entry of a door type at that cell.
- Behaviour: `closed` doors open when the player walks into them (sfx `door_open_wood`/`_metal`); `open`
  stays open; `locked`/`jammed`/`chained` show `lockedText`; a satisfied `lock` unlocks with sfx and becomes
  `open` permanently. Closed opaque doors block light and sight. The Colonel opens doors audibly.

### 5.5 Rooms, exits, triggers, lights, patrol
- `rooms[].kind`: `hall | classroom | office | restroom | stair | library | gym | cafeteria | kitchen |
  basement | auditorium | special | outside`. Halls are patrolled; visits are recorded for the sketchbook map.
- `exits` transfer on walk-in (`fade` default true; `fade: false` = seamless, used by the Ch1 front-door loop).
- `triggers` run a blocking script on enter; `once` records flag `trig_<map>_<id>`.
- Map lights: `{ type, x, y, group?, radius?, color?, intensity?, dir?, angle?, flicker? }` (tile coords;
  presets in §8). Group `'period'` lights are off unless a period is active.
- `patrol` is used by the Colonel AI (§11): graph nodes in tile coords; `folds` = wall seams he
  emerges from / sinks into; `peeks` = room doors he opens and the spot he looks from.

### 5.6 Past views (compact mirror, 1979)
```js
past: [ { id: 'principal_safe', rect: [x, y, w, h], hint: 'The portrait is open.',
          objects: [ { type: 'portrait_small', x, y, state: 'open' } ],     // shown only in the past view
          hide: ['w1_portrait_small_40_20'],                                // present props hidden in past
          figures: [ { sprite: 'figure79', x: 41, y: 22, anim: 'sit_up' } ],
          adair: { x: 40, y: 23, anim: 'point_left' },                     // optional Miss Adair figure
          text: [ { x: 38, y: 19, text: 'ASSEMBLY 1:45', style: 'chalk' } ],
          setFlag: 'saw_safe_past', script: null } ]
```
When the compact is used and the player stands inside a `past.rect`, the renderer draws that region with
`clean` tiles/props, warm light, the extra objects/figures, inside the compact's round frame. HUD shows a
faint sparkle on the compact icon while the player is inside any past rect.

### 5.7 Required anchors (maps must define these; scripts rely on them)
| Map | Anchors |
|---|---|
| exterior | `start` (by the car), `car`, `oak`, `front_doors`, `chute_exit`, `dawn_steps`, `dawn_lot` |
| lobby | `from_exterior`, `from_west1`, `from_east1`, `from_aud`, `aud_doors`, `portrait`, `memorial`, `plaque`, `danny_bag`, `bench`, `trophy` |
| west1 | `from_lobby`, `from_library`, `library_end` (just outside library doors), `danny_vanish`, `bulletin`, `door_102`, `in_102`, `door_103`, `in_103`, `desk_103_tess`, `desk_103_leah`, `desk_103_marcus`, `door_office`, `in_office`, `office_bench`, `pa_console`, `principal_portrait`, `colonel_fold_hall` |
| library | `from_west1`, `from_west2`, `spiral_bottom`, `spiral_top`, `leah_table`, `card_catalog`, `display_case` |
| east1 | `from_lobby`, `from_basement`, `from_east2`, `from_gym`, `stair_gate`, `dumbwaiter`, `gym_doors` |
| gym | `from_east1`, `denise`, `colonel_hoop`, `center`, `locker_tess`, `locker_room`, `marcus_photo`, `shower_mirrors` |
| basement | `from_east1`, `coal_heap`, `coal_chute`, `janitor_door`, `janitor_ledge`, `keyring`, `boiler`, `breaker_panel` |
| east2 | `from_east1`, `from_longhall`, `door_205`, `in_205`, `danny_desk`, `desk_205_tess`, `hall_pass`, `terminal`, `balcony` |
| longhall | `from_east2`, `from_west2`, `start`, `kevin`, `loop_reset` |
| west2 | `from_longhall`, `from_library`, `door_201`, `in_201`, `false_leah`, `desk_201_tess`, `mirror_2f`, `history_board`, `chem_window` |
| aud | `from_lobby`, `back_row`, `lectern`, `front_row_danny`, `front_row_leah`, `front_row_marcus`, `denise_husk`, `music_room`, `music_mirror`, `clarinet_case`, `trap_room`, `trapdoor`, `stage_left`, `stage_right` |
| vault | `from_aud`, `stair_bottom`, `sarcophagus`, `adair`, `to_breaker` |
| breaker | `from_vault`, `floor`, `stairs_1`, `stairs_2`, `office`, `register` |

## 6. Data: scripts (`src/data/scripts/<file>.js`)

```js
// src/data/scripts/ch1.js
export default {
  'ch1.portrait': async (g, ctx) => {
    await g.say('danny', 'grin', 'Dolan. Dolan. Look at this guy. He ate the Civil War.');
    await g.say('tess', 'smirk', 'He looks like he ate the *ammunition*.');
  },
};
```
`src/data/scripts/index.js` merges all files into one registry. Script ids: `<chapter>.<name>`
(`pro.*`, `ch1.*` … `ch8.*`, `end.*`, `item.*`, `sys.*`, `gen.*` for generic reusable bits).
A blocking script puts the game in `cutscene` mode. `ctx` = `{ prop, map, trigger }` when relevant.

### 6.1 The script context `g` (engine/script.js) — all awaitable unless noted
Dialogue/UI
- `say(who, expr, text, opts?)` — opts `{ light, grime, enrolled, side: 'left'|'right', name, closeup, speed, shake }`.
  For `who === 'voice'` expr is ignored (intercom styling). Portrait lighting defaults from map/period
  (`HW.renderer.portraitLight()`), grime from chapter.
- `think(expr, text)` — Tess's inner voice (italic, muted, smaller portrait).
- `narrate(text)` — no portrait.
- `choice(options, opts?)` → index. options: strings or `{ text, cond }`. opts `{ who, expr, prompt }`.
- `doc(docId)` — document reader; marks read; adds to Notes.
- `toast(text)` (sync) · `objective(text)` (sync; persisted; toast "Sketchbook updated").
- `card(title, subtitle?, { hold })` — full-screen title card.
- `cg(id | null, { fade })` — show/hide a CG backdrop behind dialogue.
- `overlay(name, args)` → result — special screens: `'pa' | 'safe' | 'terminal' | 'register' | 'locker' | 'vhs' | 'compact'`.
- `chapter(n)` — set chapter, show card, run `chapterSetup(n)` (game/chapters.js), checkpoint.
World
- `player` (sync getter) · `npc(id)` (sync) · `spawn({ id, sprite, at | x, y, dir, anim, solid, follow })` (sync) · `despawn(id)` (sync)
- `walk(id, target, { speed, run, ignoreSolid })` — target: anchor name | `[tx,ty]` | array of points; A* when needed.
- `face(id, dir)` (sync) · `anim(id, name, { once })` · `setPos(id, target)` (sync)
- `party.add(id)` / `party.remove(id)` / `party.has(id)` (sync)
- `transfer(mapId, anchor, { fade, dir })`
- `prop(id)` (sync) · `setProp(id, state, params?)` (sync, persistent) · `removeProp(id)` (sync, persistent) · `refresh()` (sync)
- `cam(target | null, { time })` — target: anchor | entity id | `[tx,ty]`; null = follow player.
- `wait(sec)` · `fade('out'|'in', sec, color?)` · `flash(color, sec)` (sync) · `shake(intensity, sec)` (sync)
- `fx(name, ...args)` (sync) — forwards to `HW.fx[name]`.
- `lights(group, on)` (sync) · `lightning()` (sync) · `flashlight(mode)` (sync: `true|false|'restore'`)
State
- `flag(name)` · `set(name, value = true)` · `inc(name, n = 1)` · `state` (raw) — all sync
- `has(item, n = 1)` · `give(item, n = 1, { silent })` · `take(item, n = 1)` — sync
- `checkpoint(label)` — autosave slot `auto`.
Audio
- `sfx(id, opts)` (sync) · `loop(id, opts)` → handle (sync) · `ambience(id)` · `music(id)` · `silence(on, fade)` (sync)
Encounters
- `periods` → `HW.periods` · `colonel` → `HW.colonel`
- `gameOver(reason)` — shows game-over screen, reloads checkpoint; never resolves.
- `ending(id)` — runs the ending sequence (`end.<id>` script), then credits/title.
Flow
- `parallel(fn)` — run an async fn without blocking (no dialogue inside).
- `run(scriptId, ctx)` — call another script inline.

### 6.2 Interaction resolution (engine/interact.js)
Confirm while facing a prop within reach (probe 12 px ahead of the feet):
1. `prop.script` → run it.
2. by catalog `interact`: `door` (§5.4) · `pickup` (give item, remove prop, toast `Got: <name>`) ·
   `examine` (show `examine`; `doc` opens the reader) · `transfer` (`to`) · `terminal|pa|safe|register` →
   scripts `sys.terminal|sys.pa|sys.safe|sys.register` · `switch|lever|script` need `prop.script`.
3. `seat` props: confirm = sit (Tess animates to the seat, sprite `sit_<sitDir>`); while seated, confirm
   shows the prop's examine (if any) else stands; any movement input stands up.
4. `hide: 'locker'`: confirm = climb in (sfx locker), sprite hidden, `HW.player.hidden = 'locker'`; confirm
   again exits.
Prompt: a small glyph above the prop (UI `HW.ui.prompt(propOrNull, verb)`; verbs: Look, Open, Take, Sit,
Hide, Use, Talk, Read).
Party banter: after an `examine` with `banter`, each present follower's line plays.

## 7. State (`engine/state.js`) & saves

```js
HW.state = {
  version: 1, chapter: 0, map: 'exterior', px: 0, py: 0, dir: 'down',
  flags: {},            // booleans / small numbers, see §13
  inv: {},              // itemId -> count
  docs: {},             // docId -> true (read)
  objective: '',
  party: [],            // follower ids in order
  battery: 100,         // Tess's flashlight charge 0..100
  flashlightOn: true,
  rollAnswered: 0,
  bonds: { danny: false, leah: false, marcus: false },
  visited: {},          // roomId -> true
  mapState: {},         // mapId -> propId -> { state, taken, params }
  playtime: 0,
}
```
- Slots: `auto` (checkpoint) + `1..3`. `localStorage['hallowell.save.<slot>']` JSON with a summary
  (chapter title, map name, playtime, date). Saving is allowed from the pause menu only when
  `HW.game.canSave()` (no period active, no chase, not in cutscene).
- Game over → `HW.game.loadSave('auto')`.
- Settings: `localStorage['hallowell.settings']` →
  `{ master: .8, music: .7, sfx: .9, ambience: .8, textSpeed: 1, pixelPerfect: true, crt: false,
     grain: true, reduceFlashing: false, fullscreen: false }`.

## 8. Lighting (`render/lighting.js`) — `HW.lighting`

- `init()`, `onMapLoad(map)`, `update(dt)`, `render(worldCtx, cam)` (multiplies the darkness map over the
  world buffer, then adds glows).
- `setAmbient(color, level)`; `setGroup(group, on)`; `addLight(def) → light`; `removeLight(light)`.
- `flashlight` — `{ on, x, y, angle, power (0..1), flicker }` (set every frame by game/flashlight.js);
  cone ≈ 55°, radius ≈ 130 px at full power, soft edges, dust motes visible inside it.
- `lightning(strength)`; `lightAt(x, y) → 0..1` (how lit a point is; used by the Colonel's vision).
- Shadows: visibility polygons against opaque cells (walls/void/closed doors/opaque props).
- Presets (`type`): `flashlight`, `window` (auto: moonlight shaft from each face window, faint, blue),
  `fluor` (cool white-green, buzz flicker, rect-ish radius 4.5 tiles), `exit_sign` (red, r 2), `lamp_green`
  (r 3), `bulb` (r 4, warm), `boiler` (r 7, fire flicker), `candle`, `lamp_miner`, `spot` (narrow cone
  downward / circle on stage, r 5), `streetlamp`, `headlights` (cone), `crt` (r 2), `led_red` (r 1),
  `mine_fire` (huge, red, from below), `dawn` (ambient gray-violet). Each accepts overrides.

## 9. FX (`render/fx.js`) — `HW.fx`

- Particles: `emit(type, x, y, n)` — `dust`, `steam`, `drip`, `splash`, `spark`, `coal_dust`, `amber_motes`,
  `paper`, `ember`, `breath` (cold breath puff).
- Weather & ambience: `rain(on, intensity)` (exterior full-screen streaks + splashes), `dustMotes(on)`.
- Screen: `shake(i, d)`, `flash(color, d)`, `fade(dir, d, color) → Promise`, `distort(amount, d)`,
  `chroma(amount, d)`, `vignette(target, d)`, `grain(amount)`, `vhs(on)`, `pulse(color, d)`.
- Post settings respected: `grain`, `crt` (scanlines + slight curvature), `reduceFlashing` (caps flashes,
  disables strobe flicker, softens lightning).
- `update(dt)`, `renderWorld(worldCtx, cam)` (particles in world space), `renderPost(worldCtx)` (screen FX).

## 10. Audio (`src/audio/*`) — `HW.audio`

- `init()`, `unlock()` (on first gesture), `update(dt)`.
- `sfx(id, { x, y, vol = 1, rate = 1 }) → { stop() }` — positional if x/y given (pan + distance falloff +
  lowpass when occluded via `HW.audio.occluder(x0,y0,x1,y1) → 0..1`, set by the engine).
- `loop(id, { x, y, vol }) → { stop(fade), setPos(x, y), setVol(v, fade) }`.
- `ambience(id | null, fade = 2)` · `music(id | null, fade = 2)` · `silence(on, fade)` · `duck(level, fade)`.
- `footstep(surface, { run, x, y })` · `blip(charId)` (typewriter voice blip) · `murmur(sec)` (Colonel).
- `setListener(x, y)` · `setVolumes({ master, music, sfx, ambience })`.
- `renderOffline(kind, id, seconds) → Promise<Float32Array>` for QA (kind: 'sfx' | 'ambience' | 'music').

**SFX ids** (all must exist): `ui_move`, `ui_confirm`, `ui_cancel`, `ui_open`, `ui_close`, `page_turn`,
`item_get`, `objective`, `door_open_wood`, `door_close_wood`, `door_open_metal`, `door_close_metal`,
`door_locked`, `door_creak_slow`, `door_slam`, `key_unlock`, `chain_rattle`, `padlock`, `bolt_cutters`,
`locker_open`, `locker_close`, `locker_tap`, `gate_rattle`, `flashlight_click`, `battery_swap`,
`flashlight_flicker`, `flashlight_roll` (plastic rolling), `camcorder_click`, `camcorder_whir`, `vhs_noise`,
`intercom_crackle`, `intercom_chime` (two-tone), `school_bell` (long), `bell_short`, `fluor_on` (tubes
stuttering on), `fluor_off`, `colonel_breath`, `colonel_breath_fast`, `colonel_drag`, `colonel_hm`,
`colonel_jingle`, `colonel_lunge`, `colonel_grab`, `colonel_sink`, `whistle`, `whistle_breath`, `squeak`,
`glass_tone`, `glass_write`, `husk_rustle`, `cicada_click`, `chalk`, `chair_scrape`, `desk_creak`,
`paper_rustle`, `typewriter_key`, `trs80_key`, `trs80_beep`, `safe_click`, `safe_open`, `stamp`,
`pen_scratch`, `book_close`, `lever_pull`, `trapdoor`, `drip`, `splash`, `pipe_knock`, `steam_hiss`,
`coal_slide`, `boiler_door`, `lightning`, `thunder`, `wind_gust`, `heartbeat`, `breath_hold`,
`breath_release`, `tape_play`, `mixer_start`, `dumbwaiter`, `crowd_murmur`, `applause_old`,
`record_crackle`, `stinger_soft`, `stinger_hard`, `collapse_rumble`, `dust_fall`, `footstep_heavy_above`.
**Ambience ids:** `exterior_rain`, `car_interior`, `hall`, `classroom`, `office`, `restroom`, `library`,
`cafeteria`, `kitchen`, `gym`, `basement`, `boiler_room`, `stairwell`, `auditorium`, `assembly`, `vault`,
`breaker`, `dawn`, `period_buzz` (layer added during periods), `silence`.
**Music ids:** `title` (music-box alma mater, detuned), `drone_1`, `drone_2`, `drone_3`, `phonograph`
(warped alma mater with crackle), `chase`, `register`, `ending_good`, `ending_true`, `ending_bad`, `credits`.

## 11. Game systems (`src/game/*`)

- `flashlight.js` — battery drain (100 → 0 in ~300 s on), low-battery flicker < 20%, aims along facing
  (smoothly), off during cutscenes unless forced; `engine:use_battery`, `engine:toggle_flashlight`.
- `periods.js` — `HW.periods`: `enable(cfg)`, `disable()`, `start({ scripted, length })`, `end()`,
  `active`, `timeLeft`, `onStart/onEnd` hooks. Warning: crackle + chime ~10 s before the bell. Lights group
  `period` on during periods; ambience layer `period_buzz`. Suppressed during cutscenes and in maps without
  `patrol`. Config per chapter lives in `game/chapters.js`.
- `colonel_ai.js` — `HW.colonel`: `spawn(at)`, `despawn()`, `mode` (`'patrol'|'scripted'|'chase'|'sleep'|
  'assembly'|'off'`), `walkTo(target)`, `lunge`, vision cone (100°, 7 tiles dark / 10 if target lit),
  hearing (noise events), search of hiding spots seen being entered, catch → `HW.game.gameOver('caught')`.
  Movement: drag 26 px/s; chase = lurches (150 px/s for 0.5 s every ~1.4 s); "notice" delay 0.8 s with `hm`.
- `noise.js` — `HW.noise.emit(x, y, radius, kind)` (running = 7 tiles, walking = 1.5, doors = 5, items = 8).
- `patrol.js` — Safety Patrol (Kevin) sentinel behaviour.
- `hiding.js` — seated/locker state, "still" detection (no movement input for ≥ 0.5 s).
- `compact.js` — `HW.compact`: `use()`, `active`, past-view selection.
- `chapters.js` — `chapterSetup(n)`: party, period config, objectives defaults, map variants.
- `endings.js` — Register rules (DESIGN §8) and ending resolution.

## 12. Art (`src/art/*`) — `HW.art` facade (`src/art/index.js`)

- `init(onProgress)` → Promise; generates and caches everything.
- `drawTile(ctx, key, px, py, { kind, mask, variant, clean })` — `kind` for walls/windows: `'top' |
  'face_high' | 'face_low'`; `mask` = 4-bit wall-neighbour mask (N1 E2 S4 W8) for tops/railings/pits;
  `variant` = stable per-cell integer; `clean` = 1979 version.
- `prop(type, { state, dir, variant, clean, frame, occupant }) → { canvas, ox, oy }` — draw at
  `(x*16 + ox, y*16 + oy)` (ox/oy may be negative for tall art).
- `drawPropDynamic(ctx, type, px, py, params, t)` — for `dynamic` props (clock, chalkboard, memorial board).
- `sprite(id) → { fw, fh, ax, ay, anims: { [name]: { frames: Canvas[], fps, loop } } }` — (ax, ay) = feet
  point inside the frame. Standard human anims: `idle_<dir>`, `walk_<dir>` (4 frames), `run_<dir>`
  (optional), `sit_<dir>`; plus per-character specials:
  - tess: `heads_down`, `flinch_down`, `pickup_down`, `collapse`
  - danny/leah/marcus: `heads_down`; leah: `film_<dir>`; `*_e` variants: `sit_up` writing loop, `idle_down` sway
  - colonel (64×64): `idle_<dir>` (breathing), `drag_<dir>`, `lunge_<dir>`, `mound`, `rise` (once), `reach_<dir>`,
    `lectern_down`, `lectern_scan`, `sink` (once), `emerge` (once), `peek_<dir>`, `dissolve` (once)
  - kevin: `idle_<dir>`, `whistle_down`, `hand_out_down`
  - denise: `sit_play`, `idle_down`, `wrong`
  - adair: `idle_<dir>`, `point_<dir>`, `write`
  - figure79: `idle_<dir>`, `sit_up` · husk_a..d: `sit_up`, `sit_down`, `idle_down`, `turned`, `crumble` (once)
  - breakerboy: `sit_left`, `sit_right`, `sit_up`
- `portrait(char, expr, { light, grime, enrolled }) → Canvas (96×120)`; unknown expr → `neutral`.
- `cg(id) → { draw(ctx, t, params) }` — 480×270 backdrops: `car_interior`, `colonel_hand`, `colonel_face`,
  `locker_slits` (params: { phase, faceIn }), `vhs_frames` (params: { frame }), `register_book`,
  `breaker_reveal`, `title_bg`, `ending_dawn`, `ending_present`, `ending_truant`, `coda_2013`.
- `icon(itemId) → Canvas (24×24)`; `glyph(name) → Canvas` (UI glyphs: prompt verbs, battery, compact sparkle).

## 13. Story flags (shared vocabulary; `HW.state.flags`)

`pro_doors_cut` · `ch1_rooms_entered` (count) · `ch1_danny_vanished` · `ch1_102_rows` · `ch1_front_loop` ·
`ch2_bell1` · `ch2_leah_taken` · `ch2_vhs_seen` · `ch2_marcus_told` · `east_doors_open` · `ch3_jan_key` ·
`ch3_colonel_stirred` (0..2) · `ch3_keyring` · `coalbin_empty` · `periods_1f` · `office_open` · `ch4_pa_used` ·
`roll1_done` · `roll1_answered` · `gate_2f_open` · `ch5_danny_found` · `bond_danny` · `ch5_205_period_done` ·
`hall_pass` · `longhall_cleared` · `false_leah_done` · `adair_met` · `compact_unlocked` · `ch5_leah_found` ·
`bond_leah` · `library_door_open` · `case_key` · `charter` · `safe_seen_past` · `safe_open` · `gym_open` ·
`ch6_marcus_taken` · `roll2_done` · `roll2_answered` · `ch6_showers` · `truant_available` · `ch7_assembly` ·
`roll3_done` · `roll3_answered` · `diary_page` · `bond_marcus` · `trapdoor_open` · `ch8_vault` · `adair_note` ·
`breaker_seen` · `register_done` · `expelled` · `withdrawn_danny` · `withdrawn_leah` · `withdrawn_marcus` ·
`withdrawn_tess` · `form_used_on` (id) · `ending` (id) · `colonel_named` · `portrait_state` ('seated'|'empty'|'uniform').
`HW.state.rollAnswered` mirrors the three `rollN_answered` flags.

## 14. Debug & test API — `window.__HW` (engine/debug.js)

```
__HW.ready                         true once title screen is up
__HW.state()                       deep copy of HW.state
__HW.newGame({ skipIntro })        start a new game (skipIntro jumps past title/prologue cards)
__HW.teleport(mapId, anchorOrTx, ty?)
__HW.setFlag(k, v) / give(item, n) / setChapter(n)
__HW.run(scriptId) -> Promise      run a script as a cutscene
__HW.autoAdvance(on)               dialogue auto-advances instantly; choices pick from __HW.choiceQueue (shift) or 0
__HW.choiceQueue                   array of indices consumed by choices
__HW.god(on)                       Colonel cannot catch; game over disabled
__HW.timeScale(x)                  speed up the simulation
__HW.press(action, ms) -> Promise  hold an input action
__HW.walkTo(target) -> Promise<bool>  pathfind & walk the player with simulated input (anchor | [tx,ty])
__HW.interact() -> Promise         press confirm once and wait until the game is idle again
__HW.pathExists(mapId, from, to)   BFS reachability on the collision grid (respecting current doors)
__HW.idle() -> Promise             resolves when no cutscene/menu is active
__HW.errors                        array of captured errors (window.onerror + console.error)
__HW.mode()                        current game mode
```

## 15. Ownership (Foundation phase)

| Area | Files | Owner |
|---|---|---|
| Contracts | `docs/*`, `src/engine/hw.js`, `src/data/{tiles,props,chars,items}.js`, `src/art/palette.js`, `src/art/util.js`, `tools/{serve,shot,build}.mjs` | lead (ask in report for changes) |
| Engine | `src/main.js`, `index.html`, `src/engine/*` (except hw.js), `src/render/renderer.js`, `src/game/flashlight.js`, `src/game/hiding.js`, `src/data/maps/index.js`, `src/data/maps/test*.js`, `src/data/scripts/index.js`, `src/data/scripts/test.js`, `tests/*` | engine agent |
| Lighting/FX | `src/render/lighting.js`, `src/render/fx.js`, `tools/preview/lighting.*` | lighting agent |
| Audio | `src/audio/*`, `tools/preview/audio.*` | audio agent |
| UI | `src/ui/**`, `tools/preview/ui.*` | UI agent |
| Art: tiles | `src/art/tiles.js` (+ `tiles_*.js`), `tools/preview/tiles.*` | tiles agent |
| Art: props | `src/art/props.js` (+ `props_*.js`), `tools/preview/props.*` | props agent(s) |
| Art: sprites | `src/art/sprites.js`, `src/art/colonel.js` (+ `sprites_*.js`), `tools/preview/sprites.*` | sprites agent |
| Art: portraits | `src/art/portraits.js` (+ `portraits_*.js`), `tools/preview/portraits.*` | portraits agent |
| Art: CG & icons | `src/art/cg.js`, `src/art/icons.js` (+ `cg_*.js`), `tools/preview/cg.*` | CG agent |
| Art facade | `src/art/index.js` | lead (stable; implementers export the functions it imports) |

## Changelog
- v1 — initial contract.
