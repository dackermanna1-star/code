// Diagnostic: fracture cascade after sledge strikes into a stud partition.
import { Vector3 } from "@babylonjs/core";
import { makeSim, round } from "./destruction-util.ts";
import { buildStructure } from "../../src/world/structure.ts";

export async function probe() {
  const sim = await makeSim();
  const { d } = sim;
  const pieces = buildStructure();
  const slab = pieces.find((p) => p.def.type.toLowerCase().includes("slab") && /floor/i.test(p.def.name)) ?? pieces[0];
  const parts = pieces.filter((p) => p.def.type.toLowerCase().includes("partition")).sort((a, b) => b.def.parts.length - a.def.parts.length);
  const wallPiece = parts.find((p) => p.def.parts.length <= 260) ?? parts[parts.length - 1];
  d.spawn(slab.def, slab.xf);
  const wallId = d.spawn(wallPiece.def, wallPiece.xf);
  const wall = d.assembly(wallId)!;
  let inStrike = false;
  const enq: any[] = [];
  const F = d.fracture as any;
  const origEnq = F.enqueue.bind(F);
  F.enqueue = (part: any, plan: any, energy: number, pos: any, dir: any) => {
    const roles: Record<string, number> = {};
    for (const c of plan.cells) roles[c.role] = (roles[c.role] ?? 0) + 1;
    enq.push({ t: round(sim.time.simTime, 100), strike: inStrike, gen: part.gen, mat: part.matId, ext: round(part.ext[0], 1000), mass: round(part.mass, 1000), E: round(energy, 100), static: part.island?.isStatic, layer: part.island?.layer, islMass: round(part.island?.mass ?? 0, 100), global: plan.global, roles });
    return origEnq(part, plan, energy, pos, dir);
  };
  sim.step(10);
  const gyp = () => [...wall.parts].filter((p) => p.alive && p.island && p.island.isStatic && p.matId === "gypsum" && p.volume > 0.004);
  const perStrike: any[] = [];
  for (let k = 0; k < 6; k++) {
    const cands = gyp();
    if (!cands.length) break;
    const p = cands[(k * 7919) % cands.length];
    const isl = p.island!;
    const b = p.bounds;
    const ex = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const thin = ex[0] <= ex[1] && ex[0] <= ex[2] ? 0 : ex[1] <= ex[2] ? 1 : 2;
    const c = { ...p.centroid };
    const dirL = { x: 0, y: 0, z: 0 };
    const wc = isl.com;
    const sgn = (thin === 0 ? c.x - wc.x : thin === 1 ? c.y - wc.y : c.z - wc.z) >= 0 ? 1 : -1;
    if (thin === 0) { c.x = sgn > 0 ? b.max.x : b.min.x; dirL.x = -sgn; } else if (thin === 1) { c.y = sgn > 0 ? b.max.y : b.min.y; dirL.y = -sgn; } else { c.z = sgn > 0 ? b.max.z : b.min.z; dirL.z = -sgn; }
    const wp = d.world.toWorldVec(isl, c);
    const wd = d.world.dirToWorldVec(isl, dirL);
    const n0 = enq.length;
    inStrike = true;
    d.strike({ point: new Vector3(wp.x, wp.y, wp.z), dir: new Vector3(wd.x, wd.y, wd.z), body: isl.body!, childIndex: -1, mass: 6, speed: 8, sharpness: 1, contactRadius: 0.03, strikerMat: "steel", source: "debug" });
    inStrike = false;
    sim.step(60);
    const st = d.stats();
    perStrike.push({ k, enq: enq.length - n0, islands: st.islands, parts: st.parts, fractures: st.fractures, queue: d.fracture.pending });
  }
  const genHist: Record<number, number> = {};
  for (const p of wall.parts) genHist[p.gen] = (genHist[p.gen] ?? 0) + 1;
  const passive = enq.filter((e) => !e.strike);
  const byGen: Record<string, number> = {};
  for (const e of passive) byGen[`${e.mat}/g${e.gen}`] = (byGen[`${e.mat}/g${e.gen}`] ?? 0) + 1;
  return { perStrike, genHist, passiveByGen: byGen, firstPassive: passive.slice(0, 40), strikeEnq: enq.filter((e) => e.strike).slice(0, 10), extHist: hist([...wall.parts].map((p) => p.ext[0])) };
}

function hist(xs: number[]) {
  const h: Record<string, number> = {};
  for (const x of xs) {
    const k = x < 0.02 ? "<2cm" : x < 0.05 ? "<5cm" : x < 0.1 ? "<10cm" : x < 0.3 ? "<30cm" : ">=30cm";
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
}
