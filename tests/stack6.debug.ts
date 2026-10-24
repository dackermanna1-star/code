import { World } from '../src/world/world';
import { Physics, SOLVER } from '../src/physics/physics';
import { Body } from '../src/physics/body';
import { P } from '../src/world/materials';
SOLVER.iterations = 30;
const w = new World(512, 256, 512, 40); w.initTerrain();
const ph = new Physics(w);
const bs: Body[] = [];
for (let i = 0; i < 4; i++) {
  const b = new Body(8, 5, 8, new Uint8Array(320).fill(P.crate)); b.computeMass(); b.buildSamples(); b.friction = 0;
  b.pos.set(20, 4.25 + i * 0.5 + 0.001, 20); ph.add(b); bs.push(b);
}
for (let s = 0; s < 6; s++) {
  ph.step(1 / 60);
  const cs = (ph as any).cs, f = cs.f;
  console.log('step', s, 'ang', bs.map((b) => `(${b.ang.x.toFixed(3)},${b.ang.y.toFixed(3)},${b.ang.z.toFixed(3)})`).join(' '));
  for (let i = 0; i < cs.n; i++) {
    const o = i * 32;
    console.log(`   ${cs.a[i]}-${cs.b[i]} p=(${(f[o]-20).toFixed(3)},${f[o+1].toFixed(3)},${(f[o+2]-20).toFixed(3)}) n=(${f[o+3].toFixed(2)},${f[o+4].toFixed(2)},${f[o+5].toFixed(2)}) d=${f[o+27].toFixed(4)} ln=${f[o+22].toFixed(2)} bias=${f[o+21].toFixed(3)}`);
  }
}
