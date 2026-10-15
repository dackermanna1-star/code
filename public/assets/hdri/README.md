# HDRIs and sky background

These are outdoor Radiance `.hdr` equirect maps from Poly Haven, all **CC0**. They light the scene (IBL) and drive
reflections. All were shot over green European-style fields, so the lower hemisphere bounces green and brown light
that matches the map. `manifest.json` lists each file with its source URL, size, mean sky and ground luminance, and
the **sun direction**.

| file | Poly Haven source | condition | sun elevation | sun dir (three.js world) |
|---|---|---|---|---|
| `clear_midday_1k.hdr` | dreifaltigkeitsberg | clear, high sun, field (DE) | 42.6° | [0.596, 0.676, 0.433] |
| `partly_cloudy_1k.hdr`, `partly_cloudy_2k.hdr` | horn-koppe_spring | scattered cumulus, green meadow | 61.0° | [0.392, 0.875, 0.285] |
| `overcast_1k.hdr` | farmland_overcast | full overcast, soft light (no sun disc) | – | – |
| `golden_hour_1k.hdr` | spaichingen_hill | low warm late-afternoon sun | 12.9° | [0.788, 0.224, 0.574] |
| `sunset_1k.hdr` | industrial_sunset_02 | sun on the horizon, crop field | 3.3° | [0.808, 0.058, 0.587] |
| `sky_partly_cloudy_4k.jpg` | kloofendal_48d_partly_cloudy_puresky (Poly Haven tonemapped JPG) | LDR sRGB background sky dome, no ground (mirrored haze below the horizon) | – | – |

`tools/assets/textures/hdr_info.py` measures the sun direction as the luminance-weighted centroid of the brightest
0.02 % of pixels. The direction assumes three.js `EquirectangularReflectionMapping` with no rotation (`HDRLoader` sets
`flipY = true`). If you rotate the environment (`scene.environmentRotation` / `backgroundRotation`), rotate the
`DirectionalLight` by the same amount. Otherwise the shadows will disagree with the reflections.

```ts
const hdr = await new HDRLoader().loadAsync('assets/hdri/partly_cloudy_1k.hdr');
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(hdr).texture;
sun.position.copy(target).addScaledVector(new THREE.Vector3(0.392, 0.875, 0.285), 500);
```

Notes:
* At 1k the sun disc covers only a few pixels, with peaks of 6–12 × 10⁴ luminance. PMREM blurs it unevenly, so keep an
  explicit `DirectionalLight` for the sun and use the HDRI for ambient light and reflections. Typical `scene.environmentIntensity` is 0.6–1.0 with
  ACES tone mapping.
* `partly_cloudy_2k.hdr` (5.8 MB) is the sharper one for mirror-like reflections on water and glass. The 1k files are
  enough for rough materials.
* The 1k HDRs are too blurry to use as a visible sky (`scene.background`). Use `sky_partly_cloudy_4k.jpg` with
  `colorSpace = SRGBColorSpace` and equirect mapping, or the project's procedural sky. In this jpg the sun sits behind
  cloud at about u 0.60, 48° up, so align the sun light if both are used together.
* Rebuild with `tools/assets/textures/build_all.sh <scratch>`. The selection lives in `tools/assets/textures/sets.py`
  (`HDRIS`, `SKY_BACKGROUNDS`).
