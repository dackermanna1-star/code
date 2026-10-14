// Material type of a brush face (GoldSrc materials.txt equivalent): drives
// footstep sounds, bullet impact effects and penetration.
import { TEXTURES } from '../assets/textures.js';

const TEXTURE_MATERIAL = {
  ground_sand: 'sand', ground_dirt: 'dirt', ground_stone: 'concrete',
  wall_stone: 'concrete', wall_stone_big: 'concrete', wall_tunnel: 'concrete', wall_plaster: 'concrete',
  trim_band: 'concrete', trim_cap: 'concrete', rock: 'concrete',
  crate: 'wood', crate_b: 'wood', door: 'wood', shutter: 'wood', wood_beam: 'wood', wood_planks: 'wood',
  crate_green: 'metal', metal: 'metal',
};

export function surfaceOfBrush(brush, normal) {
  if (!brush || !Array.isArray(brush.planes)) return brush?.surface || 'concrete';
  if (brush.surface) return brush.surface;
  let best = null, bd = -Infinity;
  for (const p of brush.planes) {
    const d = p.n[0] * normal[0] + p.n[1] * normal[1] + p.n[2] * normal[2];
    if (d > bd) { bd = d; best = p; }
  }
  const t = best?.tex;
  const name = typeof t === 'string' ? t : t?.name;
  return TEXTURE_MATERIAL[name] || TEXTURES[name]?.surface || 'concrete'; // (a texture pack's own: src/assets/tex/*)
}
