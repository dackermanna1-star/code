// Core formulas, invariants, robustness, determinism and performance of the damage model.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { MATERIALS, BOND_DEFAULTS, type MaterialId } from "../../src/destruction/model/materials.ts";
import {
  impactEnergy,
  globalFailureEnergy,
  breakoutRadius,
  effectiveEnergy,
  inertialBondDamage,
  fusedStrength,
  bondKindFactor,
  hardness,
  respond,
  type PartOutcome,
} from "../../src/destruction/model/damage.ts";
import { polyVolume } from "../../src/geom/poly.ts";
import { dentDepthAt } from "../../src/destruction/model/util.ts";
import { Rng } from "../../src/core/rng.ts";
import { makePart, box, hit, v, bond, strikeEnergy, dropEnergy, applyOutcome } from "./damage-helpers.ts";

const close = (a: number, b: number, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} ≈ ${b}`);

test("impactEnergy: reduced mass, static sides, stiffness shares, loss blend", () => {
  const steel = MATERIALS.steel,
    glass = MATERIALS.glass,
    foam = MATERIALS.foam;
  const a = impactEnergy(10, 2, 3, steel, steel);
  close(a.mu, 1.2);
  close(a.shareA, 0.5);
  close(a.E, (0.8 * 100) / 2.4);
  const s = impactEnergy(10, 2, Infinity, steel, null); // rigid world
  close(s.mu, 2);
  close(s.shareA, 0.5); // steel k=10 vs world k=10
  close(impactEnergy(10, Infinity, 4, steel, steel).mu, 4);
  assert.equal(impactEnergy(10, Infinity, Infinity, steel, steel).E, 0);
  // softer side absorbs more, and its high loss dominates
  const f = impactEnergy(5, 1, Infinity, foam, glass);
  assert.ok(f.shareA > 0.95);
  assert.ok(f.E > 0.95 * (25 / 2) * 0.9);
  for (const bad of [NaN, -1, 0, Infinity]) assert.equal(impactEnergy(bad, 1, 1, steel, glass).E, 0);
  assert.ok(Number.isFinite(impactEnergy(1, NaN, 1, steel, glass).E));
});

test("globalFailureEnergy: formula, supported rule, ductile/soft infinite, slender parts weaker", () => {
  const pane = makePart("glass", box(1, 1.2, 0.004));
  const V = 0.0048;
  const expect = Math.max((MATERIALS.glass.u * V) / 4, 3500 * (V / 1.2));
  close(globalFailureEnergy(pane), expect, 1e-6);
  assert.ok(globalFailureEnergy(makePart("glass", box(1, 1.2, 0.004), { supported: true })) < Infinity, "glass ignores supported");
  assert.equal(globalFailureEnergy(makePart("gypsum", box(1.2, 2.4, 0.0125), { supported: true })), Infinity);
  assert.equal(globalFailureEnergy(makePart("steelSheet", box(0.5, 0.001, 0.4))), Infinity);
  assert.equal(globalFailureEnergy(makePart("foam", box(0.5, 0.1, 0.5))), Infinity);
  // same volume: a slender rod snaps more easily than a cube
  const rod = makePart("hardwood", box(0.8, 0.02, 0.02));
  const cube = makePart("hardwood", box(0.0685, 0.0685, 0.0685));
  assert.ok(globalFailureEnergy(rod) < globalFailureEnergy(cube));
  // strength multiplier and hollow (mass override) parts
  assert.ok(globalFailureEnergy(makePart("ceramic", box(0.1, 0.1, 0.1), { strength: 2 })) > globalFailureEnergy(makePart("ceramic", box(0.1, 0.1, 0.1))));
  assert.ok(globalFailureEnergy(makePart("ceramic", box(0.1, 0.1, 0.1), { mass: 0.3 })) < globalFailureEnergy(makePart("ceramic", box(0.1, 0.1, 0.1))));
});

test("breakoutRadius solves E = G·2πr·min(t, r) on both branches", () => {
  const p = makePart("gypsum", box(1, 1, 0.0125));
  const G = MATERIALS.gypsum.G;
  for (const E of [0.5, 5, 50, 500]) {
    for (const t of [0.0125, 0.2]) {
      const r = breakoutRadius(p, E, t);
      close(G * 2 * Math.PI * r * Math.min(t, r), E, 1e-9);
    }
  }
  assert.equal(breakoutRadius(p, 0, 0.01), 0);
  assert.equal(breakoutRadius(p, NaN, 0.01), 0);
  assert.equal(breakoutRadius(makePart("steel", box(0.1, 0.1, 0.1)), 100, 0.1), 0);
});

test("effectiveEnergy: fatigue near damage points, none far away, saturating", () => {
  const p = makePart("ceramic", box(0.3, 0.3, 0.01));
  assert.equal(effectiveEnergy(p, v(0, 0, 0), 5), 5);
  p.dmg = [{ p: v(0, 0, 0.005), e: 3 }];
  const near = effectiveEnergy(p, v(0, 0, 0.005), 5);
  const far = effectiveEnergy(p, v(0.14, 0.14, 0.005), 5);
  assert.ok(near > 5);
  assert.equal(far, 5);
  p.dmg = [{ p: v(0, 0, 0.005), e: 1e9 }];
  assert.ok(Number.isFinite(effectiveEnergy(p, v(0, 0, 0.005), 5)));
});

test("bond helpers: inertial loading, kind factors, fused strength, hardness", () => {
  const d = inertialBondDamage(10, 5, [
    { id: 1, farMass: 1, kind: "glue" },
    { id: 2, farMass: 4, kind: "bolt" },
  ]);
  close(d[0].amount, ((100 * 1) / 50) * bondKindFactor("glue"));
  close(d[1].amount, ((100 * 4) / 50) * bondKindFactor("bolt"));
  assert.deepEqual(inertialBondDamage(10, Infinity, [{ id: 1, farMass: 1, kind: "glue" }]), []);
  assert.deepEqual(inertialBondDamage(0, 5, [{ id: 1, farMass: 1, kind: "glue" }]), []);
  for (const k of Object.keys(BOND_DEFAULTS)) {
    const f = bondKindFactor(k as never);
    assert.ok(f > 0 && f <= 1.5, k);
  }
  assert.ok(bondKindFactor("nail") > bondKindFactor("bolt"));
  // a mug seam (3 cm × 5 mm) holds handling knocks but is weaker than the tile itself
  const seam = fusedStrength(MATERIALS.ceramic, 0.03 * 0.005);
  assert.ok(seam > 0.3 && seam < 2, `seam ${seam}`);
  assert.ok(fusedStrength(MATERIALS.ceramic, 1e-4, 2) > fusedStrength(MATERIALS.ceramic, 1e-4));
  assert.ok(fusedStrength(MATERIALS.steel, 1e-4) > 0 && fusedStrength(MATERIALS.foam, 1e-4) > 0);
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const h = hardness(id);
    assert.ok(h >= 0 && h <= 1, id);
  }
  assert.ok(hardness("concrete") > hardness("softwood") && hardness("softwood") > hardness("gypsum") && hardness("gypsum") > hardness("foam"));
});

function checkPlan(o: PartOutcome, partVolume: number, nBonds: number): void {
  const fp = o.fracture!;
  assert.ok(fp.cells.length >= 2);
  let vsum = 0;
  for (const c of fp.cells) {
    assert.ok(c.volume > 0 && Number.isFinite(c.volume));
    assert.ok(Number.isFinite(c.kick.x + c.kick.y + c.kick.z));
    if (c.role === "remain") assert.equal(Math.hypot(c.kick.x, c.kick.y, c.kick.z), 0);
    if (c.role !== "remain") assert.ok(Math.hypot(c.kick.x, c.kick.y, c.kick.z) <= 8);
    vsum += c.volume;
  }
  if (fp.mode !== "dice") close(vsum, partVolume, 1e-4);
  let broken = 0;
  for (const c of fp.cells) if (c.role !== "remain") broken += c.volume;
  close(fp.brokenVolume, broken, 1e-6);
  for (const b of fp.internalBonds) {
    assert.equal(fp.cells[b.a].role, "remain");
    assert.equal(fp.cells[b.b].role, "remain");
    assert.ok(b.strength > 0 && Number.isFinite(b.strength));
  }
  assert.equal(fp.bondTransfer.length, nBonds);
  for (const t of fp.bondTransfer) assert.ok(t.cell === -1 || fp.cells[t.cell].role === "remain");
}

test("fracture plans: volumes tile the part, roles/bonds/kicks consistent for every mode", () => {
  const cases: Array<[MaterialId, number, number, number, number, number]> = [
    // mat, sx, sy, sz, energy, contact
    ["glass", 0.6, 0.8, 0.004, 60, 0.015],
    ["ceramic", 0.3, 0.2, 0.01, 40, 0.015],
    ["gypsum", 1.2, 2.4, 0.0125, 40, 0.04],
    ["concrete", 0.4, 0.4, 0.2, 3000, 0.03],
    ["softwood", 0.8, 0.02, 0.4, 300, 0.03],
    ["plastic", 0.3, 0.2, 0.002, 60, 0.015],
    ["temperedGlass", 0.5, 0.5, 0.006, 400, 0.03],
    ["mdf", 0.6, 0.4, 0.018, 120, 0.015],
  ];
  for (const [mat, sx, sy, sz, E, rc] of cases) {
    const bonds = [bond(1, "screw", v(sx / 2, 0, 0), 50), bond(2, "screw", v(-sx / 2, sy / 2, 0), 50), bond(3, "glue", v(0, -sy / 2, 0), 50)];
    const p = makePart(mat, box(sx, sy, sz), { bonds, supported: mat === "gypsum", grain: mat === "softwood" ? v(1, 0, 0) : undefined });
    const o = hit(p, v(0.02, 0.01, sz / 2), v(0, 0, -1), E, { contact: rc });
    assert.ok(o.fracture, `${mat} fractures at ${E} J`);
    checkPlan(o, polyVolume(p.poly), bonds.length);
  }
});

test("crater on a thick part only removes material near the surface", () => {
  const p = makePart("concrete", box(0.6, 0.6, 0.2));
  const o = hit(p, v(0, 0, 0.1), v(0, 0, -1), 2000, { contact: 0.03 });
  assert.ok(o.fracture && !o.fracture.global);
  checkPlan(o, polyVolume(p.poly), 0);
  assert.ok(o.fracture.brokenVolume < 0.02 * polyVolume(p.poly));
  for (const c of o.fracture.cells) if (c.role !== "remain") assert.ok(c.centroid.z > 0.02, "debris comes from the surface");
  // spall flies back out of the wall
  const loose = o.fracture.cells.filter((c) => c.role !== "remain");
  assert.ok(loose.reduce((s, c) => s + c.kick.z, 0) > 0);
});

test("robustness: degenerate inputs never throw or produce NaN", () => {
  const p = makePart("ceramic", box(0.2, 0.2, 0.01));
  const imps = [
    { point: v(NaN, 0, 0), dir: v(0, 0, -1), energy: 10 },
    { point: v(0, 0, 0.005), dir: v(0, 0, 0), energy: 10 },
    { point: v(5, 5, 5), dir: v(1, 1, 1), energy: 10 },
    { point: v(0, 0, 0.005), dir: v(0, 0, -1), energy: NaN },
    { point: v(0, 0, 0.005), dir: v(0, 0, -1), energy: -5 },
    { point: v(0, 0, 0.005), dir: v(0, 0, -1), energy: 1e7 },
  ];
  for (const i of imps) {
    const o = respond(p, { ...i, impulse: NaN, islandMass: NaN, contactRadius: NaN, sharpness: NaN, strike: true }, new Rng(1));
    assert.ok(Number.isFinite(o.absorbed));
    for (const d of o.dmg) assert.ok(Number.isFinite(d.e) && Number.isFinite(d.p.x));
    for (const b of o.bondDamage) assert.ok(Number.isFinite(b.amount));
    for (const c of o.chips) assert.ok(Number.isFinite(c.p.x + c.v.x + c.size));
    if (o.fracture) for (const c of o.fracture.cells) assert.ok(Number.isFinite(c.volume + c.kick.x));
  }
  // every material responds sanely to a mid-size hit
  for (const id of Object.keys(MATERIALS) as MaterialId[]) {
    const q = makePart(id, box(0.3, 0.2, 0.02), { bonds: [bond(1, "glue", v(0.15, 0, 0), 40)] });
    const o = hit(q, v(0, 0, 0.01), v(0, 0, -1), 80, { contact: 0.02 });
    assert.ok(Number.isFinite(o.absorbed) && o.absorbed > 0, id);
    assert.ok(o.dmg.length <= 16);
  }
});

test("determinism: same inputs and seed → identical outcome", () => {
  const mk = () => makePart("glass", box(1, 1, 0.004), { id: 7, bonds: [bond(1, "glue", v(0.5, 0, 0), 10)] });
  const a = hit(mk(), v(0.1, 0.2, 0.002), v(0, 0, -1), 40, { contact: 0.015, seed: 99 });
  const b = hit(mk(), v(0.1, 0.2, 0.002), v(0, 0, -1), 40, { contact: 0.015, seed: 99 });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  const c = hit(mk(), v(0.1, 0.2, 0.002), v(0, 0, -1), 40, { contact: 0.015, seed: 100 });
  assert.notDeepEqual(JSON.parse(JSON.stringify(a.fracture!.cells.map((x) => x.centroid))), JSON.parse(JSON.stringify(c.fracture!.cells.map((x) => x.centroid))));
});

test("damage memory: merged near the same spot, capped, endurance limit for tiny knocks", () => {
  const p = makePart("ceramic", box(0.4, 0.3, 0.01));
  for (let k = 0; k < 5; k++) p.dmg = hit(p, v(0.001 * k, 0, 0.005), v(0, 0, -1), 1, { seed: k }).dmg;
  assert.equal(p.dmg.length, 1, "same spot merges");
  const q = makePart("ceramic", box(0.4, 0.3, 0.01));
  q.dmg = hit(q, v(0, 0, 0.005), v(0, 0, -1), 0.0005).dmg;
  assert.equal(q.dmg.length, 0, "a feather touch leaves no fatigue");
  const r = makePart("concrete", box(2, 2, 0.2));
  for (let k = 0; k < 40; k++) r.dmg = hit(r, v(-0.95 + (k % 8) * 0.27, -0.9 + Math.floor(k / 8) * 0.4, 0.1), v(0, 0, -1), 50, { seed: k }).dmg;
  assert.ok(r.dmg.length <= 16);
});

test("bond damage: nearest bonds take most; tiny loads below the endurance limit do nothing", () => {
  const p = makePart("mdf", box(0.6, 0.4, 0.018), { bonds: [bond(1, "screw", v(0.3, 0, 0), 70), bond(2, "screw", v(-0.3, 0, 0), 70)] });
  const o = hit(p, v(0.25, 0, 0.009), v(0, 0, -1), 20, { contact: 0.02 });
  const m = new Map(o.bondDamage.map((b) => [b.bondId, b.amount]));
  assert.ok((m.get(1) ?? 0) > (m.get(2) ?? 0));
  const t = hit(p, v(0.25, 0, 0.009), v(0, 0, -1), 0.5, { contact: 0.02 });
  assert.equal(t.bondDamage.length, 0);
});

test("contact radius: a small contact makes a smaller, deeper breakout than a wide one", () => {
  const p = () => makePart("stone", box(1, 1, 0.1));
  const sharp = hit(p(), v(0, 0, 0.05), v(0, 0, -1), 400, { contact: 0.008 });
  const blunt = hit(p(), v(0, 0, 0.05), v(0, 0, -1), 400, { contact: 0.04 });
  assert.ok(sharp.fracture && blunt.fracture && !sharp.fracture.global && !blunt.fracture.global);
  assert.ok(sharp.fracture.radius < blunt.fracture.radius);
});

test("performance: respond < 2 ms, 40-cell plan < 6 ms, full tempered dice < 4 ms (fixed budgets, best of N)", () => {
  // Fixed design budgets (ARCHITECTURE §4.8: the runtime spends ≤ 4 ms per step on plans).
  // Best-of-N batches make the bounds robust against other processes competing for the CPU
  // without relaxing them.
  const bestOf = (batches: number, per: number, fn: (k: number) => void): number => {
    let best = Infinity;
    for (let b = 0; b < batches; b++) {
      const t = performance.now();
      for (let k = 0; k < per; k++) fn(b * per + k);
      best = Math.min(best, (performance.now() - t) / per);
    }
    return best;
  };
  const p = makePart("ceramic", box(0.3, 0.3, 0.01), { bonds: [bond(1, "glue", v(0.15, 0, 0), 40), bond(2, "glue", v(-0.15, 0, 0), 40)] });
  for (let k = 0; k < 50; k++) hit(p, v(0, 0, 0.005), v(0, 0, -1), 1, { seed: k }); // warm-up
  const per = bestOf(5, 100, (k) => hit(p, v(0.01 * (k % 10), 0, 0.005), v(0, 0, -1), 1 + (k % 3), { seed: k }));
  const win = makePart("glass", box(1, 1.2, 0.004));
  let cells = 0;
  for (let k = 0; k < 5; k++) hit(win, v(0.1, 0.1, 0.002), v(0, 0, -1), 300, { seed: k });
  const glass = bestOf(15, 1, (k) => {
    cells = Math.max(cells, hit(win, v(0.1, 0.1, 0.002), v(0, 0, -1), 300, { seed: 100 + k }).fracture?.cells.length ?? 0);
  });
  // the largest dice in the apartment: a 0.9 × 1.9 m tempered shower panel
  const shower = makePart("temperedGlass", box(0.9, 1.9, 0.008), { bonds: [bond(1, "clip", v(-0.45, 0.6, 0), 50), bond(2, "clip", v(-0.45, -0.6, 0), 50)] });
  let micro = 0;
  for (let k = 0; k < 3; k++) hit(shower, v(0, 0, 0.004), v(0, 0, -1), 250, { contact: 0.03, seed: k });
  const dice = bestOf(15, 1, (k) => {
    const o = hit(shower, v(0, 0, 0.004), v(0, 0, -1), 250, { contact: 0.03, seed: 50 + k });
    micro = Math.max(micro, o.fracture?.cells.filter((c) => c.role === "micro").length ?? 0);
  });
  console.log(`respond (no fracture): ${per.toFixed(3)} ms; ${cells}-cell glass plan: ${glass.toFixed(2)} ms; dice (${micro} cubes): ${dice.toFixed(2)} ms`);
  assert.ok(per < 2, `respond ${per} ms`);
  assert.ok(glass < 6, `glass plan ${glass} ms`);
  assert.ok(dice < 4, `dice plan ${dice} ms`);
  assert.ok(cells >= 35);
  assert.ok(micro >= 500, `dice produced ${micro} cubes`);
});

test("dents: accumulated depth never exceeds the cap; the dent widens instead; crumple events are rate-limited", () => {
  const panel = makePart("steelSheet", box(0.5, 0.0008, 0.35));
  const cap = Math.min(MATERIALS.steelSheet.maxDent * 0.0008, 0.5 * 0.35);
  const E = dropEnergy(15, 5, "steelSheet", "concrete");
  const P = v(0.1, 0.0004, 0.05);
  let events = 0;
  const gridMax = (): number => {
    let m = 0;
    for (let x = -0.25; x <= 0.25; x += 0.01) for (let z = -0.175; z <= 0.175; z += 0.01) m = Math.max(m, dentDepthAt(panel.dents, v(x, 0, z)));
    return m;
  };
  let wide5 = 0;
  for (let k = 0; k < 30; k++) {
    const o = hit(panel, P, v(0, -1, 0), E, { strike: false, islandMass: 15, seed: k });
    if (o.crumpled) events++;
    applyOutcome(panel, o);
    assert.ok(dentDepthAt(panel.dents, P) <= cap * 1.0001, `hit ${k + 1}: depth ${dentDepthAt(panel.dents, P)} > cap ${cap}`);
    if (k === 4) wide5 = panel.dents.reduce((m, d) => Math.max(m, Math.hypot(d.p.x - P.x, d.p.z - P.z) + d.r), 0);
  }
  assert.ok(gridMax() <= 1.06 * cap, `max displacement ${gridMax()} vs cap ${cap}`);
  const wide30 = panel.dents.reduce((m, d) => Math.max(m, Math.hypot(d.p.x - P.x, d.p.z - P.z) + d.r), 0);
  assert.ok(wide30 > 1.3 * wide5, `dented area widens (${wide5.toFixed(3)} → ${wide30.toFixed(3)} m)`);
  assert.ok(events >= 1 && events <= 5, `crumple events ${events} (not one per hit)`);
  // a plastic casing dent obeys its cap too
  const cas = makePart("plastic", box(0.3, 0.2, 0.002));
  const capP = Math.min(MATERIALS.plastic.maxDent * 0.002, 0.1);
  for (let k = 0; k < 30; k++) applyOutcome(cas, hit(cas, v(0.05, 0.03, 0.001), v(0, 0, -1), 4, { contact: 0.015, seed: k }));
  assert.ok(dentDepthAt(cas.dents, v(0.05, 0.03, 0.001)) <= capP * 1.0001);
});

test("fatigue: knocks below the endurance limit never accumulate; memory never exceeds delivered energy", () => {
  const cases: Array<[string, () => ReturnType<typeof makePart>, ReturnType<typeof v>, number]> = [
    ["window", () => makePart("glass", box(1, 1.2, 0.004)), v(0.1, 0.1, 0.002), 0.03],
    ["plate", () => makePart("ceramic", box(0.25, 0.25, 0.006)), v(0.02, 0.02, 0.003), 0.03],
    ["drywall", () => makePart("gypsum", box(1.2, 2.4, 0.0125), { supported: true }), v(0.1, 0.2, 0.00625), 0.03],
  ];
  for (const [name, mk, P, frac] of cases) {
    // threshold of a passive knock: smallest energy that fractures the virgin part
    let lo = 0,
      hi = 500;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (hit(mk(), P, v(0, 0, -1), mid, { strike: false, seed: 1 }).fracture) hi = mid;
      else lo = mid;
    }
    const e = frac * hi;
    const p = mk();
    for (let k = 0; k < 500; k++) {
      const o = hit(p, P, v(0, 0, -1), e, { strike: false, seed: k });
      assert.equal(o.fracture, null, `${name}: tap ${k + 1} at ${(frac * 100).toFixed(0)} % of the threshold broke it`);
      applyOutcome(p, o);
    }
    assert.equal(p.dmg.length, 0, `${name}: no memory below the endurance limit`);
    // above the limit, memory is the raw delivered energy (never amplified)
    const q = mk();
    let delivered = 0;
    for (let k = 0; k < 30; k++) {
      const o = hit(q, P, v(0, 0, -1), 0.3 * hi, { strike: false, seed: k });
      delivered += 0.3 * hi;
      applyOutcome(q, o);
      if (o.fracture) break;
      const remembered = q.dmg.reduce((s, d) => s + d.e, 0);
      assert.ok(remembered <= delivered * 1.000001, `${name}: remembered ${remembered} > delivered ${delivered}`);
    }
  }
});
