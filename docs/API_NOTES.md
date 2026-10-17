# HALLOWELL — API notes (v2.1 additions from the foundation build)

Authoritative supplements to TECH.md, as reported by the subsystem implementers. Additions only; TECH.md names are unchanged.
Sections: UI, Engine, Lighting/FX, Audio. Each lists api_additions, known issues and integration requests.


## UI

### API additions
The whole stub surface is kept with the same names and signatures (TECH §6.1, §6.2, §15–16). These are additions — please record them in TECH.md's Changelog, since docs are read-only for me:

**New on `HW.ui`:**
- `HW.ui.menuOpen()` → true while a world-pausing menu is open: pause, inventory, sketchbook, settings, saveload.
- `HW.ui.get(name)` → the live screen instance. For the PA console: `HW.ui.get('pa').setMode('listen'|'talk'|'allcall')`, `.setRoom(id|null)` (flips that room's switch), `.setLevel(0..1|null)` (drives the VU needle). This covers "the console switches itself to ALL CALL".
- `HW.ui.reset()` clears dialogue, screens, CG, overlays and toasts, and resolves anything pending. The engine already calls it.
- `HW.ui.overlay` is an alias of `setOverlay`.
- `HW.ui.transcript` — the last 400 lines, choices, toasts and docs, for debugging.
- `HW.ui.compactCircle` = `{x:240, y:135, r:100}` in world px: the glass circle the UI leaves clear.
- `HW.ui.input.keyLabel(action)` gives the key name for an action, or pad button names when the last device was a gamepad.

**Extra screens through `open()`:**
- `'doc'` with `{ id }`
- `'card'` with `{ title, subtitle, hold }`
- `'confirm'` with `{ text, yes, no, danger }` → true or false
- `'title'` and `'gameover'`

`close('title')` resolves the title with null.

**Options:**
- `say()` options: `name` overrides the plate (e.g. the mimic as 'Danny?'), `speed` multiplies the text speed, `shake` is a number (box jitter), and `side`, `closeup`, `enrolled`, `light`, `grime` behave as specified.
- `choice()` options: `{ who, expr, prompt }` — the prompt types out in the box before the list appears.
- `card()`: ending codes (DISMISSED, WITHDRAWN, PRESENT, TRUANT) get the stamp treatment; 'II — First Period' is split into numeral and name automatically.

**Overlay parameters:**
- `vhs`: `{ frame, timestamp, blue }` — `blue: true` shows the ▶ PLAY blue screen.
- `compact`: `{ on, hint }` — hint is shown as Tess's thought under the mirror.
- `black`: `{ alpha }`.

**Document data (all optional):** `formHeader` for `kind:'form'`; form lines of the form "LABEL: value" draw the value in the doc's `hand`; `*em*` is supported in bodies.

**Register model (optional fields):** `tools[i].comment` (Tess's caption in the tray) and `tools[i].unavailableText`.

**Automated tests:** `HW.debug.screenAnswer?.(name, args)` can force a screen's result. Under autoAdvance, with no override:
- safe: brute-forces `check()` and returns true or false
- breath: 'held'
- pa, terminal, register: resolve null at once
- doc: marks the document read and resolves
- card: resolves at once
- title: `{action:'new'}`
- gameover: 'retry'

**Optional dependency:** `HW.audio.level?.()` (0..1) drives the PA needle if present; otherwise the needle moves on a procedural signal.

**Engine naming differences I support:**
- Save: TECH says `HW.game.saveTo(slot)`; the engine implements `save(slot)`. I support both, and read summaries from `HW.game.saves()`.
- Typed text: `HW.input.typed` is an accumulating array; I consume it with `splice(0)`.
- World position: I use `HW.camera.toUI()`.
- Examine: I use `HW.game.examineItem(id)` for Examine.
- Fullscreen: I call `HW.display.toggleFullscreen(v)`, because `settings.apply` doesn't handle fullscreen.

### Known issues
- **Stub art still shows.** title_bg (its "CG title_bg" label shows top-left) and the item icons are still placeholders. Nothing throws; it will look right once those land.
- **First-floor map is small.** It spans about 226 tiles, so the fit-to-page plan is small with abbreviated labels. Confirm zooms in around Tess.
- **Keyboard and gamepad only in menus.** A mouse click advances dialogue, but menus have no hover or click.
- **No kerning in dialogue.** Dialogue text is laid out glyph by glyph, which is fine for the pixel face. Documents and labels keep kerning.
- **The think() inset depends on face placement.** It crops the region (20, 10, 56×56) from Tess's 96×120 portrait. That matches the current portraits, but a redesign that moves her face would need the crop updated.
- **Credits roll once and close.** The engine's ending flow waits on them; from the title they can also be left early with cancel.
- **dist/hallowell.html was rebuilt.** I ran `tools/build.mjs` to verify the bundle, and that file is tracked in git, so it now shows as modified (tests/smoke.mjs also rebuilds it). Please rebuild or discard as you see fit.
- **fonts.json is unchanged.** Pixelify Sans is unused by the UI but kept, because the engine's loading screen uses it. The UI draws ← → as pixel triangles because the bundled latin subset of DotGothic16 lacks those two arrows; ↑ and ↓ are included.

### Requests
- **Engine:**
  1. Consider adding `HW.game.saveTo` as an alias of `save` to match TECH (the UI already copes either way).
  2. `settings.apply()` doesn't apply fullscreen; the UI calls `display.toggleFullscreen` itself — fine, or fold it into `apply`.
  3. Keep `HW.player.seated` and `HW.player.hidden` as they are; the HUD and locker hint read them.
- **Audio:**
  1. Optionally expose `HW.audio.level()` (0..1, current output) so the PA VU needle follows the real sound.
  2. The UI uses these sfx ids: ui_move, ui_confirm, ui_cancel, ui_open, ui_close, page_turn, paper_rustle, book_close, typewriter_key, stamp, pen_scratch, safe_click, safe_open, door_locked, trs80_key, trs80_beep, intercom_crackle, heartbeat, breath_hold, breath_release, glass_tone, objective.
  3. Blips: `blip(who)` with who = 'voice' for the intercom (CHARS.voice.blip is 'intercom') and the character id otherwise.
  4. `murmur(sec)` for the Colonel.
  5. Title music: `music('title')` is called right after `unlock()` on "Press any key".
- **CG:**
  1. title_bg: keep art y≈45–125 calm (the logotype sits there) and art y≈160–240 darker (the menu is drawn there).
  2. All CGs should fill the whole 480×270 frame; the UI also paints black underneath.
- **Icons:** they are shown at 2× (inventory grid, Register tray) and 4× (inventory detail card), so they need to read at both. The Register tray uses withdrawn_stamp, transfer_form and red_pen.
- **Portraits:** keep Tess's face inside the (20, 10, 56×56) region of her portrait for the think() inset. Portraits look best with a transparent background; they stand behind the dialogue box with the bottom 28 art px hidden.
- **Lead:**
  1. Please record the API additions above in TECH.md's Changelog.
  2. Document content can use the doc kinds and hands as listed. A "LABEL: value" line in a form doc gets a handwritten value; `formHeader` is optional.


## Engine

### API additions
Additions only; nothing in the contract was renamed or removed. Please add these to the TECH Changelog (docs are read-only for me).

**Registry slots (not in hw.js):**
- `HW.interact`: `openDoor(prop, {by, silent, hold})`, `closeDoor(prop)`, `tryDoor`, `bump`, `target`, `verb`.
- `HW.flashlight`: `toggle()`, `useSource('maglite'|'danny')`, `useBattery()`, `force(mode)`, `on`, `source`, `offInCutscenes`.
- `HW.hiding`: `sit`, `stand`, `enterLocker`, `exitLocker`, `isSafe()`, `restorePoint()`, `seatNpc(e, prop, {walk, run})`, `unseatNpc(e)`, `nearestSeat(x, y, {room})`.

**HW.game:**
- `on/off/emit` events: mode, mapLoad, roomEnter, propChange, doorOpen, doorClose, flag, item, doc, chapter, checkpoint, save, load, transfer, gameOver, ending, sit, stand, hide, unhide, compact, batteryDead, refresh, newGame.
- `controllable`, `paused`, `room`, `transferring`.
- `loadMap`, `transfer(map, at, {fade, dir, auto})`.
- `setProp` / `removeProp`, which also work for maps that aren't loaded.
- `save` / `saveTo`, `saves()`, `saveSummary(slot)`, `hasSave`, `checkpoint(label)`.
- `examineItem(id)`, `openMenu(name)`, `until(pred, sec)`, `tween(sec, fn)`.
- `timeWarp`: the ×4 time while Tess's eyes are shut, set by hiding.js; peeks run at normal speed if the AI sets `HW.colonel.peeking`.

**HW.scripts:** `run(id, ctx, {blocking})`, `runFn`, `has`, `abortAll`, `blocking`, `replaying`.

**g additions:**
- `g.examine(spec, {speaker})`, `g.banter(map)`.
- `g.seen(scene)`: returns whether it was already seen, sets `seen_<scene>`, and marks dialogue as replay (`opts.seen`).
- `g.light(id, spec|null)`: a light attached to an entity, saved in `HW.state.entityLights`.
- `g.replaying`.
- `g.spawn` also accepts `script` (makes the NPC talkable), `light`, `follow`, `px/py`.
- `g.face(id, entityId | anchor)` turns to face a target.
- `g.anim(id, name, {once, hold})`, where `hold` keeps the last frame.

**Data fields:**
- Exits: `lock`, `lockedText`, `refuse`; an exit can be gated and refuses in voice.
- Triggers: `blocking: false`.
- Door / prop instances: `autoClose`, `verb`, `noSit`, `interact: false`.
- Prop runtime: `promptX/promptY` (the UI already reads them), `seatedBy`.
- Auto door ids use the door's bottom-left cell: `<map>_door_<x>_<y>`.

**HW.state additions:** `checkpoint`, `assist` (1 or 1.3), `lightSource`, `entityLights`, `deaths_<label>` flags. The starting inventory is Tess's bag from DESIGN §3.

**HW.player:** `hidden`, `seated`, `still`, `sitTime`, `eyesShut`, `busy`, `aimX/aimY`, `running`. Entities also have `tall`, `seat`, `setLight()`.

**Display, camera, input:**
- `HW.display.setFullscreen` / `setPixelPerfect` / `toUI`.
- `HW.camera.view`, `pan()`, `toUI()`.
- `HW.input.keyName` / `bindings` / `holdTime` / `setVirtual` / `tap` / `mouse`.

**Debug (`__HW`):**
- `HW.debug.screenAnswer(name)`, set from tests with `__HW.screenAnswer(name, value)`.
- `HW.debug.fullbright`, `showGrid` (F3), `infiniteBattery`, `transcript`.
- `__HW.player()`, `prop()`, `map()`, `face()`, `steps(n)`, `save` / `load` / `checkpoint`, `refresh()`.

**Deviations, all deliberate:**
1. Under `autoAdvance`, the engine itself skips the UI for say/think/narrate/choice/doc/card, logs them to the transcript, and picks choices from the queue. The queue index counts visible options; scripts still receive the original index. This keeps tests independent of the UI module. `g.screen` still goes through the UI's own auto-answer.
2. The flashlight is **not** switched off in cutscenes, because that would black out every examine dialogue. Instead the battery doesn't drain and the beam's aim holds. `HW.flashlight.offInCutscenes = true` gives the literal TECH behaviour.
3. Function locks follow CONTENT §1: `(s) => true` means locked. This contradicts TECH §5.2's "locked while not satisfied" reading — please reconcile the two documents.
4. Without a `pro.start` script, `newGame({skipIntro:true})` goes to `exterior:start` if that map exists, otherwise `test:start`. A `pro.skip` script, if present, is run instead.

### Known issues
- Lighting, FX and audio are still stubs on disk, so nothing was checked against their real versions:
  - shake depends on `HW.fx.offset`;
  - entity-light and flashlight fields beyond `{on, x, y, angle, power, flicker}`;
  - `onLightsChanged`;
  - footstep options.
  The engine guards every one of these calls, so a missing method does nothing rather than crashing.
- The tile and prop art are still stubs. Layering was checked with the stub blocks plus the real Colonel and UI art; the floor-layer `door` threshold drawn with `kind:'top'` has not been seen with real tile art.
- Followers can briefly cut corners or overlap furniture, because they follow the breadcrumb trail without collision.
- After a teleport they line up behind Tess, or to her side or front if that space is blocked.
- Rendering of the past view's chalk text uses the 3×5 `tinyText` font.
- Hall lockers in the test map are hide spots so the gym-locker mechanism is covered by tests. In the story (DESIGN v2), only instances marked `hide: 'locker'` hide Tess.
- Gamepad support is tested with a simulated pad only; fullscreen can't be verified headless beyond "no errors".
- `npm run build` rewrites `dist/hallowell.html`, which is tracked in git.

### Requests
- **Lead / items.js:** add `use: 'engine:use_danny_flashlight'` to `danny_flashlight`. The engine has a default for it until then.
- **Lead / docs:**
  - Reconcile the lock-function meaning (CONTENT §1 says `true` = locked; TECH §5.2 reads the other way).
  - Note that `HW.noise.emit` radius is in tiles (CONTENT) where TECH §11 is ambiguous; I emit walk 1.5, run 7, door 5.
  - Add the additions above to the Changelog.
  - `src/main.js` imports only the subsystems that exist today. When `game/index.js` (periods, colonel_ai, noise, patrol, chapters, endings…) exists, add `import './game/index.js'` after the systems are created. It should register itself through `HW.game.addSystem` and set `HW.game.chapterSetup`.
- **FX:** expose `HW.fx.offset = {x, y}` (the current shake in world px). The camera adds it, so don't also shift the buffer in `renderPost`. `fx.fade` must resolve; transfers give up waiting after the fade time plus 1.5 s.
- **Lighting:**
  - Read `map.lightDefs` (prop lights carry `propId`, plus `on` and `flicker` taken from prop state) and `map.opaque` / `opaqueVersion`.
  - Implement `onLightsChanged(map)`, which the engine calls when prop lights change.
  - `HW.lighting.flashlight` is mutated every step with extra fields `cone` (radians), `color` and `source`.
  - `addLight` is used for entity lights; the engine updates the returned object's `x/y` (tile units, centre = x*16+8), `px/py` and `angle` every step.
  - Shroud dimming should read `HW.colonel.shrouded` and the Colonel's position.
- **UI:**
  - `HW.ui.reset()` is called on new game, load and title; `HW.ui.close('title')` when the debug API starts a game.
  - Say/think/narrate opts carry `seen: true` on replays (`HW.scripts.replaying` also works) for the hold-Cancel fast-forward.
  - The compact overlay receives `{ on, hint, id }`.
  - `HW.ui.render(ctx)` gets the UI buffer, which the engine clears every frame.
- **Systems agent (Colonel / periods / patrol):**
  - Use `HW.hiding.isSafe()` and `HW.player.seated` / `still` / `sitTime` / `hidden`.
  - Use `HW.interact.openDoor(p, {by:'colonel', hold:true})` and `closeDoor`.
  - `map.findPath(..., {radius, doors:true})`, `map.los`.
  - Set `HW.colonel.entity` and `shrouded`, and `HW.colonel.peeking` during peeks so they play at normal speed.
  - Followers sit via `HW.hiding.seatNpc(e, HW.hiding.nearestSeat(x, y, {room}))`.
  - `HW.state.assist` is 1 or 1.3.
  - Register systems with `HW.game.addSystem`.
  - Catches call `HW.game.gameOver(reason)`, which respects `HW.debug.god`.
- **Audio:** `footstep(surface, {run, x, y, npc, id})`; NPC and follower steps also call it, flagged `npc: true`. Implement `occluder` reads; the engine assigns the function.


## Lighting & FX

### API additions
All additions; nothing from TECH.md is renamed or removed. Please record these in the TECH changelog.

**HW.lighting**
- `selfGlow` = `{ on, x, y, radius, intensity }`. x,y track the flashlight; it is off while `HW.player.hidden`.
- `onLightsChanged(map)`: map.js already calls this. Prop light changes keep their live state (current level, transitions, flicker).
- `setAmbient(color, level, time = 0.8)`
  - `level` means darkness 0..1, the same as `map.dark` (0.98 is near black). `color` null keeps the current tint.
  - It eases over `time` and resets on the next map load.
- `setGroup(group, on, opts)`
  - opts: `{ mode: 'stutter'|'fade'|'bang'|'instant', stagger, delay, time }`. `on = null` clears the explicit state.
  - Group state is global, so a period spans map loads.
  - Groups that were never set count as on, except `'period'`. A map data light with `on: false` stays off until its group is explicitly switched on (use this for the gym1–4 banks and breaker lamp_N). A prop whose own state is off stays off whatever its group does.
- `groupOn(group)`, plus read-only getters `lightningLevel`, `lights` and `stats` (`{ ms, avg, lights, rebuilt, segs }`).
- `addLight(def)` extra fields:
  - Position as `px`/`py` (world px) as an alternative to `x`/`y` (tiles).
  - `map`: scopes the light to one map id. Dynamic lights otherwise survive map loads until `removeLight`, which the entity-attached lights rely on.
  - Shape and look: `shadows`, `shape: 'tube'`, `cone`, `twin` (headlights), `disc` (spot), `cage`, `jitter`.
  - Halo: `glow`, `glowDx`, `glowDy`; transition length: `fade` (seconds).
  - `flicker`: `true` = the preset's dying variant, a string = a named curve, `false` = steady.
  - The returned object is live: mutate x/y or px/py, angle, on, intensity, power, color, radius.
- `flashlight` also reads `cone` (full angle in radians, as flashlight.js already writes), `color` and `radiusScale`. Cone values above 2π are treated as degrees.
- Map data `moon` (0..1): moonlight shaft strength. Defaults to 1 indoors and 0 when `floor === 'EXT'`.
- Class exports `LightingSystem` and `FxSystem` alongside the singletons (the preview builds several instances).

**HW.fx**
- `offset {x, y}`: the camera shake offset.
- `renderLit(ctx, cam)`: called by `lighting.render` before the multiply. `renderWorld` falls back to drawing it itself when lighting was skipped (fullbright debug).
- `reset()`, getter `faded`, field `particles`.
- `emit(type, x, y, n, opts)` with opts `{ z, dir | angle, spread, vx, vy }`.
- `distort(amount, d)` and `chroma(amount, d)`: `d = 0` holds the effect until set again.
- `vignette(target, d)`: 0 = none, 0.25 = resting default, 1 = tunnel. `pulse(color, d)` and `grain(amount)` work as listed in TECH §9.

### Known issues
- **Timing caveat.** The timings come from headless software rendering. Expect similar JS time on a laptop GPU, but the raster cost there is unmeasured.
- **First-frame spike.** The first frame on a map takes about 13–21 ms while textures and light sprites are built. A door changing `opaqueVersion` rebuilds visible light polygons on demand (a few ms once).
- **Pixel pass cost.** VHS + distort + chroma costs about 2–2.7 ms per frame while active, mostly the `getImageData` readback plus the JS loop. Distort alone is about 0.65 ms.
- **Halo and light placement.** Glows assume the fixture art sits at the light's position (cell or footprint centre). Exceptions: streetlamp glow is assumed 26 px above the post base; headlights should be placed at the car's front with an `angle`.
  - Once props art exists, map/prop authors may need `glowDy`/`glowDx`, or an explicit light x,y for car_wagon (its default is the car's centre).
- **Tall opaque props.** Free-standing opaque props (bookshelf_tall, curtain) light their upper art through a fixed 13 px raised top. This is an approximation, since I don't know the real art heights.
- **Shadow edges.** Shadows are soft (about 2 px) because of the half-res lightmap.
- **Moon direction.** The moon direction (shafts leaning south-east) is a constant.
- **No fake dark state.** Darkness is honest multiply: with very dark art palettes some props will read near-black outside light.
- **Paused updates.**
  - `lighting.update` isn't called while the game is paused, so flicker freezes in the pause menu (intended).
  - `fx.update` isn't called in 'menu' mode, so a fade started from a menu completes only via the engine's `bounded()` timeout.

### Requests
- **Lead / docs.**
  - Please add the API additions above to the TECH changelog.
  - TECH §8 doesn't give units for the flashlight `cone`; game/flashlight.js uses radians (full angle) and I accept that. Presets are in degrees; both are handled.
  - `setAmbient` `level` means darkness, the same as `map.dark`.
- **Engine.**
  - Call `HW.fx.reset()` on game over, load and new game to clear particles, shake and VHS.
  - Keep exposing `HW.colonel.shrouded` and `HW.colonel.entity` (or x/y); lighting consumes them for the shroud.
  - Optionally create the world canvas with `{ willReadFrequently: false }` (the default is fine). The readback warning seen in the engine comes from art init, not from lighting or FX.
- **Systems.**
  - Periods should call `HW.lighting.setGroup('period', true)` and `(…, false)`. Stutter-on and the fluor_on sounds are automatic, so don't also play fluor_on for those switches.
  - The gym beat should switch each bank with `setGroup('gymN', true, { mode: 'bang' })`, 0.45 s apart.
  - Breaker lamps: map lights `{ type: 'lamp_miner', group: 'lamp_N', on: false }`, then `setGroup('lamp_N', true)`.
  - Ch1 vanish: `setAmbient(null, 0.98)`; Danny's dropped light via `addLight({ type: 'flashlight', power: 0.35, cone, color, px, py, angle })`.
  - Assembly spotlight drift: mutate the returned spot light's x/y.
  - Colonel's vision: `HW.lighting.lightAt(x, y)` excludes Tess's self-glow.
- **Map authors.**
  - Exit signs and cage bulbs light correctly when placed on face_low rows. Window moonlight is automatic from `W`/`U` face cells.
  - Exterior maps get no shafts; set `data.moon` to override.
  - Use `flicker: true` for a dying fixture and `flicker: false` to keep a fluorescent from auto-going-bad.
  - Map lights accept `fade` (seconds), `glowDy`, `radius` (tiles), `intensity`, `color`, `angle`/`dir`.
- **Audio.** Uses positional `sfx('fluor_on', { x, y, vol })` and `sfx('fluor_off', { x, y })`.
- **Props art.** If exit_sign / cage_bulb / lamp_banker art places the glowing element away from the cell centre, tell me (or the map author) the offset so it can go into the presets' `glowDy`.


## Audio

### API additions
These are additions only; the contract API is unchanged. Proposed changelog line for TECH §10: "v2.1 audio: setSpace/layer/stripAmbience/level/stopAll; sfx opts dur/delay/pan; loop ids + opts; murmur returns a handle; renderOffline extra kinds/opts."

- **`HW.audio.setSpace(kind, fade=0.8)`**: picks the shared reverb space. Kinds: 'room', 'corridor', 'hall', 'basement', 'cavern', 'stairwell', 'tile', 'library', 'vault', 'outside', 'car', 'none'. Aliases include 'gym', 'auditorium', 'classroom', 'small', 'large', 'mine', 'crypt', 'exterior'. Every `ambience(id)` call sets its bed's space automatically (hall→corridor, gym/auditorium/assembly/cafeteria→hall, basement/boiler_room→basement, breaker→cavern, restroom/kitchen→tile, exterior_rain/dawn→outside, car_interior→car, …). A manual `setSpace` lasts until the next bed change.
- **`HW.audio.layer(id, on=true, fade=1)`**: plays an ambience bed as a layer over the current bed; any bed id works. `ambience('period_buzz')` is treated as `layer('period_buzz', true)`. Layers persist across bed changes. `ambience(null)` stops only the bed (use `layer(id, false)` or `stopAll()` for layers).
- **`HW.audio.stripAmbience(n, fade=1.5)`**: long-hall effect; mutes bed groups in the order wind → creaks → drips → rain → events. 0 restores, and any bed change resets it.
- **`HW.audio.level()`**: output meter, 0..1. The PA console UI already calls it.
- **`HW.audio.stopAll(fade)`**, **`HW.audio.ready`** (getter), and **`HW.audio.ids`** (`{ sfx, events, ambience, music, loops, spaces, surfaces }`).
- **Extra `sfx` options**:
  - `dur`: ring length for school_bell / bell_short, e.g. `{ dur: 9 }` for the DISMISSED bell that rings on and on.
  - `delay`: seconds.
  - `pan`: explicit pan for non-positional sounds.
  - `rate`: pitch and time together. The chime's semitone drop per act is `rate: 2 ** (-act/12)`.
  - The returned handle also has `setPos`, `setVol` and `playing`.
- **Loops**: `loop(id)` accepts these continuous ids: boiler, mine_fire, fluor_buzz, intercom_hum, steam, rain_window, rain_roof, wind, engine_idle, crowd, vhs_noise. Tuned retriggers: heartbeat (`{ bpm }`, default 72), colonel_breath, colonel_breath_fast, drip, faucet, clock_tick, typewriter, pen_scratch, chalk, husk_rustle, cicada_click, record_crackle, locker_tap. Any other sfx id is retriggered back to back. Pass x/y at creation to make a loop positional; `setPos` only works on loops created that way.
- **`murmur(sec)`** returns a handle.
- **`footstep(surface, { id: 'colonel' })`** gives the Colonel's dragging step. Pass `npc: true` for followers (quieter, lower priority). Feet alternate per entity id.
- **`renderOffline(kind, id, seconds, opts)`**: extra kinds 'loop', 'layer', 'footstep', 'blip', 'murmur'. Options: sampleRate, seed, dynamics (default true), space, listener [x, y] plus x/y, occlusion, run/steps/interval. The result is a mono Float32Array with `.channels = [L, R]` and `.sampleRate` attached.

### Known issues
- I can't listen to anything. All sound design was judged from synthesis knowledge plus waveform/spectrogram contact sheets and numeric checks. A human listening pass on tools/preview/audio.html is still needed, especially for the Colonel set, the drones and the music arrangements. Any one sound's level can be trimmed in one place: `peak` in its sfx entry, `BED_GAIN` in ambience.js or `TRACK_GAIN` in music.js.
- Compressor make-up compensation (2.43 dB) was measured in Chrome. Firefox and Safari should use the same rule but weren't tested; a mismatch would only shift the master level by a dB or so.
- Running the repo's `npm test` (tests/run-all.mjs) rebuilds dist/hallowell.html, a file I don't own. The new build includes my audio and the tests passed, but the lead may want to rebuild before committing. One engine (built) test failed once under shared-CPU load and passed 141/141 on re-run.
- One-shots while the context is suspended (before the first gesture) are dropped by design.
- The buffer cache can hold up to 40 MB of AudioBuffers if every sound gets used. It's bounded by LRU; normal play uses far less.
- Lingering scheduler tasks (for example a stopped intercom_hum's crackle timer) exit on their next tick rather than immediately. That's harmless and bounded.
- `stinger_hard` peaks at -1.6 dBFS raw by design (the earned big hit); the master soft-clip and compressor catch it.

### Requests
- **Lead:** please add the TECH §10 changelog line above and list the additions in the API section. Also record that `tools/preview/audio.js` and `audio_qa.js` exist (TECH §15 says `tools/preview/audio.*`; my JS files match the assignment's `audio*.js`).
- **Systems agent, periods.js:** please do the following.
  - At each period start call `HW.audio.sfx('intercom_crackle')` then `HW.audio.sfx('intercom_chime', { rate: 2 ** (-(act - 1) / 12) })`, with act 1 for Prologue–Ch2, 2 for Ch3–5, 3 for Ch6–8.
  - Use `sfx('school_bell')` for scripted bells and `sfx('bell_short', { x, y })` for free-period bells.
  - Turn the fluorescent buzz on with `HW.audio.layer('period_buzz', true)` and off with `layer('period_buzz', false)`, and use `sfx('fluor_on' / 'fluor_off', { x, y })` per bank.
  - When the Colonel is on another floor, use `footstep_heavy_above` plus `dust_fall`.
- **longhall.js:** call `HW.audio.stripAmbience(loops)` on each loop and `stripAmbience(0)` when the hall is cleared.
- **basement.js:** use `HW.audio.duck(0.125, 1)` within 10 tiles of the occupied heap and `duck(1, 1)` outside it (the -18 dB rule). Use `loop('boiler', { x, y })` for the positional boiler.
- **colonel_ai.js:**
  - If the Colonel entity calls footstep, give it `id: 'colonel'`.
  - Use `loop('colonel_breath', { x, y })` with `setPos` each frame for his breathing, and `sfx('colonel_jingle' / 'colonel_drag' / 'colonel_hm', { x, y })` for the rest.
  - Use `door_creak_slow` for peeks.
- **Scripts:**
  - Dismissal bell in DISMISSED: `g.sfx('school_bell', { dur: 9 })`.
  - Ch8 "bell pitched down two octaves with steam": `g.sfx('school_bell', { rate: 0.25 })` plus `g.sfx('steam_hiss')`.
  - Danny's 3 s total silence: `g.silence(true, 0.05)` then `g.silence(false, 1)`.
  - Gym roof rain cut: `silence(true, 0.05)` for 2 s.
  - Car engine off: `g.ambience('silence', 0.1)`, wait 2 s, then `g.ambience('exterior_rain', 1)`.
- **Engine:** no change needed. `audio.occluder`, `setListener`, `update`, `footstep` (including npc/id) and map ambience/music already integrate correctly. If a map needs a non-default reverb, add an optional `space` field to map data and call `HW.audio.setSpace(map.space)` after `ambience()`.

---



## Game systems (meta: chapters, endings, sys scripts, UI v2)

### APIs
Global objects and properties:
- HW.chapters: { config(n), actFor(n), chimeRate(n), droneFor(n), wantDrone(), grimeFor(n), tessEnrolled(state), applyPeriods(n, {onlyOpen}), setup, CHAPTERS }
- HW.game.act: getter, 1 (Pro–Ch2), 2 (Ch3–5) or 3 (Ch6–8).
- HW.endings: the endings.js default export, set by game/index.js.

chapters.js exports chapterSetup(n), installChapters(), applyPeriods, actFor, chimeRate, droneFor, wantDrone, grimeFor, tessEnrolled, CHAPTERS, CH5_PERIODS.

endings.js exports:
- buildRegisterModel(state = HW.state) → model:
  - Page: founder, lines, tools, grounds, dirty, formOn, actions.
  - preview(tool, line) → { text, ok }
  - act / apply(tool, line, opts) → { ok, kind, say, need: 'confirm'|'grounds'|'write', prompt, options, write: { seconds, text, letters }, voice: { who, text }, reason, keepsake }
    - opts: { confirmed } for the way-out question; { grounds, written } for the pen.
  - startOver(), closeSummary() → { lines, prompt, options }, outcome(), commit(state) → { ending, saved }, refresh().
- resolveEnding(state), inkOf, listed, rollAnswered, bonded, savedFriends, GROUNDS, PUPILS, LINES, expulsionText, EXPEL_SECONDS.

Screens:
- 'register' args { model, onWithdraw?(id, tool, text) }; resolves null on close.
- 'write' args { label, seconds, letters, onProgress(p), allowCancel = true, dim } → 'done' | 'cancelled'.
- 'vhs' args { frames?, start, min, max, autoplay, hold, onFrame(i, def) } → { frame, held } (held = longest still on the face frame). Default tape: 0 = lobby group shot, 1–5 = vhs_frames 0–4, 5 = the face.
- 'gameover' { reason }:
  - Reasons: hall_after_bell, out_of_seat, running, breath, chase, woke, present.
  - Aliases: caught/seen/moved → out_of_seat; whistle/run → running; hall/longhall → hall_after_bell; false_leah/sat/sit → present; noise → woke.
  - gameover.js also exports referralFor(reason).
- PA screen additions: HW.ui.get('pa').setLamp(id, on) and .setLocked(bool).

UI services:
- svc.portrait('tess', …) applies her enrolled level automatically (opts.enrolled 0/1/2 overrides; true keeps the art's entranced look).
- svc.tessEnrolledLevel().

Script hooks my scripts call if they exist:
- ch4.roll1 (ctx { pa: true }) replaces the default roll call.
- ch4.pa_listen (ctx { room, count }) runs after each listen.
- ch4.hide runs after the default roll call only.
- ch6.safe_open runs after safe_open is set.
- ch8.register_voice (ctx { id, tool, text }) plays a friend's far voice.
- ch8.after_register (ctx { ending }) runs after commit and checkpoint 'register closed'.

Flags written: roll1_done, roll1_answered, roll1_note, ch4_pa_used, safe_open, safe_tries, terminal_battery, withdrawn_*, form_used_on, form_used, expelled, expel_grounds, register_done, ending, front_loops, no_seats_<room>, ch7_started.

Test hook: under autoAdvance, __HW.screenAnswer('register', { actions: [[tool, line, opts], …] }) makes sys.register apply those actions before committing.

### Verification
tests/meta.mjs passes 124/124 (about 90 s). Run it with: node tests/meta.mjs (dev page; it imports /src modules, so there is no --built mode). It is not in run-all.mjs, which is a shared file.

What it covers:
- In node:
  - The DESIGN §8 QA matrix: the five named cases, plus the general statements checked exhaustively over R 0–3 × all 8 bond sets × Charter yes/no.
  - Every refusal text exactly, previews, stamping lines, form reasons, the way-out confirm, grounds R1–R6, the 6 s hold and the assist +30 %.
  - That actions stay provisional, Start over, the close summary, commit flags (including form_used), a missing keepsake warning, and resolveEnding including truant.
- In the browser:
  - chapterSetup party, objective and act for Ch2/5/7.
  - Ch5 free periods opening on the flag and returning after a reload.
  - Drone silenced by the chime and back at dismissal.
  - Grime levels, and Tess's three distinct portrait levels.
  - All gen scripts.
  - sys.safe wrong lines, the third-try hint and opening.
  - sys.pa with autoAdvance and choiceQueue, both [Here.] and silence.
  - sys.pa third LISTEN firing ALL CALL, with the 205 and LIB lamps and the console locked then closed.
  - sys.terminal dead screen, then the HALLOWELL battery given once.
  - sys.register commit, checkpoint and after_register.
- Real Register UI driven with key presses:
  - stamp, an ink refusal, the form slip, bad then good grounds;
  - the hold: past 70 % the hand is on, and releasing does not advance;
  - EXPELLED, then [Not yet.] and [Close it.];
  - the way-out confirm, the no-Charter refusal and Start over.
- Other screens: write meter done and cancelled, VHS scrub to the face then eject, five referral slips plus 'title'.
- No captured errors.

Screenshots (in /tmp/hallowell-shots, meta_*.png), checked by eye and iterated on layout: Register tray, preview, stamp, refusal, slip, grounds, writing, the hand with the Colonel's line, EXPELLED, close confirm, way-out, no Charter, Start over; the out_of_seat, running, present, woke and caught slips; VHS group shot, seek and face.

npm test result: build and smoke pass; engine dev and engine built each fail the same one check (cause under known_issues). An earlier run also failed on lobby.js being mid-edit by its map author; that was fixed in the latest run.

### Known issues
- npm test is not fully green. tests/engine.mjs fails "holding Confirm while seated … ×4 time in a period" (dev and built). Cause: the test only fakes HW.periods when it is missing, and the AI agent's real HW.periods is now installed and inactive, so time stays ×1. Not caused by my files; the engine or AI agent owns tests/engine.mjs and periods.js.
- The vhs_frames CG has no lobby group shot. Frame 0 is a UI-drawn fallback from party sprites; it reads well but is plainer than the rendered CG frames. The UI switches to the CG automatically once the CG object reports frames >= 6.
- colonel_hand takes no light parameter. The UI crops it and re-lights it red itself, and the CG's own fluorescent flicker still shows through now and then.
- The Register tools are drawn in the UI because item icons are still placeholders.
- The roll #1 Notes line ("Danny — 205? Leah — library?") is set as the objective plus flag roll1_note, because there is no free-text Notes API.
- chapterSetup always sets the chapter's drone (or none) and the default objective, silently; chapter start scripts override them.
- On reload, chapters.js only turns free periods on, never off, so a period config a script set is never undone.

### Requests
Narrative authors:
- ch6.portrait (Haupt's portrait, chapter ≥ 6) should `await g.run('sys.safe')`. On success sys.safe sets safe_open and then runs ch6.safe_open; that script should give withdrawn_stamp and aud_key, show doc haupt_letter, play the intercom line, and checkpoint.
- ch4.roll1 is optional. If written, it runs while the PA console is open:
  - Light the lamps with HW.ui.get('pa').setLamp('205') / setLamp('LIB'), and set roll1_answered.
  - sys.pa already sets roll1_done as a safety net, checkpoints 'roll 1' afterwards, and does not run ch4.hide in that case (chain it yourself).
  - Optional ch4.pa_listen ctx { room, count } runs after each listen.
- ch8.after_register gets ctx.ending; flags are already committed and checkpointed. It should start with 2 s of nothing (DESIGN §14), then play the consequences.
- Optional ch8.register_voice ctx { id, tool, text } plays a friend's far voice; the default is a dim line of narration.
- ch2.vhs:
  - `const r = await g.screen('vhs', { onFrame: (i) => { if (i === 5) g.sfx('stinger_hard'); } })`, or `g.run('sys.vhs', { args })`.
  - Frame 5 is the face. r.held is the seconds held on it.
  - Use { min, max } for the first pass before [Rewind it.].
- Game over reasons must be one of: hall_after_bell, out_of_seat, running, breath, chase, woke, present.
- Use gen.front_loop after ch1.front_loop, gen.locker_not_hide on hall lockers, gen.no_seats on seatless rooms, and gen.locked as a generic locked script (it uses the prop's lockedText).

Map authors:
- west1 `w1_pa` (pa_console) and breaker `br_register` (register_book) can rely on default interaction (sys.pa / sys.register).
- east2 `e2_terminal` (computer_desk): sys.terminal treats state 'on' or an active period as powered.
- Anchors I rely on: none beyond CONTENT.md.

CG agent:
- Add the lobby group shot ("Everybody say Hollow Hell", Danny's bunny ears) as vhs_frames frame 0, shift the rest to 1–5, and expose `frames: 6` on the CG object.
- Optionally give colonel_hand params { light: 'red', slack }.

Portraits agent: if Tess's portrait rig gains native enrolled levels 1/2, pass the level through in src/ui/services.js portrait() instead of the UI post-pass.

Engine / AI agent: tests/engine.mjs's ×4-time check needs to fake an active period even when the real HW.periods exists.

Lead: please record in the TECH changelog:
- The new 'vhs'/'write' screen args.
- The Register model additions (preview, need, startOver, closeSummary, commit).
- PA setLamp/setLocked.
- HW.chapters and HW.game.act.
- Game-over reason ids.
- The shared vhsfx.js.

The run command for my tests is: node tests/meta.mjs


## Game systems (AI: periods, Colonel, patrol, set pieces)

### APIs
The same API is documented in each file's header.

**HW.periods** (periods.js)
- `enable({ maps, passing=150, length=60, max=3 })` / `disable({ end })`. Config is saved in `HW.state.periodsCfg`.
- `start(opts)` returns a Promise that resolves true at the bell (false if it couldn't start). Options:
  - `scripted` (false): full school bell, no automatic Colonel, no automatic end unless `length` is given.
  - `guided` (false): full bell, waits for Tess to sit, Colonel spawns.
  - `length` (60 s; null = until `end()`), `warning` (true), `countdown` (10 s).
  - `waitSeated` (true when guided) with `waitMax` (45 s).
  - `colonel` (default: not scripted), `reason`, `bell` ('full' | 'short').
- `end()` returns a Promise that resolves when the lights are out. `forceWarning(reason)` returns a bool. `notePeek(roomId)`.
- Read-only: `active`, `warning`, `phase` ('idle' | 'warning' | 'active' | 'dismissal'), `enabled`, `config`, `length`, `timeLeft`, `count`, `reportedBy`, `scripted`.
- `clockTime()` returns hours. `clockBias` (minutes) is writable.
- `onWarning` / `onStart` / `onEnd(fn)` return an unsubscribe. HW.game also emits 'periodWarning', 'periodStart', 'periodEnd'.
- Exported helper `inFreePlay()`, evaluated once per step.

**HW.colonel** (colonel_ai.js)
- Modes: off, patrol, investigate, chase, search, scripted, assembly, escape, sleep, plus a transient 'caught'.
- `spawn(at='fold'|'fold:<i>'|anchor|[tx,ty]|{x,y}, { mode='scripted', anim='emerge'|null, dir, vision })` returns Promise<entity>.
- `despawn({ sink=true })` returns a Promise. `setMode(mode, { vision })`.
- `walkTo(target, { speed=26, run, lunge, doors })`, `anim(name, { once, hold })`, `lunge(target, { speed=150 })` all return Promises. `face(dirOrTarget)` takes a direction, anchor, point or 'tess'.
- `peekInto(roomId | { door, look }, { style: 'shadow'|'doorway'|'step' })` returns a Promise. Default style is by chapter: ≤3 shadow, 4 doorway, 5+ steps in.
- `investigate(x, y)`, `chase({ reason, track, rubber, cannotCatch })`, `search(x, y)`, `catch(reason)`, `closePass()`.
- `sleep(at)`, `rise({ at, reason='woke' })` (Promise), `escape({ cannotCatch, rubber=[4,8] })`, `assembly({ at='lectern' })`.
- `spawnPeriod()` and `dismiss()` are used by periods.
- Fields: `mode`, `entity`, `x`, `y`, `shrouded`, `shroud` (null | true | false override), `peeking`, `detection`, `cannotCatch`, `reason`, `peekStyle`, `vision`, `assemblyScan`, `lastCatch`, `log`, `state()`.
- `on(ev, fn)` for: spawn, cue, notice, chase, escape, lunge, lost, search, hear, peek, closePass, catch, despawn, huntEnd, rise.
- Game-over reasons: 'hall_after_bell' (hall), 'out_of_seat' (rooms or assembly), 'running' (after a Kevin report), 'woke', 'chase', or a set `reason`. God mode is respected.

**HW.noise** (noise.js)
- `emit(x, y, radiusTiles|null|'map', kind)`. Default radii in tiles: run 7, walk 1.5, door 5, item 8, mixer 12, panel 10, bolt_cutters 6, whistle map-wide.
- `on(fn)` returns an unsubscribe; events arrive the next step, tagged `by` for NPC doors. Also `recent(sec, kind)`, `hears(ev, x, y)`, `last`, `RADII`.

**HW.patrol** (patrol.js)
- `spawn(id='kevin', { at, dir, whistle=true, range=10, glimpse })`, `despawn(id)`.
- `enable({ maps, chance=1 })` / `disable()`: on each load of those maps, spawns Kevin at an off-screen `map.patrol.kevin` spot. Saved in `HW.state.patrolCfg`.
- `whistle(id)` returns a Promise. `dismiss()` stops all whistling. `onWhistle(fn)`. HW.game emits 'whistle'. `sentinels`.

**HW.basement** (basement.js): `stir`, `heap`, `active`, `risen`, `addStir(n, kind)`, `setStir(n)`, `reset()`.

**HW.longhall** (longhall.js): `active`, `loops`, `config`, `hasPass`, `loop()`. HW.game emits 'longhallLoop'.

**HW.assembly** (assembly.js)
- `start({ lectern='lectern', spot=true, radius })`, `stop({ despawn })`, `pause()`, `resume()`, `scanNow()`.
- Read-only: `active`, `paused`, `phase`, `phaseLeft`, `spot` (the drifting light). `onPhase(fn)`; HW.game emits 'assemblyPhase'.
- Saved as flag `assembly_on` and restarted on reload.

**HW.chase** (chase.js)
- `start({ from, lungeTo, lungeSpeed, reason, track, rubber, cannotCatch })` resolves to 'caught' | 'hidden' | 'lost' | 'transfer' | 'stopped'.
- `gym({ lungeTo='center', lungeSpeed=300, reason='out_of_seat', rubber=[4,8], from='colonel_hoop' })`.
- `escape({ cannotCatch, rubber, endMaps=['exterior'], entryDelay=1.4 })` resolves 'escaped'. It checkpoints on each map as 'escape_<map>', re-enters him behind Tess, and is saved in flag `chase_escape`.
- `stop(result)`. Read-only `active`, `kind`. HW.game emits 'chaseEnd'.

**HW.breaker** (breaker.js)
- `lamps`, `lit`, `out`, `lightNext()`, `extinguish({ interval=0.9, follow })` (Promise), `reset()`.
- Flags `breaker_lamps` and `breaker_out`.

**Flags I set**: `periods_ch<N>`, `colonel_who_ch<N>`, `ch3_colonel_stirred`, `longhall_loops`, `assembly_on`, `chase_escape`, `breaker_lamps`, `breaker_out`.

### Verification
- **Command**: `node tests/systems.mjs` and `node tests/systems.mjs --built` (built mode needs a fresh `npm run build`). Both pass 103/103 in about 150 s. It uses the new `test_ai` map; the story scripts the systems call are stubbed in-page with recorders.
- **Periods**: no warning within 20 s of a map load; bell exactly 10 s after the chime; lights and computers on; hall clocks at 1:40, near 1:45 at the warning, 1:45–1:46 during the period, back to 1:40 after; Colonel spawns ≥ 12 tiles away and off screen; full length then dismissal; count saved; he sinks.
- **Followers**: they sit on the warning, in Tess's room, not in the seat nearest her, and stand at dismissal.
- **Seated, still Tess with Colonel stepping in (Ch5)**: close pass happens, detection stays 0, no game over (god off), dismissal 10 s after the peek. Holding Confirm gives ×4 time, but not during peeks.
- **Guided period (Ch3)**: the bell is held until Tess sits; the peek is a shadow only and the door stays shut.
- **Scripted mode**: spawn at an anchor with emerge, walkTo, face('tess'), anim once, lunge, despawn.
- **Standing in the hall (god off)**: cue, notice, "Who is out of their seat?", chase, game over 'hall_after_bell', checkpoint reloads.
- **Chase timing**: a lunge every 1.40 s lasting 0.5 s at 150 px/s, drag at 30 px/s, average about 73 px/s.
- **Hearing and search**: running behind him gives a 'run' hear and investigate; losing sight for 3 s gives search, then back to patrol.
- **Shroud**: tubes within 3.5 tiles dead, farther ones lit, recovery after he passes, and no effect after `ch6_gym_lights`.
- **Assembly**: READ 7–9 s, telegraph 2.0 s, SCAN 3 s; seated Tess spared; row 5 doesn't fire roll #3, row 4 fires `ch7.roll3` with row 4; running gives an immediate scan; standing through a scan gives 'out_of_seat'.
- **Long hall**: loops +20 tiles without the view jumping; clocks +1 minute per loop; ambience stripped 1–4; loop script called with loops 1–4; voice at loop 4; running calls the whistle script; with the pass, `ch5.kevin_pass` runs and looping stops.
- **Basement**: walking never stirs; a door within 8 tiles gives stir 1; 3 s cooldown; noises beyond 8 tiles ignored; decays after 20 s; the panel only takes 0 to 1; running gives stir 2, he rises and chases, and catches with 'woke'.
- **Kevin**: head tracking; walking allowed; running in sight gives a whistle and a warning with reason 'whistle'. During a period the whistle makes the Colonel investigate and the catch reason is 'running'.
- **Escape and transfers**: escape with cannotCatch never catches, and reaching an end map finishes it. A transfer ends a chase (no respawn until the next bell); entering a patrol map mid-period respawns him 6 s later, ≥ 12 tiles away.
- **Breaker**: lamps light one by one by y thresholds; `extinguish()` puts them all out.
- No captured errors in the suite.
- **Extra probes**: periods on the real `west1` map with no errors; per-step cost during an active patrol is about 0.15–0.19 ms for the Colonel and a few µs for the other systems.
- **npm test**: build and smoke pass; engine 140/141, failing only the fake-period assertion described in known_issues.

### Known issues
1. **`npm test` engine suite is 140/141.** The failing assertion is 'holding Confirm while seated shuts her eyes (×4 time in a period)'. The test fakes a period only when none exists (`const fakePeriods = !HW.periods; if (fakePeriods) HW.periods = { active: true };`). Now that `HW.periods` exists and is idle, the ×4 time correctly doesn't apply. The fix belongs to `tests/engine.mjs`, which I don't own: always swap in a fake and restore it afterwards. In 'DESIGN v2 behaviours', replace those two lines with `const savedPeriods = HW.periods; HW.periods = { active: true };` and replace `if (fakePeriods) HW.periods = null;` with `HW.periods = savedPeriods;`. My suite proves ×4 with a real period. During one run the engine suite also caught a malformed lobby map row from maps-A; that was fixed by the next run.
2. **"Who is out of their seat?" is shown as a HUD toast** with the Colonel's murmur. There is no non-blocking speech line in the UI, and a dialogue box would freeze the player during the 0.8 s notice.
3. **Kevin has no belt-off art.** `HW.patrol.dismiss()` stops whistling and holds `hand_out_down`.
4. **Saving during the Ch8 escape is allowed.** The engine's `canSave` only blocks colonel mode 'chase'. I kept 'escape' as a separate mode so the per-map escape checkpoints still work.
5. **Long-hall seamlessness depends on the map.** The camera must not be clamped at either loop x (loopFromX ≥ 16, loopToX ≤ width − 16), and the hall should look the same at both points. The current `longhall` placeholder (24 tiles wide) can't meet that.
6. **Assembly vision is generous.** During a scan he sees a standing Tess anywhere within 30 tiles if he has line of sight from the lectern, so the wings are safe only because walls block that line.
7. `test_ai` sometimes has fields injected at test time (`longhall`, extra breaker lamps); the suite removes them afterwards.

### Requests
**Map authors:**
- `patrol: { nodes, edges, folds, peeks, kevin }` on lobby, west1, east1, east2 and west2.
  - Nodes go along the hall rows.
  - Folds are wall-seam cells; he emerges on the nearest walkable cell (same cell, 1 or 2 south, east/west, or north).
  - Each peek is `{ room, door: [x, y of a door-prop cell], look: [x, y] walkable inside }`; `room` must equal the `rooms[].id` the door opens into.
  - `kevin: [[tx, ty, 'dir'], …]` spots go at hall ends (east2, west2, east1).
- Hall lights go in group 'period'; classrooms need ≥ 1 'period' fluorescent too. Hall clocks are `clock_hall` / `clock_wall` props; I drive their `params.time`. 207's computers must be type `computer_desk`.
- **basement**: `coal_heap` prop with id `b_coal_heap` (state 'occupied'), anchor `coal_heap` on it, anchor `boiler` (or a boiler prop), and `breaker_panel`.
- **longhall**: `longhall: { loopFromX, loopToX, kevinStopX }` with the seamless constraint above, plus anchors `kevin` (I spawn him there; he doesn't whistle on his own) and `loop_reset`.
- **aud**: `aud_seat` objects carry `row` (1 = front); anchor `lectern` is where his feet go, behind the lectern prop.
- **breaker**: lights `{ type: 'lamp_miner', group: 'lamp_N', on: false }` numbered in climbing order, optionally `breaker: { thresholds: [ty…], lead }`.
- **gym**: anchors `colonel_hoop` and `center`; the girls' locker room must break his line of sight from the court.

**Script authors:**
- Ch2 and Ch4: `await g.periods.start({ scripted: true, waitSeated: true })`, then drive `g.colonel` (`spawn('colonel_fold_hall', { anim: 'emerge' })`, `walkTo`, `peekInto('w1_reception', { style: 'doorway' })`, `despawn()`), then `await g.periods.end()`.
- Ch3: `g.periods.start({ guided: true })`.
- Ch5 205 period: `start({ scripted: true })` with `colonel.peekInto` / `closePass()`.
- Call `HW.patrol.enable({ maps: ['east2', 'west2'] })` in Ch5, and `HW.patrol.spawn('kevin', { at: 'kevin_far', glimpse: true })` for the Ch4 glimpse.
- Emit noises from scripts: `HW.noise.emit(x, y, null, 'bolt_cutters' | 'mixer' | 'panel' | 'item')`.
- Write `ch3.stir1` and `ch3.stir2`; I raise him after `ch3.stir2` returns. Write `ch5.longhall_loop` and `ch5.longhall_voice` (both run non-blocking, ctx `{ loop }`), `ch5.kevin_whistle` (do the reset, e.g. `g.setPos('tess', 'loop_reset')`), and `ch5.kevin_pass` (take the pass and set `longhall_cleared`).
- Ch6: `g.colonel.spawn('colonel_hoop', { anim: null })` plus `anim('rise', { once: true })`, then `HW.chase.gym()`; after it resolves 'hidden', drive the locker scene in scripted mode.
- Ch7: `HW.assembly.start()`; `ch7.roll3` must set `roll3_done` and `roll3_answered`. Front-row scenes pause the cycle automatically.
- Ch8: `HW.chase.escape({ cannotCatch })` and `HW.chase.stop()` at the vestibule.
- DISMISSED: `HW.breaker.extinguish()` and `HW.patrol.dismiss()`.

**Engine owner / lead:** apply the `tests/engine.mjs` fix in known_issues #1. Consider having `canSave` also refuse during colonel mode 'escape'.

**UI:** a non-blocking speech line for "Who is out of their seat?" (known_issues #2).

**Art:** a Kevin belt-off frame.
