# Asset Conventions

All runtime assets live under `public/assets/` and are loaded by URL (`/assets/...`).
Raw downloads and intermediate files never go in the repo. They go in the session
scratchpad.

## Coordinate system & units
- glTF 2.0 conventions: **+Y up, +Z forward**, so the front of a character, vehicle or weapon faces +Z.
  The system is right-handed, so an asset facing +Z has its own right-hand side toward **-X**.
  (A three.js camera is the opposite: it looks along -Z and its right is +X.)
- Units are **meters**, real-world scale (a human is ~1.8 m, an AKM is ~0.88 m long).
- World map: X = east, -Z = north (three.js default camera looks toward -Z = north).

## Formats
- Models: `.glb`. Meshopt compression (`EXT_meshopt_compression`) and quantization
  (`KHR_mesh_quantization`) are allowed. The loader has MeshoptDecoder. **No Draco, no KTX2.**
- Textures embedded in GLBs are JPEG/PNG/WebP with a max size of 2048 px and usually 1024 px.
- Standalone PBR sets go in `public/assets/textures/<set>/`:
  - `albedo.jpg` (sRGB), `normal.jpg` (OpenGL convention, green = +Y), `arm.jpg` (R = AO,
    G = roughness, B = metalness), optional `height.jpg`. 1024 px unless noted. Terrain sets may be 2048.
- HDRIs: `public/assets/hdri/<name>_1k.hdr` (or `.jpg` equirect for backgrounds).
- Audio: `.ogg` (Vorbis/Opus) or `.mp3`, 44.1/48 kHz. Mono for positional one-shots, stereo for ambience and UI.

## Size budget
- Each file is ≤ 20 MB. All of `public/assets` stays ≤ ~400 MB in total.

## Important named nodes
- **Weapons** (`public/assets/weapons/<id>.glb`): the origin is at the firing-hand grip,
  the barrel points along +Z, and up is +Y. Optional child empties are `muzzle`, `grip_support` (left-hand
  position), `sight_eye` (eye position when aiming down iron sights), `mag`, `bolt`, `rail_top`.
- **Vehicles** (`public/assets/vehicles/<id>.glb`): forward is +Z and the origin is on the ground at the center
  of the wheelbase. Wheels are separate nodes named `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`
  (`wheel_f`/`wheel_r` for motorcycles), with each wheel's origin at its hub. Seats are `seat_0` (driver) … `seat_n`.
  Optional `steering_wheel`, `exhaust`, `door_*`.
- **Characters** (`public/assets/characters/<id>.glb`) are skinned meshes on the shared skeleton.
  Animations live in `public/assets/anims/*.glb`, retargeted to that same skeleton.

## Manifests
Each category has `public/assets/<category>/manifest.json` (with id, file, source URL, license,
triangle count, bounds in meters, important node names and clip names) and a `README.md`
(quality notes, gaps and recommendations for the code team).
