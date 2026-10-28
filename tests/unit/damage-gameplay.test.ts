// Gameplay expectations of the damage model (docs/briefs/destruction-model.md), each with
// realistic part geometry and the energy pipeline the runtime uses (strikeEnergy/dropEnergy).
import { test } from "node:test";
import assert from "node:assert/strict";
import { polyClosestPoint, polyWidth } from "../../src/geom/poly.ts";
import { globalFailureEnergy, type PartOutcome, type PartState } from "../../src/destruction/model/damage.ts";
import { makePart, box, hit, strikeEnergy, dropEnergy, v, bond, mugTiles, applyOutcome, cellPart } from "./damage-helpers.ts";

const roles = (o: PartOutcome): Record<string, number> => {
  const r: Record<string, number> = { remain: 0, loose: 0, micro: 0 };
  for (const c of o.fracture?.cells ?? []) r[c.role]++;
  return r;
};
const IDS = [11, 23, 37, 41, 59, 67, 71, 83];

test("1. drywall: punch ≈ 4–9 cm hole, sledge 15–25 cm, repeated punches grow the hole", () => {
  const sheet = (id: number) => makePart("gypsum", box(1.2, 2.4, 0.0125), { supported: true, id });
  const P = v(0.1, 0.2, 0.00625),
    D = v(0, 0, -1);
  const ePunch = strikeEnergy(60, 1.5, "flesh", "gypsum").E;
  const eSledge = strikeEnergy(200, 6, "steel", "gypsum").E;
  for (const id of IDS) {
    const a = hit(sheet(id), P, D, ePunch, { contact: 0.04, seed: id });
    assert.ok(a.fracture && !a.fracture.global, "punch breaks out locally");
    assert.ok(a.fracture.radius >= 0.04 && a.fracture.radius <= 0.09, `punch radius ${a.fracture.radius}`);
    assert.ok(roles(a).loose + roles(a).micro >= 2 && roles(a).remain >= 3);
    const b = hit(sheet(id), P, D, eSledge, { contact: 0.03, seed: id });
    assert.ok(b.fracture && !b.fracture.global, "sledge breaks out locally (supported sheet)");
    assert.ok(b.fracture.radius >= 0.15 && b.fracture.radius <= 0.25, `sledge radius ${b.fracture.radius}`);
  }
  // three punches at the same spot: each lands on the rim of the existing hole
  for (const id of [1, 2, 3]) {
    let parts: PartState[] = [sheet(id)];
    const V0 = parts[0].volume;
    const areas: number[] = [];
    let nid = 9000;
    for (let k = 0; k < 3; k++) {
      let best = parts[0],
        bd = Infinity,
        bp = P;
      for (const p of parts) {
        const q = polyClosestPoint(p.poly, P);
        const d = Math.hypot(q.x - P.x, q.y - P.y, q.z - P.z);
        if (d < bd) [bd, best, bp] = [d, p, q];
      }
      const o = hit(best, v(bp.x, bp.y, 0.00625), D, ePunch, { contact: 0.04, seed: k + 10 * id });
      applyOutcome(best, o);
      if (o.fracture) {
        parts = parts.filter((p) => p !== best);
        for (const c of o.fracture.cells) if (c.role === "remain") parts.push(cellPart(best, c, nid++));
      }
      areas.push((V0 - parts.reduce((s, p) => s + p.volume, 0)) / 0.0125);
    }
    assert.ok(areas[1] > areas[0] && areas[2] > areas[1], `hole grows: ${areas.map((a) => (a * 1e4).toFixed(0)).join(" → ")} cm²`);
    assert.ok(areas[2] >= 1.8 * areas[0]);
  }
});

test("2. annealed window: hammer shatters radially (shards stay at bonded edges), 5 J only cracks", () => {
  const pane = (id: number) =>
    makePart("glass", box(1.0, 1.2, 0.004), {
      id,
      bonds: [bond(1, "glue", v(0.5, 0.3, 0), 10), bond(2, "glue", v(-0.5, -0.2, 0), 10), bond(3, "glue", v(0.1, 0.6, 0), 10), bond(4, "glue", v(-0.2, -0.6, 0), 10)],
    });
  const eh = strikeEnergy(70, 0.9, "steel", "glass").E;
  for (const id of IDS) {
    const o = hit(pane(id), v(0.1, 0.1, 0.002), v(0, 0, -1), eh, { contact: 0.015, seed: id });
    assert.ok(o.fracture?.global, "global shatter");
    assert.equal(o.fracture.mode, "shatter");
    const r = roles(o);
    const n = o.fracture.cells.length;
    assert.ok(n >= 15, `radial web has many shards (${n})`);
    assert.ok(r.loose + r.micro >= 0.7 * n, "most shards fall");
    assert.ok(r.remain >= 1 && r.remain <= 4, `a few shards stay at the bonded edges (${r.remain})`);
    assert.ok(o.fracture.bondTransfer.every((t) => t.cell >= 0 && o.fracture!.cells[t.cell].role === "remain"));
    assert.ok(o.bondDamage.length > 0, "bonds of hanging shards are weakened");
    const ball = hit(pane(id), v(0.1, 0.1, 0.002), v(0, 0, -1), 5, { strike: false, seed: id });
    assert.equal(ball.fracture, null, "5 J does not shatter");
    assert.ok(ball.crackSeverity > 0 && ball.addCracks.length > 0, "5 J cracks");
  }
});

test("3. mug: a 1 m drop shatters it on tile, it usually survives on a wooden floor", () => {
  const tiles = mugTiles();
  const wall = tiles.filter((t) => polyWidth(t, v(0, 1, 0)) > 0.02); // side wall tiles (landing on its side)
  const eTile = dropEnergy(0.35, 4.43, "ceramic", "tile");
  const eWood = dropEnergy(0.35, 4.43, "ceramic", "softwood");
  let bt = 0,
    bw = 0;
  const N = 60;
  for (let i = 0; i < N; i++) {
    const t = wall[i % wall.length];
    const mk = () => makePart("ceramic", t, { id: 100 + i * 13 });
    const p = mk().centroid;
    const dir = v(p.x, 0, p.z); // into the wall tile from outside
    if (hit(mk(), polyClosestPoint(t, v(p.x * 2, p.y, p.z * 2)), dir, eTile, { strike: false, seed: i }).fracture) bt++;
    if (hit(mk(), polyClosestPoint(t, v(p.x * 2, p.y, p.z * 2)), dir, eWood, { strike: false, seed: i }).fracture) bw++;
  }
  assert.ok(bt / N >= 0.8, `tile floor breaks ${bt}/${N}`);
  assert.ok(bw / N <= 0.35, `wood floor breaks ${bw}/${N}`);
});

test("4. microwave steel panel dropped at 5 m/s on concrete: 1–3 cm dent, weld damage, crumples", () => {
  const welds = () => [bond(1, "weld", v(0.25, 0, 0), 70), bond(2, "weld", v(-0.25, 0, 0), 70), bond(3, "weld", v(0, 0, 0.175), 70), bond(4, "weld", v(0, 0, -0.175), 70)];
  const panel = makePart("steelSheet", box(0.5, 0.0008, 0.35), { bonds: welds() });
  const E = dropEnergy(15, 5, "steelSheet", "concrete");
  const o = hit(panel, v(0.1, 0.0004, 0.05), v(0, -1, 0), E, { strike: false, islandMass: 15 });
  assert.ok(o.dentDepth >= 0.01 && o.dentDepth <= 0.03, `dent ${o.dentDepth}`);
  assert.equal(o.fracture, null);
  const near = Math.max(...o.bondDamage.map((b) => b.amount));
  assert.ok(near >= 0.2 * 70, `weld damage ${near}`);
  applyOutcome(panel, o);
  let crumpled = false;
  for (let k = 1; k < 6 && !crumpled; k++) {
    const r = hit(panel, v(0.1, 0.0004, 0.05), v(0, -1, 0), E, { strike: false, islandMass: 15, seed: k });
    crumpled = r.crumpled;
    applyOutcome(panel, r);
  }
  assert.ok(crumpled, "repeated hits crumple the panel");
  assert.ok(panel.bonds.some((b) => b.health <= 0), "a weld popped");
});

test("5. pine table top: hammer cracks first, breaks out after several hits; charged sledge snaps it along the grain", () => {
  const top = (id: number) => makePart("softwood", box(1.2, 0.025, 0.7), { grain: v(1, 0, 0), id });
  const eh = strikeEnergy(70, 0.9, "steel", "softwood", 25).E;
  for (const id of IDS) {
    const t = top(id);
    let hits = 0;
    let firstCrack = -1;
    for (let k = 0; k < 12; k++) {
      const o = hit(t, v(0.2, 0.0125, 0.1), v(0, -1, 0), eh, { contact: 0.015, seed: k + id });
      hits++;
      if (o.crackSeverity > 0 && firstCrack < 0) firstCrack = k;
      applyOutcome(t, o);
      if (o.fracture) {
        assert.equal(o.fracture.global, false, "a hammer never snaps the whole top");
        break;
      }
    }
    assert.equal(firstCrack, 0, "the first hit cracks");
    assert.ok(hits >= 2 && hits <= 6, `breakout after ${hits} hits`);
  }
  const es = strikeEnergy(300, 6, "steel", "softwood", 25).E;
  for (const id of IDS) {
    const o = hit(top(id), v(0, 0.0125, 0), v(0, -1, 0), es, { contact: 0.03, seed: id });
    assert.ok(o.fracture?.global, "charged sledge snaps the top");
    assert.equal(o.fracture.mode, "splinter");
    let along = 0,
      across = 0;
    for (const c of o.fracture.cells) {
      along += polyWidth(c.poly, v(1, 0, 0));
      across += polyWidth(c.poly, v(0, 0, 1));
    }
    assert.ok(along > 1.3 * across, `pieces elongated along the grain (${along.toFixed(2)} vs ${across.toFixed(2)})`);
  }
});

test("6. concrete wall: a sledge only chips; a small crater needs many hits", () => {
  for (const id of IDS.slice(0, 4)) {
    const wall = makePart("concrete", box(0.8, 0.8, 0.2), { id });
    const E = strikeEnergy(200, 6, "steel", "concrete").E;
    let n = 0;
    let first: PartOutcome | null = null;
    let frac: PartOutcome | null = null;
    for (let k = 0; k < 40 && !frac; k++) {
      const o = hit(wall, v(0, 0, 0.1), v(0, 0, -1), E, { contact: 0.03, seed: k + id });
      first ??= o;
      n++;
      applyOutcome(wall, o);
      if (o.fracture) frac = o;
    }
    assert.equal(first!.fracture, null);
    assert.ok(first!.chips.length > 0, "chips fly");
    assert.ok(frac && !frac.fracture!.global, "eventually a local crater");
    assert.ok(n >= 5, `needs many hits (${n})`);
    assert.ok(frac!.fracture!.radius <= 0.05, `small crater ${frac!.fracture!.radius}`);
  }
});

test("7. tempered shower panel: survives a mid hammer blow, dices near an edge or at 300 J", () => {
  const panel = (id: number) => makePart("temperedGlass", box(0.9, 1.9, 0.008), { id });
  const eh = strikeEnergy(70, 0.9, "steel", "temperedGlass").E;
  const e3 = strikeEnergy(300, 6, "steel", "temperedGlass").E;
  for (const id of IDS.slice(0, 4)) {
    const mid = hit(panel(id), v(0, 0, 0.004), v(0, 0, -1), eh, { contact: 0.015, seed: id });
    assert.equal(mid.fracture, null, "mid-panel hammer: survives");
    const edge = hit(panel(id), v(0.43, 0.3, 0.004), v(0, 0, -1), eh, { contact: 0.015, seed: id });
    assert.ok(edge.fracture?.global && edge.fracture.mode === "dice", "edge hit dices");
    assert.ok(roles(edge).micro > 100, "hundreds of cubes");
    const big = hit(panel(id), v(0, 0, 0.004), v(0, 0, -1), e3, { contact: 0.03, seed: id });
    assert.ok(big.fracture?.global && big.fracture.mode === "dice", "300 J dices");
  }
});

test("8. soft goods never fracture from blunt hits; an axe tears them", () => {
  for (const mat of ["foam", "fabric", "rubber"] as const) {
    const p = makePart(mat, box(0.5, 0.12, 0.5));
    for (let k = 0; k < 10; k++) {
      const o = hit(p, v(0, 0.06, 0), v(0, -1, 0), 400, { contact: 0.03, seed: k });
      assert.equal(o.fracture, null);
      assert.equal(o.crackSeverity, 0);
      applyOutcome(p, o);
    }
  }
  const cushion = makePart("fabric", box(0.5, 0.12, 0.5));
  const ea = strikeEnergy(109, 1.8, "steel", "fabric").E;
  const o = hit(cushion, v(0, 0.06, 0), v(0, -1, 0), ea, { contact: 0.012, sharp: 2.2 });
  assert.ok(o.crackSeverity > 0 && o.chips.length > 0, "axe tears (tear line + fluff)");
});

test("9. softwood stud: an axe splinters it, a punch does almost nothing", () => {
  for (const id of IDS) {
    const stud = () => makePart("softwood", box(0.038, 2.4, 0.089), { grain: v(0, 1, 0), id });
    const ea = strikeEnergy(120, 1.8, "steel", "softwood").E;
    const a = hit(stud(), v(0, 0.3, 0.0445), v(0, 0, -1), ea, { contact: 0.012, sharp: 2.2, seed: id });
    assert.ok(a.fracture && a.fracture.mode === "splinter", "axe splinters");
    assert.ok(a.fracture.brokenVolume > 0);
    const ep = strikeEnergy(60, 1.5, "flesh", "softwood").E;
    const p = hit(stud(), v(0, 0.3, 0.0445), v(0, 0, -1), ep, { contact: 0.04, seed: id });
    assert.equal(p.fracture, null);
    assert.equal(p.crackSeverity, 0);
  }
});

test("10. thin ABS casing cracks into 2–5 pieces at 40–80 J", () => {
  const casing = (id: number) => makePart("plastic", box(0.3, 0.2, 0.002), { id });
  for (const id of IDS) {
    for (const E of [40, 60, 80]) {
      const o = hit(casing(id), v(0.05, 0.03, 0.001), v(0, 0, -1), E, { contact: 0.015, seed: id });
      assert.ok(o.fracture?.global && o.fracture.mode === "crack", `${E} J cracks the casing`);
      const pieces = o.fracture.cells.filter((c) => c.role !== "micro").length;
      assert.ok(pieces >= 2 && pieces <= 5, `${pieces} pieces`);
    }
    assert.equal(hit(casing(id), v(0.05, 0.03, 0.001), v(0, 0, -1), 10, { contact: 0.015 }).fracture, null, "10 J does not");
  }
  assert.ok(globalFailureEnergy(casing(1)) > 10);
});
