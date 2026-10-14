// Animated wall textures and flats (P_InitPicAnims and the animation part of
// P_UpdateSpecials). Frames are shown by aliasing atlas image ids, the
// equivalent of texturetranslation[] / flattranslation[].

import { ANIMDEFS } from '../data.js';
import { CT_ANIMDEFS } from '../ct/info.js';

export function initPicAnims(res) {
  const anims = [];
  for (const def of [...ANIMDEFS, ...CT_ANIMDEFS]) {
    const byName = def.istexture ? res.textureByName : res.flatByName;
    const start = byName.get(def.startname);
    const end = byName.get(def.endname);
    // Different episode / game: skip.
    if (!start || !end) continue;
    const numpics = end.index - start.index + 1;
    if (numpics < 2) continue;
    anims.push({
      istexture: def.istexture, picnum: end.index, basepic: start.index, numpics, speed: def.speed,
    });
  }
  return anims;
}

// Point every frame of the cycle at the picture it shows at `leveltime`.
// Like vanilla the phase uses the absolute picture number.
export function applyAnim(res, anim, leveltime) {
  const pics = anim.istexture ? res.textures : res.flats;
  const step = Math.floor(leveltime / anim.speed);
  for (let i = anim.basepic; i < anim.basepic + anim.numpics; i++) {
    const pic = anim.basepic + ((step + i) % anim.numpics);
    res.atlas.alias(pics[i].id, pics[pic].id);
  }
}

// Frames only change when leveltime crosses a multiple of the speed.
export function updateAnims(res, anims, leveltime) {
  for (const anim of anims) {
    if (leveltime % anim.speed === 0) applyAnim(res, anim, leveltime);
  }
}
