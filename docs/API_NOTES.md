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
