// Texture packs: registered into TEXTURES / the generators by textures.js at load, so a map
// adds textures without touching textures.js. One import per pack; each map's builder owns
// its pack module (src/assets/tex/<pack>.js) and nothing else here. Texture names are global:
// a map pack prefixes its own (fe_, hc_, s9_, bw_); a clash throws at load.
//
// A pack: export const PACK = { name, textures: { <name>: { size: [w, h], world: [u, v], gen, ...meta } } }
//   gen() -> img (tex/core.js makeImg: r/g/b 0..255 float channels, a 0..1 when meta.alpha),
//   DOM-free and deterministic (seeded); meta as in textures.js plus blend / albedo (shared.js).
import { PACK as shared } from './shared.js';
import { PACK as fortember } from './fortember.js';
import { PACK as hollowcreek } from './hollowcreek.js';
import { PACK as sector9 } from './sector9.js';
import { PACK as blackwater } from './blackwater.js';

export const TEXTURE_PACKS = [shared, fortember, hollowcreek, sector9, blackwater];
