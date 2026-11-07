# Galley module — asset credits

External source textures are **CC0 1.0** (public domain) from [ambientCG](https://ambientcg.com) (1K JPG sets),
combined with procedural (numpy) brushing / stipple and recompressed by
`src/aircraft/galley/tools/make_textures.py` (run: `python3 -I make_textures.py <extracted-downloads-dir> assets/textures`).

| Folder | Source | License | Use |
|---|---|---|---|
| `assets/textures/galley-steel/` | ambientCG **Metal012** roughness (smudges) — https://ambientcg.com/get?file=Metal012_1K-JPG.zip ; brushing, scratches, colour and normal are procedural | CC0 | brushed stainless: galley inserts, work decks, carts, sinks, thresholds |
| `assets/textures/galley-laminate/` | ambientCG **Plastic013A** colour + roughness — https://ambientcg.com/get?file=Plastic013A_1K-JPG.zip ; stipple normal procedural | CC0 | textured laminate of galley monuments, lavatory walls, door linings, closet |

Everything else is generated at runtime (`src/aircraft/galley/textures.js`, self-made, CC0):
placard atlas (lavatory / galley / door / flight-deck / crew placards, cart branding of the fictional
Halcyon Airways, magazine covers, keypad face, circuit-breaker panel), glow atlas (lit signs, LEDs,
oven timers, diffusers), fabric weave normal map and the forward attendant panel touchscreen.
