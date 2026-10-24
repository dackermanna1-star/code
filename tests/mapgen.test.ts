import { World, CK } from '../src/world/world';
import { generateFactory, MAP } from '../src/map/factory';
import { makeProp } from '../src/map/props';
import { Rng } from '../src/engine/math';
const t0 = performance.now();
const world = new World(MAP.sx, MAP.sy, MAP.sz, MAP.G);
let lastD = 0, lastS = 0;
const r = generateFactory(world, (name) => {
  let d = 0, so = 0;
  for (let i = 0; i < world.nchunks; i++) if (world.kind[i] === CK.Dense) { d++; so += world.count[i]; }
  console.log(name.padEnd(22), 'chunks', String(d - lastD).padStart(6), 'voxels', ((so - lastS) / 1e6).toFixed(2) + 'M');
  lastD = d; lastS = so;
});
const t1 = performance.now();
let dense = 0, solid = 0;
for (let i = 0; i < world.nchunks; i++) if (world.kind[i] === CK.Dense) { dense++; solid += world.count[i]; }
let propVox = 0;
const rng = new Rng(1);
const t2 = performance.now();
for (const p of r.props) { const g = makeProp(p.kind, rng).rotY(p.rot); for (const v of g.vox) if (v) propVox++; }
const t3 = performance.now();
console.log(`gen ${(t1 - t0).toFixed(0)} ms, dense chunks ${dense} (${(dense * 4096 / 1048576).toFixed(1)} MB), solid voxels in dense chunks ${(solid / 1e6).toFixed(2)}M`);
console.log(`props ${r.props.length} (${(propVox / 1e6).toFixed(2)}M voxels, models ${(t3 - t2).toFixed(0)} ms), lamps ${r.lamps.length}, spawn ${JSON.stringify(r.spawn)}`);
const kinds: Record<string, number> = {};
for (const p of r.props) kinds[p.kind] = (kinds[p.kind] || 0) + 1;
console.log(JSON.stringify(kinds));
