# Asset pipeline (textures + sounds)

Scripts that (re)build everything under `public/assets/` from public-domain (CC0) sources.
Nothing here runs at game build time; the outputs are committed.

| Output | Script |
|---|---|
| `public/assets/textures/*.jpg` and `manifest.json` (38 materials × albedo/normal/rough) | `fetch_textures.py` (+ `texlib.py`, `procedural_textures.py`) |
| `public/assets/sounds/<pack>/*.ogg` and `manifest.json` | `fetch_sounds.py` |
| `public/assets/CREDITS.md` | `write_credits.py` (reads both manifests) |

Selection aids (not needed to regenerate): `contact_sheet.py` (ambientCG candidate previews),
`oga_info.py` (prints title/author/license/files of a saved OpenGameArt page),
`sound_features.py` (nearest-neighbour acoustic comparison used when categorising ambiguous sounds).

## Requirements

* Python 3.10+ with `numpy` and `Pillow`; `py7zr` for the `.7z` sound packs (`pip install numpy pillow py7zr`).
* `ffmpeg` / `ffprobe` with libvorbis.
* Network access to `ambientcg.com`, `kenney.nl` and `opengameart.org`.

## Regenerate

Run from the repo root. Downloads are treated as untrusted data: they go to a scratch
directory outside the repo (`--work`, default `/tmp/claude-0/assets-work`), every archive is
extracted into its own fresh directory, only expected image/audio members are extracted (names
sanitised, no paths), and Python runs isolated (`-I`).

```sh
python3 -I scripts/assets/fetch_textures.py --work /tmp/assets-work   # ~1 min, ~220 MB of downloads
python3 -I scripts/assets/fetch_sounds.py   --work /tmp/assets-work   # ~10-15 min (ffmpeg), ~185 MB of downloads
python3 -I scripts/assets/write_credits.py
```

Useful options:

* `fetch_textures.py --only wood_oak,granite` rebuilds selected textures (the manifest is merged).
* `fetch_textures.py --only wood_oak --probe /tmp/sheet.png` writes a preview sheet (albedo,
  2×2 tiling, lit preview, normal, roughness) instead of output files;
  `--try '{"name":"x","src":"Wood058","rot":1,"size":1}'` adds ad-hoc candidates to a probe.
* `fetch_sounds.py --list` downloads/extracts and prints every source file with duration,
  sample rate and the category its rules would give; `--only pack_id,...` rebuilds some packs.

## Textures

Every entry of `SPEC` in `fetch_textures.py` names an ambientCG asset id (`src`) or a numpy
generator (`gen`, see `procedural_textures.py`) plus a few grading parameters. For photo entries:

1. Download `<ID>_1K-JPG.zip` (`https://ambientcg.com/get?file=<ID>_1K-JPG.zip`), extract only
   `Color`, `NormalGL`/`NormalDX`, `Roughness`, `Displacement`, … maps.
2. Non-square sources are repeated along their short side to the nearest square aspect
   (they are seamless), then the remaining anisotropy is removed by the resize.
3. Optional 90° rotation (`rot`) so wood grain / brushing runs along U. Normal vectors are
   rotated together with the pixels (CCW 90°: `(x, y) -> (-y, x)`).
4. Downscale 1K → 256 with Lanczos on a wrap-padded image (seamless in, seamless out).
   Colour is filtered in linear light, normals as vectors and re-normalised. A small
   seam-correction ramp is applied only if the source has a measurable wrap discontinuity.
5. Grading: large-scale brightness flattening (reduces visible tiling), desaturation and
   brightness/colour targets (tintable materials are neutral light grey), normal strength,
   optional extra relief from the high-passed albedo, roughness percentile remap.
6. Optional procedural post-process (`post_*` in `procedural_textures.py`): orange-peel paint,
   glaze waviness, plain weave, galvanised spangle, brushing, flutes, grain, dark-granite remap.
7. Save 256×256 JPEG q90 (4:4:4 chroma, so normal X/Y are not chroma-subsampled):
   `<name>_albedo.jpg` (sRGB), `<name>_normal.jpg` (tangent space, **OpenGL convention, +Y up**;
   DirectX sources would get Y flipped), `<name>_rough.jpg` (8-bit greyscale roughness).

`manifest.json` fields: `name`, `albedo`, `normal`, `rough`, `avgColor` (mean of the saved
albedo in **linear** RGB 0–1), `tintable` (albedo is neutral and meant to be multiplied by a
vertex/instance colour), `worldSizeMeters` (approx. real-world size of one tile; set UV scale to
`1 / worldSizeMeters` repeats per metre), `procedural` (true = generated here with numpy),
`metallic` (1 = albedo is a metal base colour), `source`, `sourceMethod` (ambientCG's creation
method: PBRPhotogrammetry / PBRMultiAngle / PBRApproximated are photo based, PBRProcedural is
authored procedurally by ambientCG; or `numpy procedural`), `license`, `url`, `notes`.

## Sounds

`PACKS` in `fetch_sounds.py` lists each pack (Kenney zip via the kenney.nl signed download link,
or direct OpenGameArt file URLs — only packs whose OGA license field is exactly CC0) with ordered
regex `rules` mapping source filenames to a category (or `None` = skip) and optional `rename`
patterns / length caps. Each kept file is converted with ffmpeg to mono 44.1 kHz OGG Vorbis q5:
leading silence trimmed (onset = first sound within 40 dB of the peak), trailing near-silence
trimmed, long loops capped (with a 0.3 s fade), peak-normalised to −1 dBFS (verified on the
decoded file; re-encoded if the codec overshoots). Files shorter than 50 ms are dropped as junk.

Categories: `impact_wood, impact_metal, impact_glass, impact_plastic, impact_soft,
impact_ceramic, impact_concrete, punch, footstep_wood, footstep_tile, footstep_carpet,
footstep_concrete, door, creak, cloth, glass_break, wood_break, debris, water, electric, misc`.
They come from filenames plus judgement; a few are educated guesses (e.g. Kenney "impactPlate" /
"impactGeneric" dull knocks are filed as `impact_plastic`, Kenney RPG footsteps as
`footstep_carpet`, generic "hit" files as `misc`). Edit the rules and rerun to change them.
