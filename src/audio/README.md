# Battlespace audio

Fully procedural battlefield audio on the Web Audio API. Every sound is synthesised
in JavaScript at startup. There are no audio files and no network fetches, so it works
inside a single self-contained HTML page.

## Quick start

```js
import { AudioSystem } from './audio/AudioSystem.js';

const audio = new AudioSystem({ maxVoices: 48 });
startButton.onclick = () => audio.start();      // must come from a user gesture

function frame(dt) {                            // every animation frame
  audio.update(dt, { position, forward, up, velocity });   // camera, world space, metres, +Y up
  audio.setLoops(vehicles.map((v) => ({ id: v.id, kind: 'tank', position: v.pos, velocity: v.vel, intensity: v.throttle })));
}

audio.play('rifle', muzzlePosition);            // at the source position; the delay is handled here
audio.play('jet_gun', gunPosition, { duration: 1.6 });
audio.flyby('bullet', closestPointToCamera, 910);
audio.setEnvironment({ wind: 0.4, rain: 0, thunderstorm: false, battleIntensity: 0.7, nearIntensity: 0.3, night: false });
audio.radio('Contact front!', 0, { priority: 1 });
```

Before `start()` resolves, all calls are harmless no-ops. Setters (`setMuted`,
`setMasterVolume`, `setVoiceRadio`, `setTimeScale`, `setEnvironment`) are remembered
and applied at start.

## API

| Method | Notes |
| --- | --- |
| `constructor({ maxVoices = 48, maxLoops = 8, workers, onProgress, context })` | No AudioContext yet. `workers` is the number of synthesis threads; the default is min(3, cores − 1), and 0 means the main thread. `context` injects an `(Offline)AudioContext` and is meant for tests. |
| `async start()` | Creates the AudioContext (calling `resume()` before its first `await`, so it stays inside the gesture) and synthesises the bank. Safe to call twice: it returns the same promise. |
| `ready` | `true` once `start()` has resolved. |
| `setMuted(m)` | Fades the master out, stops voices, loops and radio, then suspends the context. Unmuting resumes it. |
| `setMasterVolume(v)` | Linear gain, 0..1 (also scales the speech volume). |
| `setVoiceRadio(on)` | Uses `speechSynthesis` for `radio()` when voices exist; otherwise synthetic radio babble. |
| `setTimeScale(s)` | 1 is normal. Below 1, pitch drops (0.6 + 0.4·s), a lowpass closes, and speed-of-sound delays stretch with the sim. 0 freezes the sound clock (pending reports wait) and ducks loops; UI sounds still play. |
| `update(dt, listener)` | Call every frame. `dt` is real seconds (clamped to 0.25). `listener = { position, forward, up, velocity }` in world space; `forward × up` is the listener's right (three.js camera: forward −Z, up +Y). Starts due one-shots, moves long voices, runs the bed, ambience and radio. |
| `play(name, position, { volume = 1, pitch = 1, duration })` | Spatial one-shot at the source position (`position` may be `null` for `ui_*`). `duration` sets the burst length for `jet_gun`, and the time-to-impact for `incoming_shell`, `bomb_whistle` and `drone_dive`, which are aligned to end on impact. Without it they assume the current sim's lead times: 2.8 s, 3 s and 4 s. `jet_flyby` swells for about 2 s, roars past, then rumbles away, so fire it shortly before the jet is overhead. Unknown names log one warning each. |
| `flyby(kind, closestPoint, speed)` | `kind`: `bullet`, `heavy`, `shell` or `rocket`. Above 350 m/s you get a supersonic crack/rip, below it a whizz/whoosh. Plays immediately, scaled by the miss distance; at most 4 per frame. |
| `setLoops(sources)` | Every frame: `[{ id, kind, position, velocity, intensity 0..1 }]`. The loudest `maxLoops` sources (with hysteresis) get voices that fade in and out as ids come and go. |
| `setEnvironment(env)` | `{ wind 0..1, rain 0..1, thunderstorm, battleIntensity 0..1, nearIntensity 0..1, night }`. Partial objects are fine. |
| `thunder(distance)` | Lightning `distance` m away: a crack-and-boom if near, a long low roll if far, delayed by distance / 343 s. |
| `radio(text, faction 0/1, { priority 0..2 })` | Squelch, static and a voice. One transmission at a time; a queue of 4 by priority; de-duplicated and rate limited. |
| `stats()` | Diagnostics: active voices, pending, steals, bed counters, loops, radio, synthesis timing. |
| `dispose()` | Stops everything and closes the context (unless it was injected). The synthesised bank stays cached for the page. |

## Sounds

- **Small arms:** `rifle rifle_ak lmg gpmg sniper pistol smg hmg`
- **Heavy fire:** `autocannon aa_gun heli_gun jet_gun tank_cannon howitzer mortar`
- **Launches:** `rpg_launch atgm_launch missile_launch sam_launch mlrs_launch rocket_pod grenade_launch flare_launch smoke_launch`
- **Explosions:** `explosion_small explosion_medium explosion_large explosion_huge explosion_air`
- **Other:** `incoming_shell bomb_whistle ricochet impact_metal impact_dirt impact_concrete impact_wood building_collapse tree_fall vehicle_destroyed ammo_cookoff fire_burst parachute_open drone_dive jet_flyby debris shell_casings reload whistle ui_click ui_confirm`
- **Loops:** `tank ifv apc truck heli jet plane drone uav fire spaag_radar`

Levels, distance curves, variant counts and synthesis rates are all in `catalog.js`.

## How it works

**Synthesis** (`synth/*.js`, `dsp.js`). Recipes model what a microphone near the event
would capture:

- **Gunshots:** an N-wave supersonic crack (0.15–1.5 ms), a Friedlander muzzle blast, band-limited turbulent gas, a low thump, a ground reflection 1–2 ms later, near scatter and soft saturation.
- **Explosions:** a shock front, a sub-bass punch with a pitch drop, a fireball roar whose lowpass collapses from about 8 kHz to about 300 Hz, crackle, soil/stone/metal debris raining back, and rolling terrain echoes.
- **Loops:** built exactly periodic. Frequencies are quantised to whole cycles per loop, impulses wrap around the end, and IIR filters (including the pink and brown colouring) are pre-rolled circularly, so loops have no seam and need no crossfade.

Most sounds have 2–4 variants plus random pitch and gain jitter, and the bank never
repeats the previous variant. Gunfire and explosions also get a **far layer**, rendered
from the near one with air absorption, ground effect and sparse terrain echoes; the
convolver, which far voices feed heavily, adds the diffuse tail. Far layers are what
produce the flat distant "pop".

The bank is rendered at startup in a small worker pool. Vite inlines the worker via
`?worker&inline`, so a single-file build keeps it. If workers are unavailable, it runs
on the main thread in short jobs that yield. Each recipe uses the lowest sample rate its
bandwidth allows. Banks are cached per sample rate.

**Runtime.**

- **Delay:** `play()` computes the distance at emission and queues the event in *sim time* for `distance / 343` s (at most 8 s of real time), so the flash comes first and the report later.
- **Voices:** at arrival, events compete for `maxVoices` pooled channel strips (env gain → lowpass → distance gain → StereoPanner, plus a reverb send). Only an `AudioBufferSourceNode` is created per event. Ranking is by loudness at the listener, decayed by each voice's age. Per-category caps apply, and the quietest voice is stolen with a 35 ms fade.
- **Distance:** class-specific power-law rolloff with excess attenuation. Air absorption is a lowpass of about 17 kHz/(1 + (d/60)^0.8). Sounds behind the listener are slightly duller. The reverb send rises and the direct path falls with distance.
- **Distant battle bed:** events beyond a class's aggregation distance, or ones that lost the voice race, go to the bed. It plays rate-limited far pops and thuds on its own small pool, panned from their real direction, over a rolling rumble that follows `battleIntensity` and the measured far-event rate. When the sim reports little distant fire, it adds synthetic bursts.
- **Reverb:** one ConvolverNode with a generated 2.8 s outdoor IR. It has early reflections, slapback echoes at about 0.17, 0.4 and 0.7 s, and a lumpy, darkening diffuse tail.
- **Master:** glue compressor → trim (cancels its makeup gain) → limiter (radio joins here) → soft clip. A close blast ducks and muffles everything for about 1.5 s, after letting its own first 30 ms through, and adds a faint 3.6–4.5 kHz ear ringing, both scaled by proximity.
- **Loops:** each source is heard at its *retarded* position, where it was when the sound now arriving left it. Doppler comes from the source and listener velocities (clamped to 0.5–2). Intensity maps to rpm (playbackRate) and gain, and each id gets a small fixed detune.
- **Radio:** speech via `speechSynthesis` (rate 1.15, a distinct voice and pitch per faction, volume 0.6, with a watchdog), or formant-synthesised band-limited babble. Either way it gets squelch open/close and static.

## Testing

- **`scripts/audio-lab.html`** (served by Vite: `npx vite --port 5198`, then open `/scripts/audio-lab.html`). Plays every sound at 15/200/1000 m, runs a 300 events/s stress test over a 2 km area, and has loop toggles, weather, radio and flybys. `?workers=0` forces main-thread synthesis.
- **`node scripts/audio-check.mjs`**. Headless Chromium; starts Vite if needed. Checks synthesis time, every buffer (finite, peak ≤ 1, decay or seamless loop, spectral character), the real-time stress test (voice cap, `update()` cost), and offline renders of whole scenes through the runtime (speed-of-sound delays, distance filtering, limiter, ducking and ringing, doppler, retarded jet position, jet-gun bursts, weather, radio limiting).
