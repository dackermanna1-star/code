# Audio module

| File | Role |
|---|---|
| `index.js` | entry: AudioContext, bus graph, listener (priority 70), settings, pause duck, headphones, zone acoustics, event wiring, public API, offline debug renderers |
| `aircraft.js` | procedural soundscape driven by `app.flight.state` (CFM56 engines, APU, packs, airflow, rolling + joint thumps, gear/flaps hydraulics, PTU, brakes, reverser, spoilers, turbulence rattles, galley/lav equipment, airport ambience at the gate) |
| `foley.js` | one-shot sound definitions, synthesised offline into cached AudioBuffers (modal impacts, noise, creaks, crackles, bubbles) |
| `announcer.js` | PA queue: key click -> chime -> pre-rendered voice -> unkey; events `cabin:announcement` / `cabin:announcementEnd`; speechSynthesis fallback |
| `music.js` | generative boarding music through the PA |
| `dsp.js` | noise bank, IR generator, JS biquad, `SynthBuf` synthesis primitives |
| `analysis.js` | RMS/peak/centroid/octave-band analysis of AudioBuffers |
| `tools/gen_announcements.py` | offline TTS (Piper) + ffmpeg PA chain -> `assets/audio/announcements/*.ogg` + `index.json` |
| `tools/analyze.py` | numeric check of any audio file (ffmpeg decode) |
| `tools/audio-test.mjs` + `tools/tests/*.js` | headless Chromium verification (offline renders of every phase, foley, announcements, live runtime) |

## Regenerating the announcements

```
pip install piper-tts numpy
mkdir -p /tmp/voices && cd /tmp/voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/main/en
for v in en_US/norman/medium en_US/ljspeech/high; do n=$(echo $v | tr / -); curl -LO $B/$v/$n.onnx; curl -LO $B/$v/$n.onnx.json; done
python3 src/audio/tools/gen_announcements.py --voices /tmp/voices          # all, or --only id1,id2
```

## Verification

```
node src/audio/tools/audio-test.mjs src/audio/tools/tests/phases.js     # loudness / spectrum per flight phase
node src/audio/tools/audio-test.mjs src/audio/tools/tests/misc.js       # door proximity, every foley sound, every announcement
node src/audio/tools/audio-test.mjs src/audio/tools/tests/runtime.js    # live: director phases, headphones, lav, pause, PA queue
```
