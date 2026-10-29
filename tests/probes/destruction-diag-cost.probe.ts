// Diagnostic micro-benchmarks of the engine operations a break costs (hull vs box shapes,
// container edits on a big static island, body creation, mesh builds).
import { Vector3 } from "@babylonjs/core";
import { makeSim, round } from "./destruction-util.ts";
import { buildStructure } from "../../src/world/structure.ts";
import { polyPoints, polyExtents } from "../../src/geom/poly.ts";

export async function probe() {
  const sim = await makeSim();
  const { d, physics } = sim;
  const pieces = buildStructure();
  const parts = pieces.filter((p) => p.def.type.toLowerCase().includes("partition")).sort((a, b) => b.def.parts.length - a.def.parts.length);
  const wallPiece = parts.find((p) => p.def.parts.length <= 260) ?? parts[parts.length - 1];
  const wallId = d.spawn(wallPiece.def, wallPiece.xf);
  const wall = d.assembly(wallId)!;
  const isl = [...wall.islands].sort((a, b) => b.parts.length - a.parts.length)[0];
  sim.step(5);
  // get realistic Voronoi cells: strike a gypsum sheet and collect the fragment polys
  const g = isl.parts.find((p) => p.matId === "gypsum" && p.volume > 0.01)!;
  const c = d.world.toWorldVec(isl, g.centroid);
  const out: Record<string, unknown> = {};
  d.fracture.budgetMs = 1e9;
  d.strike({ point: new Vector3(c.x, c.y, c.z), dir: new Vector3(1, 0, 0), body: isl.body!, childIndex: -1, mass: 6, speed: 8, sharpness: 1, contactRadius: 0.03, strikerMat: "steel", source: "debug" });
  const frags = [...wall.parts].filter((p) => p.gen > 0);
  out.frags = frags.length;
  const polys = frags.map((p) => p.poly);
  const opts = { density: 700, friction: 0.6, restitution: 0.05, layer: 1 };
  const time = (label: string, n: number, fn: (i: number) => void) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) fn(i);
    out[label] = round((performance.now() - t0) / n, 1000);
  };
  const shapes: any[] = [];
  const reps = 6;
  time("hullShape(ms)", polys.length * reps, (i) => shapes.push(physics.hullShape(polyPoints(polys[i % polys.length]), opts)));
  out.hullPts = round(polys.reduce((a, p) => a + p.verts.length, 0) / polys.length, 10);
  time("polyExtents(ms)", polys.length * reps, (i) => polyExtents(polys[i % polys.length]));
  time("obbBox(ms)", polys.length * reps, (i) => {
    const { ext } = polyExtents(polys[i % polys.length]);
    shapes.push(physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: ext[0], y: ext[1], z: ext[2] }, opts));
  });
  time("bigBox(ms)", 100, () => shapes.push(physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0.3, y: 0.2, z: 0.15 }, opts)));
  time("smallBoxHull8(ms)", 100, () => shapes.push(physics.boxShape({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0.05, y: 0.03, z: 0.02 }, opts)));
  // container edit on the big static island: remove one child + add it back
  const cont = isl.container as any;
  const n0 = isl.childParts.length;
  time("staticRemoveAdd+2setShape(ms)", 20, () => {
    const p = isl.childParts[n0 - 1];
    cont.removeChild(n0 - 1);
    physics.setShape(isl.body!, cont);
    cont.addChild(p.shape);
    physics.setShape(isl.body!, cont);
  });
  time("staticSetShapeOnly(ms)", 20, () => physics.setShape(isl.body!, cont));
  // body creation + mesh build
  const nodes: any[] = [];
  time("createIsland(ms)", 30, (i) => {
    const p = frags[i % frags.length];
    void p;
  });
  const geoms = frags.map((p) => d.world.partGeom(p));
  const { TransformNode } = await import("@babylonjs/core");
  const node = new TransformNode("bench", sim.scene);
  let prev: any = null;
  time("buildIsland1(ms)", 40, (i) => {
    prev = sim.render.buildIsland(node, [geoms[i % geoms.length]], prev, "b");
  });
  time("buildIsland10(ms)", 20, (i) => {
    prev = sim.render.buildIsland(node, geoms.slice(0, 10), prev, "b");
  });
  time("partGeom(ms)", frags.length, (i) => {
    const p = frags[i];
    p.geomDirty = true;
    d.world.partGeom(p);
  });
  for (const s of shapes) physics.disposeShape(s);
  void nodes;
  return out;
}
