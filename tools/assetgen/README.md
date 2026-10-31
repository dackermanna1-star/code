# Asset generators (textures + audio)

Every PNG and OGG under `src/main/resources/assets/jjkshowdown/{textures,sounds}` and
`assets/jjkshowdown/icon.png` is produced procedurally by the scripts here. No external art or samples are used.
The `.png.mcmeta` animation files for the three animated blocks come from here too.

## Requirements

- Python 3.11+ with **numpy** 2.x and **Pillow** (no scipy needed)
- **ffmpeg** with `libvorbis` (encoding) and `rubberband` (Sukuna pitch shift)
- `libsndfile.so.1`, optional: used through ctypes for exact Vorbis decoding during verification. Without it the
  scripts fall back to ffmpeg.
- Voice lines only: **Piper** TTS plus the voices `en_US-ryan-high` and `en_US-norman-medium` (`.onnx` and
  `.onnx.json`). Set `JJK_PIPER=/path/to/piper` and `JJK_VOICES=/dir/with/onnx/models` if they are not at the
  default scratch location coded in `gen_voice.py`.

## Regenerate

```bash
cd tools/assetgen
python3 generate_all.py               # everything (~4 min), then runs verify.py
python3 generate_all.py --skip-voice  # no Piper needed
python3 gen_sfx.py dismantle cleave   # single generator / name filter
python3 verify.py                     # checks every deliverable, exit code 0 = all good
```

Preview sheets go to `$JJK_SCRATCH/preview` (default: the session scratch `assetwork` dir), never into the repo.
They include 8x nearest-neighbour contact sheets, a software-rendered 3D turnaround of each skin and audio
spectrograms.

## Scripts

| script | output |
|---|---|
| `gen_skins.py` | `entity/gojo*.png`, `entity/sukuna*.png`, `entity/equipment/humanoid/gojo_blindfold.png` |
| `gen_effects.py` | `entity/technique/*` (premultiplied colour, so transparent pixels are black) |
| `gen_blocks.py` | `block/*` + `.mcmeta` |
| `gen_items.py` | `item/*` |
| `gen_particles.py` | `particle/*` |
| `gen_gui.py` | `gui/**`, `icon.png` |
| `gen_sfx.py` | `sounds/{gojo,sukuna,combat,domain,ui}/*` (mono) |
| `gen_music.py` | `sounds/music/*` (stereo loops, -14 LUFS) |
| `gen_voice.py` | `sounds/voice/{gojo,sukuna}/*` (Piper + processing, mono) |
| `texlib.py`, `dsp.py`, `skinpreview.py` | shared pixel, DSP and preview helpers |
| `manifest.py`, `verify.py`, `analyze_audio.py` | deliverable list, checks, spectrogram previews |

## Notes

- **Skins** are authored as ASCII grids, one character per pixel mapped to colour ramps. Each body part has a top
  face, a bottom face and a horizontal wrap strip (right | front | left | back, matching the skin net). Faces on the
  character's left side and back are shifted one ramp step darker for a consistent top-left light. Left limbs are
  mirrors of the right ones. The emissive overlays (`*_eyes`, `*_markings`) come from the same grids, so they line
  up with the base skin pixel for pixel. They are premultiplied and black where transparent, which suits additive
  "eyes" render layers.
- **Loops** (`blue_loop`, `void_ambient`, `shrine_ambient`, `domain/clash`, and all music) are synthesised
  circularly. Every tone has a whole number of cycles per loop, noise is filtered with circular FFTs, events and
  reverb tails wrap around, and the length is an exact multiple of the bar. The loop point is seamless by
  construction, and `verify.py` measures the seam as well.
- **Levels**: every OGG decodes with a sample peak of -1 dBFS or lower (checked after encoding, re-encoded if
  needed), has a DC offset below 0.001 and no clipping. SFX are levelled by max momentary loudness: impacts about
  -10 LUFS, heavy hits about -11, medium about -13, UI about -14.5, ambient loops about -14. Music is -14 LUFS
  integrated.
- **Voices**: each line is split into sentence units. A `...` in the script becomes a deliberate dramatic pause,
  because Piper barely pauses on ellipses. Every unit is synthesised 3 times. Each take keeps only its first
  continuous speech burst, which drops the end-of-utterance babble VITS voices sometimes add after short words such
  as "Cleave.". The median-length take is used. Two lines are respelled for synthesis only, with the same words:
  "Fuga!" and "Hah, this body will do.". Piper is stochastic, so re-runs differ slightly in timing.
- Vorbis note: ffmpeg's decoder ignores the end-trim granule on very short Ogg files, so verification decodes with
  libsndfile. Its exact sample counts match what Minecraft's stb_vorbis plays.
