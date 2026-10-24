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
for (let s = 0; s < 8; s++) {
  ph.step(1 / 60);
  const cs = (ph as any).cs, f = cs.f;
  const lines: string[] = [];
  for (let i = 0; i < cs.n; i++) {
    const o = i * 32;
    if (Math.abs(f[o + 4]) < 0.99) lines.push(`  ODD ${cs.a[i]}-${cs.b[i]} p=(${f[o].toFixed(3)},${f[o+1].toFixed(3)},${f[o+2].toFixed(3)}) n=(${f[o+3].toFixed(2)},${f[o+4].toFixed(2)},${f[o+5].toFixed(2)}) d=${f[o+27].toFixed(4)} ln=${f[o+22].toFixed(1)}`);
  }
  const per: Record<string, number> = {};
  for (let i = 0; i < cs.n; i++) { const k = `${cs.a[i]}-${cs.b[i]}`; per[k] = (per[k] || 0) + 1; }
  console.log(s, JSON.stringify(per), 'ang', bs.map((b) => b.ang.len().toFixed(3)).join(' '));
  for (const l of lines.slice(0, 6)) console.log(l);
}
