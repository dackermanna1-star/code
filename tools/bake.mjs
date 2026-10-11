// Offline lightmap baker: node tools/bake.mjs [quality]
// Writes public/maps/de_dust2.lm (deflated RGB8, light/2) and de_dust2.lm.json.
import { writeFileSync, mkdirSync } from 'fs';
import { deflateSync } from 'zlib';
import { buildDust2 } from '../src/map/dust2.js';
import { compileMap } from '../src/map/compile.js';
import { allocateLightmaps, bakeLightmaps, encodeLightmap } from '../src/map/lightmap.js';
import { hashMap } from '../src/map/bakeio.js';
import { DUST2_LIGHTING, albedoOf } from '../src/map/lighting.js';

const quality = process.argv[2] || 'high';
const t0 = performance.now();
const m = buildDust2();
const c = compileMap(m.brushes);
const alloc = allocateLightmaps(c.faces);
const lighting = { ...DUST2_LIGHTING, lights: m.lights };
const hash = hashMap(m.brushes, lighting);
const opts = quality === 'high' ? { skySamples: 48, sunSamples: 4 } : { skySamples: 12, sunSamples: 2 };
let lastPct = -1;
const rgb = bakeLightmaps(c.faces, c.world, alloc, { ...lighting, ...opts }, albedoOf, (p) => {
  const pct = Math.floor(p * 20) * 5;
  if (pct !== lastPct) { lastPct = pct; process.stdout.write(`${pct}% `); }
});
const rgba = encodeLightmap(rgb, alloc.width, alloc.height);
const out = new Uint8Array(alloc.width * alloc.height * 3);
for (let i = 0, n = alloc.width * alloc.height; i < n; i++) {
  out[i * 3] = rgba[i * 4]; out[i * 3 + 1] = rgba[i * 4 + 1]; out[i * 3 + 2] = rgba[i * 4 + 2];
}
mkdirSync(new URL('../public/maps/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/maps/de_dust2.lm', import.meta.url), deflateSync(out, { level: 9 }));
writeFileSync(new URL('../public/maps/de_dust2.lm.json', import.meta.url), JSON.stringify({ width: alloc.width, height: alloc.height, hash, quality }));
console.log(`\nbaked ${alloc.width}x${alloc.height} hash ${hash} in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
