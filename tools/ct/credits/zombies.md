# Zombie sprites (tools/ct/render_zombies.py)

Lumps: ZCV1, ZCV2, ZCV3, ZCV4, ZRUN, ZKID, frames A-D walk, E-F attack, G pain (rotations 1-8), H-L death (rotation 0).
All sprites are original renders made by `tools/ct/render_zombies.py` in Blender (bpy, Cycles) from the CC0
models and animations below; clothing, skin, blood, hats and skirt are generated procedurally by the script.

| asset | author | licence | source | used for |
|---|---|---|---|---|
| Universal Base Characters (Standard): Superhero_Male_FullBody, Superhero_Female_FullBody, Hair_Buzzed, Hair_SimpleParted, Hair_Buns | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-base-characters | body meshes, eyes, eyebrows, hair |
| Universal Animation Library (Standard), UAL1_Standard.glb: Sprint_Loop, Jog_Fwd_Loop, Death01 | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-animation-library | runner/kid run cycles, deaths |
| Universal Animation Library 2 (Standard), UAL2_Standard.glb: Zombie_Walk_Fwd_Loop, Zombie_Scratch, Hit_Knockback | Quaternius | CC0 1.0 | https://quaternius.itch.io/universal-animation-library-2 | shambler walk, attacks, pain base pose, runner death |
| DOOM palette (PLAYPAL of the shareware doom1.wad) | id Software | read at build time only, not redistributed by this script | assets/wads/doom1.wad | colour quantization; POSS frames only appear in the local preview line-up |

The three Quaternius packs are fetched through itch.io's free-download flow into `build/ct/cache/` when
missing (the licence text ships inside each zip as License.txt / License_Standard.txt).

- `ZCV1`: construction worker: tan work shirt, orange hi-vis vest, jeans, boots, yellow hard hat.
- `ZCV2`: chef: white double-breasted jacket, apron, dark trousers, toque.
- `ZCV3`: office worker: white shirt, dark navy tie, charcoal trousers, black shoes.
- `ZCV4`: woman in a red qipao with gold trim, hair in buns, black flats.
- `ZRUN`: runner: lean, bald, ashen grey skin, torn blood-soaked mustard tank top, ragged cut-off jeans, barefoot.
- `ZKID`: kid: red T-shirt with a white band, navy shorts, white sneakers.
