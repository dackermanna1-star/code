// Find zones of a type near the origin (runs world generation in Node, no browser needed).
//   node tools/zones.mjs <type> [level] [dim] [--force]
// --force makes every eligible zone that type (same as the ?force= URL parameter).
import { generateTextures } from '../src/gfx/textures.js';
import { resolveMaterials } from '../src/world/materials.js';
import { setPropTextures } from '../src/world/props.js';
import { World } from '../src/world/world.js';
import '../src/world/gen/index.js';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const type = args[0], level = Number(args[1] || 0), dim = Number(args[2] || 0);
const { index } = generateTextures();
resolveMaterials(index); setPropTextures(index);
const w = new World(0x5eed0001, index, null);
if (process.argv.includes('--force')) w.zones.forceType = type;
const found = new Map();
for (let r = 0; r < 2000 && found.size < 6; r += 8) {
  for (let a = 0; a < 64; a++) {
    const x = Math.round(Math.cos((a / 64) * Math.PI * 2) * r), z = Math.round(Math.sin((a / 64) * Math.PI * 2) * r);
    const zn = w.zoneAt(dim, level, x, z);
    if (zn.type === type && !found.has(zn.key)) found.set(zn.key, zn);
  }
}
for (const z of found.values()) {
  const t0 = performance.now();
  w.builder(z);
  console.log(z.key, z.type, z.params.variant || z.params.layout || '', 'rect', z.x0, z.z0, z.x1, z.z1, 'centre', (z.x0 + z.x1) / 2, (z.z0 + z.z1) / 2, 'gen', (performance.now() - t0).toFixed(1) + 'ms');
}
const counts = {};
for (let x = -800; x < 800; x += 16) for (let z = -800; z < 800; z += 16) { const t = w.zoneAt(dim, level, x, z).type; counts[t] = (counts[t] || 0) + 1; }
console.log('type frequency within 800m (level ' + level + '):', counts);
