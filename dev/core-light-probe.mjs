import { World } from '../src/world/World.js';
import { generateWorld } from '../src/world/gen/index.js';
const w = new World();
const t0 = performance.now();
await generateWorld(w, 1234567, async () => {});
w.computeHeightmap();
const t1 = performance.now();
await w.computeAllLight();
const t2 = performance.now();
console.log('gen', (t1 - t0).toFixed(0), 'ms  light', (t2 - t1).toFixed(0), 'ms');
// sample spawn points interior light
for (const sp of w.spawnPoints.slice(0, 6)) {
  const sky = w.skyAt(sp.x, sp.y + 1, sp.z), bl = w.blockLightAt(sp.x, sp.y + 1, sp.z);
  console.log('spawn', sp.x, sp.y, sp.z, 'sky', sky, 'block', bl, 'roofY', w.roofY(sp.x, sp.z));
}
// histogram of sky light inside buildings (cells with roof above at y=21)
const hist = new Array(16).fill(0);
for (let i = 0; i < 20000; i++) {
  const x = 100 + Math.floor(Math.random() * 800), z = 100 + Math.floor(Math.random() * 800);
  if (w.roofY(x, z) > 24 && w.get(x, 21, z) === 0 && w.get(x, 22, z) === 0) hist[w.skyAt(x, 21, z)]++;
}
console.log('indoor sky light histogram', hist.join(' '));
