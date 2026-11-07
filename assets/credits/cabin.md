# Cabin module — asset credits

All external textures are **CC0 1.0** (public domain) from [ambientCG](https://ambientcg.com) (1K JPG sets),
resized/recompressed (and partly recoloured / combined with procedural patterns) by `src/aircraft/cabin/tools/make_textures.py` (run: `python3 make_textures.py <extracted-downloads-dir> assets/textures`).

| Folder | Source | License | Use |
|---|---|---|---|
| `assets/textures/cabin-carpet/` | ambientCG **Carpet012** — https://ambientcg.com/get?file=Carpet012_1K-JPG.zip | CC0 | fibre colour/normal/roughness/AO; the Halcyon airline pattern (navy/teal diamonds, gold flecks) is procedurally composited on top |
| `assets/textures/cabin-fabric/` | ambientCG **Fabric030** — https://ambientcg.com/get?file=Fabric030_1K-JPG.zip | CC0 | class-divider curtain (recoloured navy), bin interior felt normal |
| `assets/textures/cabin-plastic/` | ambientCG **Plastic010** roughness — https://ambientcg.com/get?file=Plastic010_1K-JPG.zip | CC0 | wipe/smudge roughness variation; stipple normal + colour mottling are procedural (FFT noise) |
| `assets/textures/cabin-metal/` | ambientCG **Metal032** — https://ambientcg.com/get?file=Metal032_1K-JPG.zip | CC0 | aluminium trims, thresholds, curtain track |
| `assets/textures/cabin-vinyl/` | procedural (numpy) | self-generated, CC0 | galley / door-area non-slip vinyl floor |

Everything else (sidewall seams & scuffs, dado louvres, PSU faces, passenger signs, EXIT signs, placards,
airline logo panel, window shade, acrylic scratches, floor AO) is drawn procedurally on canvases at runtime
(`src/aircraft/cabin/textures.js`).
