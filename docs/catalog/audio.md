# audio — catalog

Every sound in the game is synthesized: no audio files. The package has three parts:
- **Named sounds** (93 of them) are registered with `ctx.audio` at build time. Most are pre-rendered by pure-JS DSP in a **Web Worker**, then played as `AudioBufferSourceNode → Gain` voices.
- **Footsteps** are synthesized per surface class.
- The **ambience director** is an `AudioEngine` controller. It runs the beds, far-away one-shots, silence events and sparse ambient music.

Package files live in `src/content/audio/`. The test tools are `tools/audio-check.mjs` and `tools/audio-test.html`.

The package places no models, so there are no model entries here.

## How to play a sound (other packages)

```js
// positional one-shot
ctx.audio.play('door_metal_slam', { pos: [x, y, z] })
// positional loop: keep the emitter; stop it when done
const em = ctx.audio.play('tv_muffled', { pos: [x, y, z], loop: true })
em.setGain(0.5); em.setPosition(x, y, z); em.stop(0.5)
```

Always guard with `ctx.audio.ready`. The audio context starts on the first click, so create loops lazily in `update`.

**Defaults are built in.** Each sound fills in its own `bus`, `refDistance`, `rolloff`, `maxDistance` and `reverb` when you do not pass them. For example, a dog 150 m away is audible with a plain `play('dog_bark', {pos})`. Pass your own values to override them. `gain` multiplies the built-in level, so 1 is the calibrated level.

**Loops** (marked *loop* below) play until `stop()`. `loop: false` on a loop sound plays the buffer once.

**One-shots** stop by themselves.

Sounds that are not rendered yet start asynchronously, about 0.1–0.4 s late. This happens only for rare or long sounds; interactive ones are pre-rendered during loading.

Distances are in metres. Levels are relative: footsteps peak around −14 to −22 dBFS (loudness-matched across surfaces), a door slam near you around −6 dBFS, and the outdoor beds sit around −40 dBFS RMS. The beds are mostly low frequency, so on the A-weighted scale they sit about 14 dB under a snow footstep in a courtyard.

### UI / phone (bus `ui`, non-spatial, no reverb)

The `ui` bus is the phone in the player's hand, so it **bypasses the silence duck and the snow shelf**: key beeps and an SMS stay audible during a silence event. Do not use `bus: 'ui'` for sounds that are part of the world.

All of these accept `muffled: true`, which applies a 1.1 kHz lowpass at −3 dB for a phone still in the pocket.

| name | what | opts |
|---|---|---|
| `click` | plastic switch click, 4 variants (flashlight, buttons) | — |
| `paper` | paper handling rustle (notes) | — |
| `phone_key` | keypad beep (1.87 kHz) plus key-dome click | `tone:false` gives the click only; `freq` sets the pitch of the beep |
| `phone_sms` | classic SMS alert: Morse «SMS» ··· −− ··· at 1.72 kHz, 1.9 s | — |
| `phone_vibrate` | vibra motor rattle at 165 Hz, 0.8 s on / 0.8 s off | `pulses` (default 2); `loop:true` buzzes until stopped |
| `phone_ring_out` | Russian ringback: 425 Hz, 1 s on / 4 s off | Default is finite: **two rings, 6.15 s**, so the phone can switch to `phone_unavailable`. `loop:true` rings forever; `duration` sets a custom length |
| `phone_unavailable` | SIT tones 950/1400/1800 Hz, then the operator (female formant speech): «Абонент недоступен, или находится вне зоны действия сети», 6.5 s | — |
| `phone_busy` | *loop*, 425 Hz, 0.4 s on / 0.4 s off | `cycles: n` makes it finite; `loop:false` plays 6 cycles |
| `payphone_dial` | *loop*, continuous 425 Hz dial tone in the handset | — |
| `dial_pulse` | rotary pulse dialling clicks in the earpiece, 10 pps | `digit` 0–9 (0 = 10 pulses); random if omitted |
| `gsm_interference` | (extra) 217 Hz TDMA «дрр-дрр-тр-тр» in a nearby speaker, bus `sfx` | — |

The phone package registers its own `phone_beep`, `phone_gsm`, `phone_pocket` and `phone_ringtone`. Audio deliberately does **not** register these, so the phone's own melody list stays in charge.

### Doors and buildings (bus `sfx` unless noted; refDistance 3)

| name | what | opts |
|---|---|---|
| `door_metal_open` | lock release «тук», latch clack, rubber seal, hinge squeal, 1.6 s | — |
| `door_metal_slam` | heavy steel entrance door: «БАМ», damped panel modes 70–4400 Hz, latch, handle rattle, tambour tail, 2.6 s | — |
| `door_magnet_lock` | armature plate «КЛАК» (1–3 kHz plus 70 Hz boom) and faint magnet hum, 0.6 s | — |
| `door_wood` | creaking wooden door (stick-slip), optional latch, about 1.9 s | — |
| `intercom_beep` | домофон panel beep | `kind`: `'key'` (default, 2.2 kHz, 60 ms), `'ok'` (rising 1047/1319/1568 Hz), `'open'` («пи-пи-пи» for 3 s), `'error'` (400 Hz buzz) |
| `intercom_call` | *loop*, warbling 1.2/1.6 kHz trill for 0.8 s, then a 0.6 s gap | — |
| `doorbell` | flat doorbell heard from the landing. Variants: electronic bird trill / electromechanical «дзынь» / two-tone chime | `kind:'trill'\|'bell'\|'chime'`, or `seed`. Otherwise picked stably from `pos`, so the same door always has the same bell |
| `elevator_call` | plastic call button, then the machine-room relay cascade and brake solenoid up the shaft. Also prefetches the other lift sounds | — |
| `elevator_doors` | door operator whir, roller rumble, end clang | `dir:'open'` (default) or `'close'` (louder bang) |
| `elevator_motor` | *loop* (bus ambience), 100 Hz hum plus 640 Hz whine, cable rumble, a guide-shoe «тук» every 2.8 s (each floor) | — |
| `elevator_stop` | two-speed motor drop, stop «бух», cab settling, brake clack, relays | — |
| `garbage_chute` | (bus ambience) hopper squeal and clang, the bag tumbling 9–17 floors (impacts darker and quieter), final thump, about 4 s | — |
| `radiator_knock` | (ambience) neighbour tapping the riser with a key, 3–5 ringing hits | `kind:'tick'` gives thermal expansion ticks |
| `water_pipe` | *loop* (ambience), riser rush with air gurgles, through a wall | — |
| `stamp_snow` | (extra) 2–3 heavy stamps knocking snow off boots | — |
| `neighbour_drill` | (extra, bus ambience, refDistance 4) a перфоратор somewhere in the building: rotary-hammer impacts and motor whine in 2–4 bursts, through concrete floors, 7–10 s. The director plays it rarely in stairwells, 9:00–21:00 | — |

### Ambient emitters (loops, bus `ambience`; place them at the source)

Each loop starts at a random offset with a short fade-in, so two copies never phase.

| name | what | refDistance / notes |
|---|---|---|
| `tv_muffled` | TV through a panel wall: news anchor and field report with a music sting, or an entertainment show with dialogue, laugh track and jingles. Low-passed about 380 Hz | 1.5. `variant:'news'\|'show'`, otherwise stable per `pos` |
| `voices_muffled` | two people (male and female) talking in another room, Russian vowel babble with intonation, an occasional laugh | 1.5. Variant stable per `pos` |
| `fridge_hum` | compressor hum at 48.5/97 Hz plus rattle and gurgle | 1.2 |
| `fluorescent_buzz` | 100 Hz ballast buzz, lamination rattle, rare ticks | 1.5. `failing:true` (or `flicker`) gives starter «тик-тик», «тинк» strikes and dropouts |
| `transformer_hum` | ТП kiosk: 50 Hz plus a strong 100/200/300/400/500 Hz series with slow jitter | 3 |
| `boiler_hum` | boiler house: burner roar, fan, pump hum, occasional knocks | 6 |
| `ventilation` | metro vent kiosk or extract fan: 75 Hz blade pass, airflow, grille whistle | 4 |
| `escalator_loop` | comb clack every 0.5 s, 50/100 Hz motor, chain rattle, handrail squeak | 5 |
| `car_idle` | carburetted 4-cylinder at about 27 Hz with a weak cylinder (Lada), or a deeper Volga | 2.5. `variant` 0/1. `em.setRate(r)` revs it |
| `radio_distant` | late-2000s pop through a cheap kiosk speaker. Two original 8-bar songs: a dance-pop number in A minor at 124 bpm and a «шансон» ballad in D minor at 92 bpm | 3. `fragment:true` (or `loop:false`) gives one 8–18 s fragment with fades. `duration` sets its length |
| `swing_creak` | rusty swing squeaking each half swing, intensity breathing with the wind | 3. `period` (s) retimes it (rate = 2.8/period); `pitch` multiplies it |
| `shop_ambience` | inside «Продукты»: fridges, tubes, murmur at the counter, scale beeps, till, receipt printer, bag | 5 |
| `wires_hum` | (extra) trolleybus wires singing in frost, faint crackle | 6 |

### One-shots in the world (positional)

| name | what | default refDistance / opts |
|---|---|---|
| `dog_bark` | a run of 2–9 barks: formant and pitch-envelope bark synthesis, 5 different dogs, courtyard slapback | 30 m. `dog` 0–4; `howl:true` gives a distant howl |
| `crow_caw` | hooded crow: 2–6 hoarse caws (saw, FM roughness, pulsing «рр», formants 1.2/2.3 kHz) | 20 m. `jackdaw:true` gives a flock of «кья» |
| `crows_takeoff` | 2–5 birds flapping off a branch, a caw, a little snow falling | 12 m |
| `car_pass` | fire-and-forget pass-by at a fixed point: wet-slush tyres, spray, studs, engine with Doppler and air absorption, 6–10 s | 8 m. `speed` in **km/h** (default 50) |
| `bus_pass` | LiAZ diesel V8 pass-by with clatter, body rattle, sometimes a brake hiss | 8 m |
| `trolleybus_pass` | ZiU-9 pass: traction whine with Doppler, contactors dropping, a wire switch «тынц-тынц», tyres | 8 m |
| `trolleybus_depart` | at the stop: door hiss and folding clatter, line contactor «КЛАЦ», rheostat ratchet, whine rising as it pulls away, 15 s | 6 m |
| `pantograph_spark` | arcing on rimed wire: crackling bursts | 10 m |
| `train_pass` | elektrichka on the embankment: long swelling rumble, «та-дам» bogies over joints, 26–30 s | 60 m |
| `train_horn` | two-tone «тифон» (350/440 Hz): a chord, low-then-high, or two blasts, with echoes | 80 m |
| `metro_rumble` | deep swell through earth or concrete, about 20 s | 20 m. `loop:true` gives the **in-car tunnel roar** (`metro_rumble_loop`) for the ride |
| `metro_train_arrive` | 81-717 out of the tunnel: roar building, piston wind, rheostatic whine falling, joints slowing, brake squeal, final «пшш», 18 s | 12 m. Prefetches doors and departure |
| `metro_train_depart` | contactor clicks, stepped «sour» traction whine rising, into the tunnel, 19 s | 12 m |
| `metro_doors` | station chime, then male PA «Осторожно, двери закрываются.», door hiss and double-leaf slam, then «Следующая станция — Заречная.», about 10 s | 10 m |
| `metro_chime` | «динь-дон» E5→C5 with bell partials | 12 m |
| `metro_station_announce` | in-car «Станция Заречная.» | `terminus:true` adds «Конечная. Поезд дальше не идёт, просьба освободить вагоны.» |
| `metro_station_announce_terminus` | (extra) the terminus version | — |
| `announcement` | PA horn babble (female or male) | 15 m. `phrase` 0–5 (see `PA_PHRASES`); random if omitted |
| `escalator_step` | stepping onto the comb plate | 3 m |
| `turnstile` | `kind:'pass'` (default: reader «пик» and latch), `'slam'` (АКП-73 flaps «БАМ!»), `'gate'` (УТ-2000 paddles) | 3 m |
| `snow_shovel` | janitor's steel scraper on asphalt (or a plywood shovel with knocks) across a courtyard, about 4 s | 15 m |
| `snow_fall_branch` | soft «плюх» of a clump, powder sifting, branch spring-back | 4 m |
| `car_alarm` | a 2000s six-tone cycle (wail, yelp, hi-lo, machine gun, whoop, ray gun) far away, 26 s | 35 m |
| `distant_door_slam` | an entrance door slamming across the courtyard with slapback | 25 m |
| `footsteps_phantom` | someone else's steps in snow, receding into the dark, about 9 s. **Played inside an indoor zone, or with `indoor:true`**, it is slippers shuffling up to a flat door and stopping (heard through the door) | 5 m |
| `cashier_voice` | short muffled phrase. `phrase` index (default 0 = «Пакет нужен?»); `random:true` | 2.5 m. See `CASHIER_PHRASES` (ru/en) |
| `kiosk_voice` | through the hatch of a ларёк; random phrase or `phrase` index | 2.5 m. See `KIOSK_PHRASES` |
| `shop_bell` | shop door IR chime «дин-дон» | 3 m |
| `ice_crack` | crust or puddle crack, or a frozen-pond dispersive «пиу» | 5 m |
| `breath` | a single soft exhale (normally played by the director on its own foley path) | — |
| `drip` | (extra) water drop into a puddle | 2 m |
| `wind_rattle` | (extra) a loose sheet of roof tin or balcony cladding banging in a strong gust, across a courtyard. The director plays it high on the blocks in strong gusts only | 10 m |
| `kids_sledding` | (extra) kids on the hill: «А-а-а!», «Мама, смотри!», plastic sled scrape, far away | 20 m |
| `snowplow_pass` | (extra) KAMAZ diesel with the blade scraping asphalt | 8 m |
| `traffic_far` | (extra) a distant pass-by on wet asphalt (used by the director) | 40 m |

### Loops for vehicles you move yourself (vehicles package)

`car_pass`, `bus_pass` and `trolleybus_pass` with **`loop: true`** become continuous loops: `car_drive`, `bus_drive`, `trolleybus_drive`. They have no baked envelope or Doppler, so the engine's panner and distance do the work.

- `opts.speed` (km/h) sets the playback rate, nominal 50 for cars and 40 for buses.
- Update while driving with `em.setRate(Math.sqrt(kmh / 50))`.
- Move it with `em.setPosition()` and `stop()` it when the vehicle despawns.

Without `loop`, the `*_pass` sounds are about 6–11 s fire-and-forget pass-bys at a fixed point.

### Single footsteps for NPCs

`step_snow`, `step_snow_packed`, `step_ice`, `step_slush`, `step_concrete`, `step_asphalt`, `step_tile`, `step_linoleum`, `step_wood`, `step_gravel`, `step_carpet`, `step_metal`, `step_metal_grate` are positional one-shots with refDistance 2. Or use `playStep()` below. They use the same loudness-matched levels as the player's steps (`STEP_DB` in `sounds.js`), 2 dB up.

## The player's footsteps

`audio.setFootstep(...)` is installed in `init`. Each step plays one of 8–10 pre-rendered variants for the surface's `SURF` class, never the same variant twice in a row:
- SNOW: soft crunch of 40–60 grains, small compression thump, faint cold squeak.
- SNOW_PACKED: dominant «скрип» squeak bursts.
- ICE: hard click with a 2 kHz ring; sometimes a thin-ice crack.
- SLUSH: wet splat, squelch chirps from 900 to 300 Hz, suction.
- CONCRETE / ASPHALT: rubber sole click and grit/salt crackle over a light thump.
- METAL: modal clang at 310/742/1290/2110 Hz plus rattle.
- TILE: hard 2.5 kHz heel click with a short ceramic ring; sometimes a wet squeak.
- WOOD: hollow body modes.
- LINOLEUM: soft, sometimes squeaky.
- GRAVEL: coarse crunch.
- CARPET: muffled.
- METAL_GRATE: rattly multi-impact.

**Levels are matched by A-weighted loudness, not peak** (`STEP_DB` in `sounds.js`). A hard-floor step's peak is its heel thump, but the ear hears the click and grit. Fresh snow is the reference: tile and concrete stairwells sit level with it or slightly above, linoleum is softer, carpet is quiet, and metal stairs are the loudest.

Variation per step:
- alternating feet (±0.07 pan, ±0.7 dB)
- random level of −1.5 to +1.2 dB and pitch of ±5 %
- speed-dependent level (−6 dB when slow, +3 dB when brisk) and pitch

Steps play non-spatially on the **foley path**, which keeps its own zone reverb and is not affected by silence events. After walking in snow the soles are wet: the next indoor tile or linoleum steps sometimes squeak.

## Ambience director (controller; no setup needed)

**Beds** follow zone, weather, time and place:
- **City hum:** very low and constant, quieter at night and indoors.
- **Distant traffic:** panned toward проспект Строителей. It grows strongly near z 520–560, swells randomly (busier 17–19.5 h, sparse at night), and is low-passed indoors. On top of it, `traffic_far` pass-bys play at avenue positions.
- **Wind:** brown-noise bed driven by `atmos.windSpeed`/`gust`, a gust LFO (6–20 s), and *openness* from 8 horizontal raycasts. An airy mid band (450–1500 Hz) opens with each gust.
  - Aeolian whistles with f ∝ wind speed, louder near corners and only in strong gusts, panned from upwind.
  - Corner howl and blowing-snow hiss in gusts.
  - Indoors it is muffled by `zone.wind`.
- **Stairwell / indoor:** room tone (mains hum and air).
- **Underground:** room tone in underpass, metro and tunnel zones, or below y −3.
- **Trolleybus wires:** they sing near the avenue.
- **Snow shelf:** a global high shelf (−2 to −6 dB above 3 kHz) outdoors while snow lies or falls.

**Far one-shots** play at random positions 25–300 m away. Indoors they are muffled through walls.
- dogs: more at night; sometimes answered from another direction; rare howls
- crows: 8:30–17:30, peaking at dusk
- a car alarm: rare
- entrance door slams: commute peaks
- the janitor scraping snow at dawn, 5–8:30, in sessions at one spot
- kids sledding: 11–19.5 h, rare
- a train horn from the railway to the north
- someone unseen walking away behind you: rare, at night
- a radio fragment from an open форточка: very rare
- underground: other trains rumbling below y −8; one fixed leak dripping at an almost regular rhythm in `underpass` zones; faint metro rumble through manholes near the avenue
- distant metro announcements drifting up into the vestibule or underpass when `registry.metro.platform` exists, about every 3 min (metro speaks on the platform itself)
- stairwells, about every 45 s by day and 90 s at night: mostly a door slamming far below (or upstairs when you are low) and a lift running somewhere, with some radiator knocks and the chute. Residential adds its own knocks
- a neighbour's перфоратор in stairwells or flats, 9:00–21:00, rare (about every 7 min)
- strong gusts near buildings (steady or heavy weather): loose tin rattling high on the blocks

**Silence events:** every 8–20 min, with none in the first 8–15 min and never during music or underground.
- Everything except your footsteps fades over ~8 s to near-silence (−29 dB duck; the wind stops) for 20–60 s.
- While you stand still you hear a soft breath every 4–6 s.
- The world then returns over ~15 s.
- An interaction (`events 'interact'`) ends the silence early.
- Zones with `silence: true` are always nearly silent. The beds drop by about 28 dB and the wind stops. Everything else in the world is ducked by −12 dB, so a door the player opens there is still heard, as if through cotton wool. You hear a breath when you stand still.
- Your footsteps, your breath and the phone (`ui` bus) are never ducked.

**Music** (bus `music`): the first piece comes after 4–7 min, then one every 6–15 min after the previous ends. Each piece is 65–175 s and generated from a seed:
- soft drone and detuned saw pads with tape wobble and flutter
- a degraded pentatonic melody fragment (square or triangle lead through a lowpass), with notes sometimes missing or sagging
- a bit-crushed reverb tail and tape hiss

Music never plays during silence events or in silence zones.

## Exported helpers (`src/content/audio/api.js`)

```js
import { playAt, playStep, playRadioFragment, playSpeech, preload, requestSilence, isSilent,
         playMusicNow, audioStats, SOUND_NAMES, CASHIER_PHRASES, KIOSK_PHRASES, PA_PHRASES } from '../audio/api.js'
```

| signature | notes / example |
|---|---|
| `playAt(name, pos, opts?) → emitter\|null` | `playAt('crow_caw', [x, 18, z])` |
| `playStep(surface, pos, opts?) → emitter\|null` | NPC step. `surface` is a `SURF.*` number or a name: `playStep('snow_packed', [x, 0.3, z], { gain: 0.6 })` |
| `playRadioFragment(pos, opts?) → emitter\|null` | 8–18 s of a pop song from a cheap radio, with a burst of tuning static. opts `{ duration, gain, variant: 0\|1, static: false }`. `playRadioFragment([412, 1.5, 584])` at a kiosk |
| `playSpeech(text, opts?) → emitter\|null` | Any Russian text as synthesized, deliberately unintelligible speech with the right rhythm and intonation. Mark stress with `+`. opts `{ voice: 'male'\|'female'\|'old'\|'child'\|'anchor', chain: 'pa'\|'wall'\|'phone'\|'radio'\|'muffled'\|'none', pos, gain, … }`. `playSpeech('Поезд следует в депо. Посадки нет.', { chain: 'pa', voice: 'female', pos })` |
| `preload(names) → Promise` | Render buffers ahead of a scripted moment: `preload(['metro_train_arrive', 'metro_doors'])` |
| `requestSilence(seconds = 30)` | Start a silence event now (anomaly director) |
| `isSilent() → bool` | True during a silence event or inside a silence zone |
| `playMusicNow(seed?)` | Start an ambient piece now (debug) |
| `audioStats()` | Director and bank snapshot (debug) |
| `SOUND_NAMES` | every registered name |
| `CASHIER_PHRASES`, `KIOSK_PHRASES`, `PA_PHRASES` | `[{ru, en, text}]`; the index is `opts.phrase` of the matching sound. Use them for `ui.say` captions |

## Registry keys and state set

- `ctx.registry.audio = { sounds, director, playAt, playStep, playRadioFragment, playSpeech, preload, requestSilence, isSilent }`.
- `game.state.audioSilence` (bool) is true while a silence event or a silence zone mutes the world.
- `engine.bus.foley` is added: a bus that bypasses the silence duck. Use it only for sounds that must stay audible in silence.
- `engine.bus.ui` is rerouted around the duck and the snow shelf, through its own master-volume gain. It is the phone in the player's hand.
- `window.__audioDirector` is the director instance (debug).

**Reads:** `game.zone` (reverb, indoor, wind, traffic, silence), `game.atmos` (minutes, cur.snow, windSpeed, gust, windDir), `game.player` (pos, yaw, idleTime), `game.world.raycast`, `registry.manholes` (optional `[{x,z}]`), `registry.metro.platform` (optional, for distant announcements), and the `'interact'` event.

**Dev URL parameter:** `?audio=silence` or `?audio=music` forces a silence event or a music piece about 3 s into play.

## Sounds the package calls itself

From the director: `dog_bark`, `crow_caw`, `crows_takeoff`, `car_alarm`, `distant_door_slam`, `snow_shovel`, `kids_sledding`, `traffic_far`, `train_horn`, `footsteps_phantom`, `radio_distant` (fragment), `metro_rumble`, `drip`, `radiator_knock`, `garbage_chute`, `door_metal_slam`, `elevator_motor`, `elevator_stop`, `announcement` (distant, from the platform), `neighbour_drill`, `wind_rattle`. The footsteps call `step_*` and `step_wet_squeak`, and the breath calls `breath`.

## Notes for layout and other agents

- **Emitters:**
  - Put `tv_muffled` / `voices_muffled` at a flat door or wall, 0.3 m inside the stairwell zone.
  - Put `fridge_hum` and `fluorescent_buzz` at the appliance or tube.
  - Put `transformer_hum` at a ТП kiosk.
  - Put `ventilation` at metro vent kiosks.
  - Put `boiler_hum` at the boiler house.
  - Put `escalator_loop` mid-escalator.
  - Put `car_idle` at a "warm" parked car.

  Keep the number of simultaneous loops near the player modest (≤ 10). Create them within about 40 m and stop them beyond about 60 m.
- **Zones drive the mix:**
  - `reverb: 'stairwell'` turns on the stairwell life.
  - `'underpass'` brings the drips.
  - `'metro'`/`'tunnel'`, or y < −3, gives the underground tone.
  - `indoor: true` muffles the outdoor beds.
  - `wind` and `traffic` scale those beds.
  - `silence: true` gives the "courtyard where the wind stops".
- Register manholes as `ctx.registry.manholes = [{x, z}, …]` to get faint metro rumbles through them near the avenue.
- **Vehicles:** for a vehicle you move, use `play('car_pass'|'bus_pass'|'trolleybus_pass', { pos, loop: true, speed })`, `setPosition` each frame, `setRate(sqrt(kmh/50))`, and `stop()` on despawn. Use `trolleybus_depart` once at the spawn stop.
- **Metro:** the usual sequence is `metro_train_arrive`, then `metro_doors` about 15 s later, then `metro_train_depart`. During the ride, play `metro_rumble` with `loop:true`, and `metro_station_announce` (with `terminus:true` on the impossible return to «Заречная»).
- **Memory and CPU:**
  - Buffers are rendered in a worker (inlined with `?worker&inline`, so the single-file build keeps it): about 24 MB at load (interactive sounds), more tiers after 8 s and 45 s, capped near 48 MB with LRU eviction. A buffer that is still playing (a TV loop running for minutes) is never evicted.
  - `playSpeech()` renders each new text once (about 0.1–0.3 s in the worker), caches it, and stops its emitter from the real rendered length.
  - Each playing sound is about 5–6 nodes; the director's beds are about 30 persistent nodes.
  - Steady state is 4 convolvers: the engine's 2 and 2 for the foley path, and the faded one is released after a crossfade.

## Testing

```
node tools/audio-check.mjs                 # renders every sound offline: NaN / silence / clipping / clicks / DC / loop seams / levels (st = short-term max, stA = A-weighted)
node tools/audio-check.mjs --spectro dog_bark,metro_doors     # spectrogram PNGs → tools/out/audio/
node tools/audio-check.mjs --steps         # footstep series per surface (+ PNGs)
node tools/audio-check.mjs --music 3       # three ambient pieces offline (+ PNGs)
node tools/audio-check.mjs --live --seconds 30 --t 21:30 [--force silence|music] [--step snow]
                                           # the real game (only=base,audio): master-output levels (rms and A-weighted rmsA) + director state per second
       [--at x,z] [--zone stairwell|underpass|metro|silence|shop] [--fire] [--onlypk base,audio,…]
```
