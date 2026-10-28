import { makePart, box, hit, strikeEnergy, dropEnergy, v, bond, applyOutcome } from "./damage-helpers.ts";
import { dentDepthAt } from "../../src/destruction/model/util.ts";
import { globalFailureEnergy } from "../../src/destruction/model/damage.ts";
// 1 dent cap
{
  const panel = makePart("steelSheet", box(0.5, 0.0008, 0.35));
  const E = dropEnergy(15, 5, "steelSheet", "concrete");
  const P = v(0.1, 0.0004, 0.05);
  let crumples = 0;
  for (let k = 0; k < 40; k++) { const o = hit(panel, P, v(0, -1, 0), E, { strike: false, islandMass: 15, seed: k }); if (o.crumpled) crumples++; applyOutcome(panel, o);
    if ([0,4,19,39].includes(k)) { let mx = 0; for (let x=-0.25;x<=0.25;x+=0.01) for (let z=-0.175;z<=0.175;z+=0.01) mx=Math.max(mx,dentDepthAt(panel.dents,v(x,0,z))); console.log("dent", k+1, "E", E.toFixed(1), dentDepthAt(panel.dents, P).toFixed(4), "max", mx.toFixed(4), "dents", panel.dents.length, "crumpled events", crumples); } }
}
// 2 fatigue
for (const [name, mk, P, D, e] of [
  ["window", () => makePart("glass", box(1, 1.2, 0.004)), v(0.1,0.1,0.002), v(0,0,-1), 0.5],
  ["window1J", () => makePart("glass", box(1, 1.2, 0.004)), v(0.1,0.1,0.002), v(0,0,-1), 1],
  ["plate", () => makePart("ceramic", box(0.25, 0.25, 0.006)), v(0.02,0.02,0.003), v(0,0,-1), 0.3],
  ["drywall", () => makePart("gypsum", box(1.2, 2.4, 0.0125), {supported:true}), v(0.1,0.2,0.00625), v(0,0,-1), 2],
] as const) {
  const p = (mk as any)(); let broke = -1; let del = 0;
  for (let k = 0; k < 500; k++) { const o = hit(p, P as any, D as any, e as number, { strike: false, seed: k }); del += e as number; applyOutcome(p, o); if (o.fracture) { broke = k; break; } }
  console.log("fatigue", name, "broke at", broke, "remembered", p.dmg.reduce((s,d)=>s+d.e,0).toFixed(1), "delivered", del.toFixed(1));
}
// 3 edge hits
{
  const top = makePart("softwood", box(1.2, 0.025, 0.7), { grain: v(1, 0, 0), id: 11 });
  const o = hit(top, v(0.6, 0, 0.1), v(-1, 0, 0), 108.7, { contact: 0.015, seed: 1 });
  console.log("table edge", o.fracture?.global, o.fracture?.radius, o.fracture?.cells.map(c=>c.role[0]).join(""));
  const door = makePart("mdf", box(0.8, 2.0, 0.04), { mass: 12, id: 5, bonds:[bond(1,"hinge",v(-0.4,0.7,0),300,true), bond(2,"hinge",v(-0.4,-0.7,0),300,true)] });
  console.log("door Eg", globalFailureEnergy(door));
  const d = hit(door, v(0.4, 0, 0), v(-1, 0, 0), 201, { contact: 0.05, seed: 1 });
  console.log("door edge", d.fracture?.global, d.fracture?.radius, d.fracture?.cells.map(c=>c.role[0]).join(""));
  const dw = makePart("gypsum", box(1.2, 2.4, 0.0125), {supported:true});
  const w = hit(dw, v(0.6, 0, 0), v(-1, 0, 0), 60, { contact: 0.04, seed: 1 });
  console.log("drywall edge", w.fracture?.global, w.fracture?.radius);
}
// 4 dice
{
  const panel = makePart("temperedGlass", box(0.9, 1.9, 0.008), { id: 11 });
  const e3 = strikeEnergy(300, 6, "steel", "temperedGlass").E;
  for (const s of [1,2,3]) {
  const t0 = performance.now();
  const o = hit(panel, v(0, 0, 0.004), v(0, 0, -1), e3, { contact: 0.03, seed: s });
  const dt = performance.now() - t0;
  const big = o.fracture!.cells.filter(c => c.role !== "micro").map(c => c.role[0] + Math.round(c.maxExtent*100));
  console.log("dice", dt.toFixed(1), "ms cells", o.fracture!.cells.length, big.join(" "));
  }
}
// 6 tear
{
  const panel = makePart("steelSheet", box(0.5, 0.0008, 0.35));
  const E = dropEnergy(15, 5, "steelSheet", "concrete");
  for (let k = 0; k < 6; k++) applyOutcome(panel, hit(panel, v(0.1, 0.0004, 0.05), v(0,-1,0), E, {strike:false, seed:k}));
  const ea = strikeEnergy(120, 1.8, "steel", "steelSheet").E, es = strikeEnergy(300, 6, "steel", "steelSheet").E;
  console.log("axe E", ea.toFixed(0), "sledge E", es.toFixed(0));
  let tore = -1;
  for (let k = 0; k < 12; k++) { const o = hit(panel, v(0.05, 0.0004, 0), v(0,-1,0), k%2? es: ea, {contact: k%2?0.03:0.012, sharp: k%2?1:2.2, seed: 50+k}); applyOutcome(panel, o); if (o.fracture) { tore = k; console.log("tear pieces", o.fracture.cells.length); break; } }
  console.log("tear at", tore);
}
