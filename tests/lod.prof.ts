// Measures quad counts per LOD level over the whole factory map.
import { World, RS, RS_SHIFT } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { meshVolume, downsample, QuadBuffer } from '../src/world/mesher';
import { PAL_TRANSPARENT } from '../src/world/materials';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const op = new QuadBuffer(8192), tr = new QuadBuffer(1024);
const buf = new Uint8Array(40 * 40 * 40), lodBuf = new Uint8Array(18 * 18 * 18);
const totals = [0, 0, 0], ms = [0, 0, 0];
let regions = 0;
// per-region counts to estimate a camera-centred LOD scheme
const per: number[][] = [];
for (let ry = 0; ry < world.nry; ry++) for (let rz = 0; rz < world.nrz; rz++) for (let rx = 0; rx < world.nrx; rx++) {
  const c = [0, 0, 0];
  for (let lod = 0; lod < 3; lod++) {
    const f = 1 << lod;
    const t0 = performance.now();
    const cls = world.gatherRegion(rx, ry, rz, buf, f);
    if (cls !== 1) break;
    op.reset(); tr.reset();
    const n = RS >> lod;
    if (lod === 0) meshVolume(buf, RS, RS, RS, PAL_TRANSPARENT, rx << RS_SHIFT, ry << RS_SHIFT, rz << RS_SHIFT, 0, op, tr);
    else {
      downsample(buf, n, f, PAL_TRANSPARENT, lodBuf);
      meshVolume(lodBuf, n, n, n, PAL_TRANSPARENT, (rx << RS_SHIFT) >> lod, (ry << RS_SHIFT) >> lod, (rz << RS_SHIFT) >> lod, 0, op, tr, lod);
    }
    ms[lod] += performance.now() - t0;
    c[lod] = op.count + tr.count;
    totals[lod] += c[lod];
    if (lod === 0) regions++;
  }
  if (c[0]) per.push([rx, ry, rz, c[0], c[1], c[2]]);
}
console.log(`regions ${regions}`);
for (let l = 0; l < 3; l++) console.log(`LOD${l}: ${(totals[l] / 1e6).toFixed(2)}M quads, mesh ${ms[l].toFixed(0)} ms (${(ms[l] / regions).toFixed(2)} ms/region)`);
for (const [cx, cz, d1, d2] of [[128, 128, 60, 130], [129, 233, 60, 130], [60, 60, 60, 130], [128, 128, 45, 100]]) {
  let all = 0, mixed = 0;
  for (const [rx, ry, rz, a, b, c] of per) {
    const x = (rx + 0.5) * 3.2, y = (ry + 0.5) * 3.2, z = (rz + 0.5) * 3.2;
    const d = Math.hypot(x - cx, y - 6, z - cz);
    all += a;
    mixed += d < d1 ? a : d < d2 ? b : c;
  }
  console.log(`camera (${cx},${cz}) LOD ${d1}/${d2} m: ${(all / 1e6).toFixed(2)}M -> ${(mixed / 1e6).toFixed(2)}M quads`);
}
