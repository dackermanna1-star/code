// Stress analysis checks on the factory map:
//  1) intact structures never fail (baseline per tile, then analysis of the same tile)
//  2) cutting supports makes structures fail
import { World } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { Stress } from '../src/world/stress';
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
generateFactory(world);
const stress = new Stress(world);
let total = 0, maxMs = 0, sumMs = 0, n = 0;
for (let z = 64; z < 2560; z += 128) for (let x = 64; x < 2560; x += 128) {
  stress.ensureBaseline(x, z);
  const f = stress.analyze(x, z);
  maxMs = Math.max(maxMs, stress.stats.ms); sumMs += stress.stats.ms; n++;
  total += f.length;
  if (f.length) console.log('  tile', x, z, f.map((ff) => `(${ff.x},${ff.y},${ff.z}) d${ff.dir} r${ff.ratio.toFixed(2)}`).join(' '));
}
console.log(`tiles ${n}, avg ${(sumMs / n).toFixed(1)} ms, max ${maxMs.toFixed(1)} ms`);
console.log(`${total === 0 ? 'PASS' : 'FAIL'} intact structures: ${total} failures`);

// demolition: cut ground floor columns of the construction site skeleton (x 790/860, z 1890/1960)
const G = MAP.G;
for (const [cx, cz] of [[790, 1890], [860, 1890], [790, 1960], [860, 1960]]) {
  stress.prepare(cx, cz);
  for (let y = G + 4; y < G + 12; y++) for (let x = cx; x < cx + 4; x++) for (let z = cz; z < cz + 4; z++) world.set(x, y, z, 0);
}
let fails = stress.analyze(((825 >> 7) * 128) + 64, ((1925 >> 7) * 128) + 64);
console.log(`${fails.length > 0 ? 'PASS' : 'FAIL'} construction site after cutting 4 columns: ${fails.length} failures`, fails.slice(0, 3).map((f) => `(${f.x},${f.y},${f.z}) d${f.dir} r${f.ratio.toFixed(2)}`).join(' '));
// main hall: cut 3 adjacent columns on the north side
stress.prepare(1260, 481); stress.prepare(1180, 481); stress.prepare(1340, 481);
for (let y = G + 2; y < G + 12; y++) for (let x = 1170; x < 1352; x++) for (let z = 476; z < 490; z++) world.set(x, y, z, 0);
fails = stress.analyze(((1260 >> 7) * 128) + 64, ((481 >> 7) * 128) + 64);
console.log(`hall after blowing out 18 m of the north wall incl. 3 columns: ${fails.length} failures`, fails.slice(0, 3).map((f) => `(${f.x},${f.y},${f.z}) d${f.dir} r${f.ratio.toFixed(2)}`).join(' '));
