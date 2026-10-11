# Engine conventions

These rules keep every module (map, textures, models, sounds, gameplay) consistent.

## Units and axes

- **World space is GoldSrc space**: X = east, Y = north, Z = up. 1 unit ≈ 1 inch.
  A standing player is 72 units tall (hull 32×32×72), eyes at 64 above the feet
  in Half-Life but **53 above the feet in Counter-Strike** (VEC_VIEW 17 above the
  hull centre). Crouched hull is 36 tall, eyes 30 above the feet.
- three.js is Y-up. The renderer owns a `world` group with `rotation.x = -π/2`, so every
  child of `world` is authored directly in GoldSrc coordinates. Use
  `gsToThree()` / `threeToGs()` from `src/engine/coords.js` when crossing over.
- Yaw 0 looks down +X, yaw 90 looks down +Y (counter-clockwise from above), pitch
  positive looks **down** (GoldSrc convention). Angles are degrees.

## Colour

- three.js colour management is **off** (`ColorManagement.enabled = false`, output
  `LinearSRGBColorSpace`). Texture bytes go straight to the screen, as in 2003-era
  renderers that did all lighting maths in gamma space.
- Author textures so they look right at **100 % brightness** = a sunlit surface.
  Baked lightmaps multiply them: shade ≈ 0.45–0.6, direct sun ≈ 1.0–1.15.

## Textures

- Generated procedurally on a `<canvas>`; power-of-two sizes (64…512).
- Filtering mimics GoldSrc OpenGL defaults: `magFilter = Linear`,
  `minFilter = LinearMipmapNearest`, no anisotropy.
- Texel density on world surfaces is about 1 texel per unit (GoldSrc scale 1.0).
  Each texture declares the world size one repeat covers.

## Models

- **View models** (first-person weapons) live in camera space of the view-model
  camera: +X right, +Y up, −Z forward, units are GoldSrc units, eye at origin.
- **Player models** are children of `world`: Z-up, facing +X, feet at the local
  origin, 72 units tall standing.
- Low poly, flat-ish texturing, no PBR. Lighting is a GoldSrc-style "ambient + shade
  light" supplied per model from the baked light under its feet.
