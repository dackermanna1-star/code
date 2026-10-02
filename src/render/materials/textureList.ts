/**
 * The list of block texture layers. The layer index of a texture is its index in
 * TEXTURE_NAMES (sorted, deterministic). Computed from the block registry so it can
 * never get out of sync; EXTRA_TEXTURES adds layers used by special renderers.
 *
 * Worker-safe.
 */
import { BLOCKS, facesFor } from '../../world/blocks/registry';
import '../../world/blocks/blocks';

/** Layers referenced by renderers rather than block faces. */
export const EXTRA_TEXTURES = [
  'water_flow',      // flowing water surface detail (normal/foam), tiles in flow direction
  'lava_flow',
  'grass_tuft',      // cutout card of dense grass blades used for Better-Foliage-style tufts on grass blocks
  'leaves_fluff_oak',// cutout leaf-cluster cards used around leaf blocks (generic broadleaf, tinted)
  'leaves_fluff_needle', // spruce-like needle cluster card (tinted)
  'snow_side_overlay', // snow fringe overlay for snowy grass sides
  'grass_block_snow',  // side of a grass block with snow on top
  'missing',
] as const;

const SKIP = new Set(['air', 'moving_piston']);

function compute(): string[] {
  const set = new Set<string>();
  for (const b of BLOCKS) {
    if (b.shape === 'air') continue;
    for (let m = 0; m < 16; m++) {
      const f = facesFor(b, m);
      set.add(f.up); set.add(f.down); set.add(f.north); set.add(f.south); set.add(f.west); set.add(f.east);
    }
  }
  for (const e of EXTRA_TEXTURES) set.add(e);
  for (const s of SKIP) set.delete(s);
  return [...set].sort();
}

export const TEXTURE_NAMES: readonly string[] = compute();
export const TEXTURE_INDEX: ReadonlyMap<string, number> = new Map(TEXTURE_NAMES.map((n, i) => [n, i]));
const MISSING = TEXTURE_INDEX.get('missing')!;

export function textureLayer(name: string): number {
  const i = TEXTURE_INDEX.get(name);
  return i === undefined ? MISSING : i;
}
