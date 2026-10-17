// Character sprites (HW.art.sprite). Sheets are built procedurally from layered parametric parts
// (sprites_human.js rig + per-character specs) and cached. The Colonel is delegated to colonel.js.
// Sheet format (TECH §12): { fw: 24, fh: 32, ax: 12, ay: 30, anims: { name: { frames, fps, loop } } }.
import { getColonelSprite, initColonel } from './colonel.js';
import { buildTess } from './sprites_tess.js';
import { buildKevin, buildAdair, buildDenise, buildFigure79 } from './sprites_ghosts.js';
import { buildHusk, buildBreakerBoy } from './sprites_husks.js';
import { buildDanny, buildLeah, buildMarcus, buildDannyE, buildLeahE, buildMarcusE } from './sprites_friends.js';

const cache = new Map();
const BUILDERS = {
  tess: buildTess,
  danny: buildDanny,
  leah: buildLeah,
  marcus: buildMarcus,
  danny_e: buildDannyE,
  leah_e: buildLeahE,
  marcus_e: buildMarcusE,
  denise: buildDenise,
  kevin: buildKevin,
  adair: buildAdair,
  figure79: buildFigure79,
  husk_a: buildHusk('a'),
  husk_b: buildHusk('b'),
  husk_c: buildHusk('c'),
  husk_d: buildHusk('d'),
  breakerboy: buildBreakerBoy,
};

export async function initSprites() {
  await initColonel();
  for (const id of Object.keys(BUILDERS)) getSprite(id);
}

export function getSprite(id) {
  if (id === 'colonel') return getColonelSprite();
  let s = cache.get(id);
  if (s) return s;
  const b = BUILDERS[id];
  if (!b) {
    // unknown ids get the faceless 1979 silhouette rather than breaking the entity
    console.warn(`[sprites] unknown sprite '${id}' — using figure79`);
    s = getSprite('figure79');
    cache.set(id, s);
    return s;
  }
  s = b();
  cache.set(id, s);
  return s;
}
