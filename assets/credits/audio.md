# Audio module (src/audio/, assets/audio/)

## Self-generated (original work, no external samples)

* **All aircraft, airport and foley sounds** (engines, APU, packs, airflow, rolling, gear, flaps, PTU,
  brakes, touchdown, rattles, bins, trays, belts, lavatory, galley, doors, footsteps, chimes...) are
  synthesised at runtime by `src/audio/aircraft.js` and `src/audio/foley.js` (oscillators, filtered
  noise and modal-resonator synthesis). No sample libraries are used.
* **Boarding music** (`src/audio/music.js`): original generative composition, synthesised at runtime.

## Announcements (`assets/audio/announcements/*.ogg`)

Pre-rendered from the script in `src/flight/announcements.js` with the offline neural TTS
[Piper](https://github.com/rhasspy/piper) (MIT licence) using `src/audio/tools/gen_announcements.py`,
then processed with ffmpeg (PA band-limiting, saturation, compression, small reverb).
Voice models from https://huggingface.co/rhasspy/piper-voices :

| Speaker | Piper voice | Training data | Licence (per the voice's MODEL_CARD) |
|---|---|---|---|
| Captain (male) | `en_US-norman-medium` | LibriVox recordings, dataset by Bryce Beattie (https://brycebeattie.com/files/tts/) | Public domain |
| Purser (female) | `en_US-ljspeech-high` | LJ Speech Dataset by Keith Ito (https://keithito.com/LJ-Speech-Dataset/), LibriVox recordings | Public domain |

The rendered speech is therefore free of third-party rights; credit is given to the Piper project,
Bryce Beattie (norman voice), Keith Ito / LJ Speech and the LibriVox volunteers.
