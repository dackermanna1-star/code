// End-to-end: the real Player (+ real ToolSystem) against the real physics module and the real
// destruction system with reference objects (microwave, coffee table, chair, mug). A minimal mesh
// builder stands in for the render system. Exercises target info, grab + full-power throw of the
// microwave onto the floor, a sledgehammer swing at the coffee table, a landing stomp on it, walking
// over the mug, and the use key on the microwave door. Reports the destruction events produced.
import { Color3, Mesh, StandardMaterial, VertexData, type TransformNode } from "@babylonjs/core";
import type { IslandMeshes } from "../../src/core/context.ts";
import type { RenderGeom } from "../../src/geom/meshgen.ts";
import { FIXED_DT } from "../../src/core/time.ts";
import { Destruction } from "../../src/destruction/destructionSystem.ts";
import { buildObject } from "../../src/objects/registry.ts";
import { Player } from "../../src/player/player.ts";
import { makeWorld, key, r2, renderFrames } from "./player-util.ts";

export async function probe() {
  const w = await makeWorld();
  const scene = w.scene;
  // ---- minimal island mesh builder (vertex-coloured, unlit-ish)
  const mat = new StandardMaterial("islandMat", scene);
  mat.backFaceCulling = false;
  mat.specularColor = new Color3(0.08, 0.08, 0.08);
  const render = w.ctx.render as unknown as Record<string, unknown>;
  render.buildIsland = (node: TransformNode, geoms: RenderGeom[], prev: IslandMeshes | null, name: string): IslandMeshes => {
    if (prev?.opaque) prev.opaque.dispose();
    let nv = 0, ni = 0;
    for (const g of geoms) {
      nv += g.vertexCount;
      ni += g.indices.length;
    }
    if (!nv) return { opaque: null, glass: null };
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 4), idx = new Uint32Array(ni);
    let v = 0, k = 0;
    for (const g of geoms) {
      pos.set(g.positions.subarray(0, g.vertexCount * 3), v * 3);
      nor.set(g.normals.subarray(0, g.vertexCount * 3), v * 3);
      for (let i = 0; i < g.vertexCount; i++) {
        const t = g.tint[i];
        col[(v + i) * 4] = ((t >> 16) & 255) / 255;
        col[(v + i) * 4 + 1] = ((t >> 8) & 255) / 255;
        col[(v + i) * 4 + 2] = (t & 255) / 255;
        col[(v + i) * 4 + 3] = 1;
      }
      for (let i = 0; i < g.indices.length; i++) idx[k + i] = g.indices[i] + v;
      v += g.vertexCount;
      k += g.indices.length;
    }
    const m = new Mesh(name, scene);
    const vd = new VertexData();
    vd.positions = pos;
    vd.normals = nor;
    vd.colors = col;
    vd.indices = idx;
    vd.applyToMesh(m);
    m.material = mat;
    m.parent = node;
    m.isPickable = false;
    return { opaque: m, glass: null };
  };
  render.disposeIsland = (m: IslandMeshes) => {
    m.opaque?.dispose();
    m.glass?.dispose();
  };

  const destruction = new Destruction(w.ctx as never);
  (w.ctx as { destruction: unknown }).destruction = destruction;
  const counts: Record<string, number> = {};
  for (const ev of ["impact", "fracture", "chip", "crack", "dent", "bondBreak", "split", "damage", "toolHit", "footstep", "land", "grab", "throw", "drop", "strain"] as const) {
    counts[ev] = 0;
    w.events.on(ev, () => counts[ev]++);
  }
  let billTotal = 0;
  w.events.on("damage", (e) => (billTotal += e.valueLost));

  w.box("floor", [14, 0.2, 14], [0, -0.1, 0], { color: new Color3(0.5, 0.42, 0.33) });
  const I = { x: 0, y: 0, z: 0, w: 1 };
  const ids = {
    microwave: destruction.spawn(buildObject("microwave"), { p: { x: 0, y: 0, z: 1.4 }, q: I }),
    table: destruction.spawn(buildObject("coffeeTable"), { p: { x: 3, y: 0, z: 1.2 }, q: I }),
    chair: destruction.spawn(buildObject("chair"), { p: { x: -2.5, y: 0, z: 1.5 }, q: I }),
    mug: destruction.spawn(buildObject("mug"), { p: { x: -1.2, y: 0, z: -1.2 }, q: I }),
  };

  const p = new Player(w.ctx);
  (w.ctx as { player: unknown }).player = p;
  w.input.setEnabled(true);
  w.input.setFallback(true);
  const step = (n: number) => {
    for (let i = 0; i < n; i++) {
      w.input.update();
      p.fixedUpdate(FIXED_DT);
      destruction.beforePhysics(FIXED_DT);
      w.physics.step(FIXED_DT);
      destruction.afterPhysics(FIXED_DT);
      w.ctx.time.tick();
      if (i % 2 === 0) {
        destruction.update(FIXED_DT * 2);
        p.update(FIXED_DT * 2);
      }
    }
  };
  const snapCounts = () => ({ ...counts });
  const diff = (a: Record<string, number>) => Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v - (a[k] ?? 0)]).filter(([, v]) => (v as number) > 0));
  const out: Record<string, unknown> = { spawned: destruction.list().map((a) => ({ type: a.type, parts: a.parts, islands: a.islands })) };
  step(60); // settle

  // ---- target info + grab + throw the microwave at the floor
  p.teleport({ x: 0, y: 1.65, z: 0.3 }, 0, Math.atan2(1.65 - 0.15, 1.1));
  step(5);
  const t = p.target;
  out.microwaveTarget = t ? { name: t.assemblyName, part: t.partName, mat: t.mat, mass: r2(t.mass), grabbable: t.grabbable, isStatic: t.isStatic, usable: t.usable } : null;
  p.debugAction("grab");
  const grabbed = p.holding !== null;
  step(40);
  w.input.addLook(0, -300); // lift it up
  step(40);
  const liftedY = p.holding ? r2(p.holding.transformNode.position.y) : null;
  w.input.addLook(0, 420); // look down at the floor
  step(10);
  const c0 = snapCounts();
  p.debugAction("throw", 1);
  step(90);
  const mwInfo = destruction.list().find((a) => a.id === ids.microwave);
  out.microwaveThrow = { grabbed, liftedY, events: diff(c0), damage: mwInfo ? r2(mwInfo.damage) : null, islands: mwInfo?.islands ?? null };

  // ---- sledgehammer swing at the coffee table
  p.setTool("sledgehammer");
  p.teleport({ x: 3, y: 1.65, z: 0.5 }, 0, Math.atan2(1.0 - 0.42, 0.55));
  key("KeyC", true); // crouch: the table top is 1.2 m below a standing eye, beyond the sledge's reach
  step(40);
  const c1 = snapCounts();
  w.input.hold("fire", 0.6);
  const tStart = performance.now();
  while (performance.now() - tStart < 900) {
    step(1);
    await new Promise((r) => setTimeout(r, 6));
  }
  step(60);
  key("KeyC", false);
  const tableInfo = destruction.list().find((a) => a.id === ids.table);
  out.sledgeVsTable = { events: diff(c1), damage: tableInfo ? r2(tableInfo.damage) : null, islands: tableInfo?.islands ?? null };

  // ---- landing stomp on the table top (drop from 2.4 m above it)
  const c2 = snapCounts();
  p.setTool("hands");
  p.teleport({ x: 3.15, y: 0.45 + 2.4 + 1.65, z: 1.2 }, 0, 0.3); // ≈6.9 m/s: well beyond a jump landing
  step(80);
  const table2 = destruction.list().find((a) => a.id === ids.table);
  out.stompTable = { events: diff(c2), damage: table2 ? r2(table2.damage) : null, islands: table2?.islands ?? null };

  // ---- walk over the mug
  const c3 = snapCounts();
  p.teleport({ x: -1.2, y: 1.65, z: 0.3 }, Math.PI, 0);
  step(10);
  key("KeyW", true);
  step(80);
  key("KeyW", false);
  step(20);
  const mugInfo = destruction.list().find((a) => a.id === ids.mug);
  out.walkOverMug = { events: diff(c3), damage: mugInfo ? r2(mugInfo.damage) : null };

  // ---- use (E) on the microwave door, if it is still in one piece
  const c4 = snapCounts();
  const mwPos = destruction.positionOf(ids.microwave);
  if (mwPos) {
    p.teleport({ x: mwPos.x, y: 1.65, z: mwPos.z - 0.9 }, 0, Math.atan2(1.65 - (mwPos.y + 0.15), 0.9));
    step(5);
    const tu = p.target;
    key("KeyE", true);
    step(1);
    key("KeyE", false);
    step(30);
    out.useMicrowave = { target: tu ? { part: tu.partName, usable: tu.usable } : null, events: diff(c4) };
  }

  out.bill = Math.round(billTotal);
  out.stats = destruction.stats();
  // final shot
  p.setTool("crowbar");
  p.teleport({ x: 0.6, y: 1.65, z: -1.6 }, 0.2, 0.32);
  step(30);
  await renderFrames(w, 4, () => p.update(1 / 60));
  return out;
}
