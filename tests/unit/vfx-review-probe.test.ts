import { test } from "node:test";
import assert from "node:assert";
import { MicroSim } from "../../src/vfx/microSim.ts";

const sp = (x:number,y:number,z:number,vx=0,vy=0,vz=0,size=0.02,kind=1) => ({ kind, x, y, z, vx, vy, vz, size, r:1,g:1,b:1,a:1,s0:0,s1:0,s2:0,s3:0 });

test("perf 5000 moving", () => {
  const sim = new MicroSim({ capacity: 6000, groundProbe: (x,y,z) => (Math.abs(x)<0.5&&Math.abs(z)<0.5&&y>0.75?0.75:0) });
  let s = 1;
  const r = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  for (let i=0;i<5000;i++) sim.spawn(sp(r()*4-2, 1+r()*1.5, r()*4-2, r()*4-2, r()*3, r()*4-2, 0.005+r()*0.03, (r()*10)|0));
  const ts:number[] = [];
  for (let k=0;k<200;k++){ const t0=performance.now(); sim.step(1/60); ts.push(performance.now()-t0); }
  ts.sort((a,b)=>a-b);
  console.log("moving at end", sim.movingCount, "med", ts[100].toFixed(3), "p90", ts[180].toFixed(3), "max", ts[199].toFixed(3), "first", ts.slice(0,3));
  assert.equal(sim.checkInvariants(), null);
});

test("table edge: piece flying off a table with probe queue saturated", () => {
  // ground 0.75 within |x|<0.5, floor elsewhere
  const sim = new MicroSim({ capacity: 6000, groundProbe: (x,y,z) => (Math.abs(x)<0.5&&Math.abs(z)<0.5&&y>0.75?0.75:0) });
  for (let i=0;i<3000;i++) sim.spawn(sp(-0.3 + (i%10)*0.01, 0.8, 0, 3, 0.5, 0, 0.01, 2));
  let hovering = 0, maxHover = 0;
  for (let k=0;k<240;k++){ sim.step(1/60);
    let h=0; for (let i=0;i<3000;i++){ const d=sim.debugSlot(i); if (d.alive && Math.abs(d.x)>0.6 && d.y>0.7 && d.state!==0) h++; }
    maxHover=Math.max(maxHover,h); if (k===60) hovering=h; }
  console.log("hovering after 1s", hovering, "max", maxHover);
});

test("paper flake fall time", () => {
  const sim = new MicroSim({ capacity: 10, groundProbe: () => 0 });
  const i = sim.spawn(sp(0, 2.4, 0, 0, 0, 0, 0.02, 8));
  let t=0; while (sim.debugSlot(i).state===0 && t<20){ sim.step(1/60); t+=1/60; }
  console.log("paper fall 2.4m: ", t.toFixed(2), "s alive", sim.debugSlot(i).alive);
  const j = sim.spawn(sp(0, 2.4, 0, 0, 0, 0, 0.008, 7));
  t=0; while (sim.debugSlot(j).state===0 && t<20){ sim.step(1/60); t+=1/60; }
  console.log("foam fall 2.4m: ", t.toFixed(2), "s");
});
