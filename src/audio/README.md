# src/audio: procedural audio for the wet-alley night walk

Everything is synthesized at runtime with the Web Audio API: no audio files, no network. Buffers are
generated in JS (seeded PRNG, chunked with `await` yields), then played through a native node graph.
Nothing here depends on three.js: positions are plain `{x, y, z}` objects (meters, Y up).

## Quick start

```js
import { AudioEngine } from './audio/AudioEngine.js';

const audio = new AudioEngine({ seed: 1337 });            // optional: { context, seed, volume, maxHrtf, alley }
startButton.onclick = async () => { await audio.init(); };  // must be called from a user gesture

// every frame
audio.setListener(camera.position, cameraForward, cameraUp);
audio.update(dt, {
  time,                                  // world clock (s); also drives windAt(time)
  playerPos, playerVel, speed,
  distFront, distBack,                   // m to the big reflecting wall ahead (-Z) / behind (+Z)
  enclosure,                             // 0..1: 1 = deep in the alley, ~0.5 in the T-junction
  // corridorDir: {x, z}                 // optional; corridor axis for the flutter stereo width (default {0, 1})
});

// gait events (the world schedules heel, then toe ~80-120 ms later)
audio.footstep({ foot: 'L', part: 'heel', surface: 'asphalt', intensity: 0.7, position: footPos });

// persistent emitters (safe to add before init: they attach when their sounds are ready)
const lamp = audio.addEmitter({ type: 'lampBuzz', position: { x: -2.6, y: 4.5, z: -4 } });
lamp.setIntensity(visualLampIntensity);  // every frame; sudden changes crackle, 0 drops the buzz out

// one-shots
audio.oneShot('drip', { position, surface: 'water' });
audio.oneShot('carPass', { from: { x: -45, y: 0.5, z: 14 }, to: { x: 45, y: 0.5, z: 14 }, duration: 6 });

// shared wind for visuals (deterministic; available before init)
const w = audio.windAt(time);            // 0..1

audio.setPaused(true);                   // 0.4 s fade, then the context is suspended
```

## Public API (`AudioEngine.js`, named export `AudioEngine`, also default)

| member | notes |
|---|---|
| `constructor(opts)` | `opts.context` (AudioContext or OfflineAudioContext), `opts.seed`, `opts.volume`, `opts.maxHrtf` (10), `opts.alley` (`{halfWidth: 2.8, zBack: 8, zFront: -90}`, used for car-pass occlusion), `opts.ambience` / `opts.autoEvents` (false disables the bed / the event scheduler), `opts.clothing` (false disables the fabric swish), `opts.ambientDripRate` (events/s, default 0.35), `opts.fadeInSec` (1.2) |
| `async init()` | Creates the context if none was given (call it from a user gesture), synthesizes phase 1 and builds the graph. Always resolves; on failure it logs and `ready` stays false. |
| `whenFullyLoaded()` | Promise that also waits for phase-2 background synthesis (see Performance). |
| `ready`, `context` | getters |
| `setPaused(paused)` | Linear 0.4 s fade of the master. A real AudioContext is then suspended; resuming fades back in. Footsteps and one-shots are ignored while paused. |
| `setListener(pos, forward, up)` | Every frame. Smoothed with `setTargetAtTime` (12 ms). |
| `update(dt, state)` | Every frame. Drives slap-back delays, enclosure, flutter width, wind, emitter distance cues, HRTF assignment, car passes and the ambience scheduler. Missing or non-finite fields keep their previous values. |
| `footstep(e)` | `{foot:'L'\|'R', part:'heel'\|'toe'\|'scuff', surface, intensity:0..1, position}`. Optional `when` (context time) schedules the step precisely. Unknown surfaces fall back to asphalt. |
| `addEmitter(desc)` → handle | `{type, position, gain?, params?}`. Handle: `setGain(v)`, `setIntensity(v)`, `setPosition(p)`, `stop()`. |
| `oneShot(type, params)` | Returns `true` if played (false while not ready, paused, or before that bank exists). |
| `windAt(t)` | Deterministic 0..1 gust function. |
| extras | `registerDumpster(pos)` / `setDumpsters([...])`, `triggerAmbient(type)`, `setAmbienceEnabled(bed, events)`, `setVolume(v)`, `setBusGain(name, v)` (`footsteps`, `emitters`, `oneShots`, `ambience`, `reverb`), `getDebugInfo()`, `dispose()` |

### Emitter types
`hvac` (compressor hum + fan + occasional panel rattle), `exhaust` (rooftop kitchen fan whoosh, breathes with the wind),
`transformer` (60/120 Hz hum + harmonics, faint sizzle), `lampBuzz` (120 Hz ballast buzz + arc sizzle, driven by
`setIntensity`), `trickle` (downspout into a puddle), `drain` (gurgle into a storm drain, hollow chamber),
`tv` / `voices` / `radio` (pre-muffled, as if heard through glass; played as random crossfaded segments of long
buffers so they never loop audibly; the radio alternates two songs with DJ talk).

Optional `params`: `refDistance`, `rolloff`, `reverb` (send multiplier), `lowpass` (Hz, extra muffling), and
`rattle: false` for `hvac`.

### One-shot types
`drip {position, surface:'water'|'metal'|'ground'|'plastic'}`, `canKick {position, strength}`,
`canRoll {position, duration}`, `bottleKick {position, strength}`, `paperRustle {position, strength}`,
`plasticRustle {position, strength}`, `garbageShift {position}`, `doorRattle {position}`, `wireCreak {position}`,
`carPass {from, to, duration}`.

A car pass moves a panner along `from` to `to` and applies Doppler from the rate of change of the path length.
When the car is hidden behind a facade (judged against the alley geometry in `opts.alley`), the sound arrives
diffracted around the alley-mouth corner, so it is placed at the corner and made quieter and darker. The
spray and hiss open up while the car crosses the opening.

### Autonomous ambience (scheduled by the engine)
- **City bed**: low rumble, far wet-road hiss swells and a faint low drone. Long loops with random offsets and slow random filter/gain walks.
- **Wind**: follows `windAt(time)`. Broadband, plus two resonant whistles that wake up in strong gusts and rise in pitch with wind speed.
- **Distant cars**: about every 6–60 s (Poisson).
- **Sirens**: every 2–5 min, wail/yelp with Doppler and building echoes.
- **Elevated train**: every 2.5–5.5 min: rumble, wheel clacks over rail joints, faint squeal.
- **Street voices/laughter** from the cross street: about every 25–150 s, positioned beyond the far end.
- **Dog**: a rare, distant bark.
- **Garbage**: settling at registered dumpsters, plus plastic/paper rustles on rising strong gusts.
- **Ambient drips**: faint and reverberant (independent of the world's visual drips).

Distant events go through a dark "city" convolution reverb (RT60 about 2.4 s at low frequencies, with
discrete building echoes).

## Signal flow

```
footsteps -> per-event LPF(intensity) -> gain -> StereoPanner(foot) -> busFootsteps ---------------> preMaster
                                                       busFootsteps -> HPF 200 Hz -> sends:
emitters  -> voice -> level -> Panner(HRTF/eq) -> air LPF -> busEmitters ---------------------------> preMaster
                     level -> distance-scaled send -> HPF 160 Hz -> sends
one-shots -> pooled voices (3 HRTF + 9 equalpower) -> busOneShots, send -> HPF 140 Hz -> sends
sends -> [flutter convolver (enclosure^1.6, M/S width by head yaw)] -+
      -> [diffuse convolver (enclosure)]                            +-> busReverb -> preMaster
      -> [slap-back: front & back lines, twin crossfaded delays,    |
          LPF/HPF, HRTF-placed, cross-fed, also into diffuse]       -+
ambience (bed, wind, distant events -> city convolver) -> busAmbience -> preMaster
preMaster -> masterGain (pause/volume) -> compressor -> limiter -> make-up compensation -> soft clip -> out
```

## Acoustics
- **Flutter IR**: image-source model of two parallel walls 5.6 m apart. The listener is about 1.2 m off-centre and the source is at the feet, 1.55 m below the ears. Arrivals come L, R, then L+R, repeating every 2W/c = 32.7 ms; measured 31.6–32.5 ms early on, shortened by the height difference. Each bounce applies brick reflectance 0.96, scattering into a widening cluster of taps, and a progressive low-pass. Each arrival gets an interaural delay and head shadow. Flutter RT60 is about 0.9 s at mid and about 0.5 s at 8 kHz. The flutter's stereo width shrinks when the head turns toward a wall.
- **Diffuse IR**: banded noise decay with a falling low-pass (RT60 about 1.5 s at 125–250 Hz, 1.2 s at 1 kHz, 0.6 s at 8 kHz), a slower 12–130 ms build-up, and sparse late reflections. Both IRs are energy-normalized; the send levels set the balance.
- **Slap-back**: delay = 2·dist/343, clamped to 36–500 ms and compensated about 4 ms for panner latency. Level falls with distance (about −14 dB at 8 m to −27 dB at 70 m relative to the step) and the low-pass darkens with distance. Large jumps switch to the idle twin delay line with a 45 ms crossfade; small changes glide, which gives a natural Doppler.
- **Spatialization**: PannerNode, `inverse` distance model with a per-type refDistance. An air-absorption low-pass follows `20 kHz / (1 + d/26)`. The reverb send falls as sqrt of the direct gain, so distant sources sound wetter. HRTF is used for the nearest emitters within 30 m, two slap-back panners, three one-shot voices and car passes, capped at 10 in total. HRTF/equalpower switches happen behind a 75 ms gain dip.

## Footsteps
For each of the 10 surfaces and 3 parts (heel, toe, scuff) there are 8 variants with randomized physical
parameters. Each event adds ±3 % pitch, ±2 dB gain and intensity-dependent brightness, and never repeats the
previous buffer.
- **Heel**: an energy-weighted mix of a sub-millisecond contact click, resonant body noise (1.5–4 kHz), heel-tip modes, the boot-block "tock" (650–1150 Hz) and a small thump. The centroid is about 2.6–2.9 kHz on hard surfaces and the decay to −40 dB takes 20–35 ms.
- **Toe**: a duller sole slap, 6–9 dB below the heel.
- **Surface layers**: wet "tsk" (asphalt), crisper click (concrete), ringing inharmonic partials of 150–400 ms (metal), loose-grate rattle bounces (grate), splash with bubbly droplets (puddle; the toe splashes more), squelch (wet), crunch (debris), glassy crunch with tinkles (glass), knock (wood) and soggy thud (cardboard).
- **Clothing**: an optional, very quiet fabric swish on heel strikes.

## Performance
- **Phase 1** (`init()` resolves): IRs, footsteps, common one-shots, bed and wind, lamp/transformer and HVAC. About 0.7–1.3 s on the 2.1 GHz Xeon test VM (headless Chromium); expect roughly half that on a typical laptop.
- **Phase 2** runs cooperatively in the background, finishing about 1–1.3 s later (2.0–2.6 s total): the remaining one-shots, trickle/drain/exhaust/TV/voices/radio, car loops, city IR, distant cars, sirens, train and street babble. Emitters and one-shots whose banks are not ready yet attach or play as soon as they are; until then a car pass returns false.
- The main thread yields every 10 ms of work (longest blocks observed: about 45–90 ms on the VM).
- About 51 MB of AudioBuffers (370 buffers). Band-limited material uses reduced sample rates (8–32 kHz).
- Offline rendering of the full walk runs at about 2.7x real time on the VM.

## Testing
- `tools/audio-test.html` (serve the repo with Vite and open `/tools/audio-test.html`) has these controls:
  - init, pause, volume;
  - footstep buttons (keys 1–0, S for scuff);
  - every one-shot, emitter toggles and a lamp flicker;
  - ambience triggers and a live `windAt` plot;
  - acoustic overrides (distFront, distBack, enclosure, yaw);
  - a walk simulation down the alley;
  - offline renders downloaded as WAV.
- `src/audio/dev/scenario.js`: offline scenarios (`walk`, `steps`, `slap`, `emitters`, `ambience`, `events`, `oneshots`, `lamp`, `carpass`). These are driven through `OfflineAudioContext.suspend()` exactly like a game loop, with `renderOffline()` and `encodeWav()`. `window.__audio` exposes them on the test page for headless runs.
