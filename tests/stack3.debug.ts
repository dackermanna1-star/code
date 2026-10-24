import { World } from '../src/world/world';
import { Physics, SOLVER } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
SOLVER.iterations = 30;
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const bs: Body[] = [];
for (let i = 0; i < 6; i++) {
  const b = new Body(8, 5, 8, new Uint8Array(320).fill(P.crate)); b.computeMass(); b.buildSamples();
  b.pos.set(20, 4.25 + i * 0.5 + 0.001, 20); ph.add(b); bs.push(b);
}
for (let s = 0; s < 40; s++) {
  ph.step(1 / 60);
  const cs = (ph as any).cs, f = cs.f;
  let maxD = 0, info = '';
  for (let i = 0; i < cs.n; i++) {
    const o = i * 32;
    if (f[o + 27] > maxD) { maxD = f[o + 27]; info = `${cs.a[i]}-${cs.b[i]} n=(${f[o+3].toFixed(2)},${f[o+4].toFixed(2)},${f[o+5].toFixed(2)}) bias=${f[o+21].toFixed(3)} ln=${f[o+22].toFixed(2)} vn0=${f[o+26].toFixed(3)}`; }
  }
  console.log(s, cs.n, 'maxDepth', maxD.toFixed(4), info, 'ang', bs.map((b) => b.ang.len().toFixed(2)).join(' '));
}
