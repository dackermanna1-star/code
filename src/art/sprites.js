// Character sprites (HW.art.sprite). Sheets are built procedurally from layered parametric parts
// (sprites_human.js rig + per-character specs) and cached. The Colonel is delegated to colonel.js.
// Sheet format (TECH §12): { fw: 24, fh: 32, ax: 12, ay: 30, anims: { name: { frames, fps, loop } } }.
import { getColonelSprite, initColonel } from './colonel.js';
import { buildTess } from './sprites_tess.js';

const cache = new Map();
const BUILDERS = {
  tess: buildTess,
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
  if (!b) throw new Error(`[sprites] unknown sprite '${id}'`);
  s = b();
  cache.set(id, s);
  return s;
}
